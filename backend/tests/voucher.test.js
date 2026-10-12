const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const migrate = require('../src/scripts/migrate');
const { seedUsers, PASSWORD } = require('../src/scripts/seed');
const { makeSignaturePng } = require('../src/scripts/signaturePng');

const png = makeSignaturePng(3);
const tokens = {};

const login = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return res.body.token;
};
const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

const validBody = {
  department: 'Engineering',
  title: 'Taxi to client',
  category: 'Travel',
  amount: '450.75',
  expenseDate: '2026-01-10',
  description: 'Airport to office',
};

// Creates a voucher via multipart, optionally with a signature.
const createVoucher = (who, { sig = true, overrides = {} } = {}) => {
  let r = request(app).post('/api/vouchers').set(as(who));
  Object.entries({ ...validBody, ...overrides }).forEach(([k, v]) => { r = r.field(k, v); });
  if (sig) r = r.attach('signature', png, { filename: 'sig.png', contentType: 'image/png' });
  return r;
};

const submitted = async (who = 'priya') => {
  const { body } = await createVoucher(who);
  await request(app).post(`/api/vouchers/${body.id}/submit`).set(as(who)).expect(200);
  return body.id;
};

beforeAll(async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seedUsers();
  tokens.priya = await login('priya@abc.com');
  tokens.rahul = await login('rahul@abc.com');
  tokens.director = await login('director@abc.com');
  tokens.accounts = await login('accounts@abc.com');
});

afterAll(() => db.pool.end());

describe('authentication', () => {
  test('rejects wrong password and unknown user with the same message', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'priya@abc.com', password: 'nope' });
    const b = await request(app).post('/api/auth/login').send({ email: 'ghost@abc.com', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  test('protected routes require a valid token', async () => {
    await request(app).get('/api/vouchers').expect(401);
    await request(app).get('/api/vouchers').set('Authorization', 'Bearer garbage').expect(401);
  });
});

describe('creating vouchers', () => {
  test('new vouchers start as Draft with an auto-generated unique number', async () => {
    const a = await createVoucher('priya').expect(201);
    const b = await createVoucher('priya').expect(201);
    expect(a.body.status).toBe('DRAFT');
    expect(a.body.voucherNumber).toMatch(/^VCH-\d{4}-\d{6}$/);
    expect(a.body.voucherNumber).not.toBe(b.body.voucherNumber);
  });

  test.each([
    ['department', { department: '' }],
    ['title', { title: '' }],
    ['expenseDate', { expenseDate: '' }],
    ['amount', { amount: '' }],
  ])('requires %s', async (field, overrides) => {
    const res = await createVoucher('priya', { overrides }).expect(400);
    expect(res.body.fields[field]).toBeDefined();
  });

  test.each(['0', '-5'])('rejects amount %s', async (amount) => {
    const res = await createVoucher('priya', { overrides: { amount } }).expect(400);
    expect(res.body.fields.amount).toMatch(/greater than zero/);
  });

  test('rejects non-image uploads', async () => {
    const res = await request(app).post('/api/vouchers').set(as('priya'))
      .field('department', 'X').field('title', 'X').field('category', 'Travel')
      .field('amount', '10').field('expenseDate', '2026-01-10')
      .attach('signature', Buffer.from('<?php echo 1;'), { filename: 'x.php', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  test('Director and Accounts cannot create vouchers', async () => {
    await createVoucher('director').expect(403);
    await createVoucher('accounts').expect(403);
  });
});

describe('employee workflow', () => {
  test('cannot submit without a signature', async () => {
    const { body } = await createVoucher('rahul', { sig: false }).expect(201);
    const res = await request(app).post(`/api/vouchers/${body.id}/submit`).set(as('rahul'));
    expect(res.status).toBe(400);
    expect(res.body.fields.signature).toBeDefined();
  });

  test('draft can be edited and deleted', async () => {
    const { body } = await createVoucher('priya').expect(201);
    const upd = await request(app).put(`/api/vouchers/${body.id}`).set(as('priya'))
      .field('department', 'Engineering').field('title', 'Edited').field('category', 'Meals')
      .field('amount', '99').field('expenseDate', '2026-01-11');
    expect(upd.status).toBe(200);
    expect(upd.body.title).toBe('Edited');
    await request(app).delete(`/api/vouchers/${body.id}`).set(as('priya')).expect(204);
    await request(app).get(`/api/vouchers/${body.id}`).set(as('priya')).expect(404);
  });

  test('submitted vouchers are read-only for the employee', async () => {
    const id = await submitted();
    const edit = await request(app).put(`/api/vouchers/${id}`).set(as('priya'))
      .field('department', 'X').field('title', 'Hack').field('category', 'Meals')
      .field('amount', '1').field('expenseDate', '2026-01-11');
    expect(edit.status).toBe(409);
    await request(app).delete(`/api/vouchers/${id}`).set(as('priya')).expect(409);
    await request(app).post(`/api/vouchers/${id}/submit`).set(as('priya')).expect(409);
  });

  test('employees cannot see or touch other employees\' vouchers', async () => {
    const id = await submitted('priya');
    await request(app).get(`/api/vouchers/${id}`).set(as('rahul')).expect(404);
    await request(app).get(`/api/vouchers/${id}/signature/employee`).set(as('rahul')).expect(404);
    await request(app).delete(`/api/vouchers/${id}`).set(as('rahul')).expect(404);
    const list = await request(app).get('/api/vouchers?limit=100').set(as('rahul'));
    expect(list.body.data.every((v) => v.employee.name === 'Rahul Verma')).toBe(true);
  });

  test('employees cannot approve or reject', async () => {
    const id = await submitted();
    await request(app).post(`/api/vouchers/${id}/approve`).set(as('priya')).field('useSavedSignature', 'true').expect(403);
    await request(app).post(`/api/vouchers/${id}/reject`).set(as('priya')).send({ reason: 'no' }).expect(403);
  });
});

describe('director approvals', () => {
  test('drafts are not visible to the Director or Accounts', async () => {
    const { body } = await createVoucher('priya').expect(201);
    await request(app).get(`/api/vouchers/${body.id}`).set(as('director')).expect(404);
    await request(app).get(`/api/vouchers/${body.id}`).set(as('accounts')).expect(404);
    await request(app).post(`/api/vouchers/${body.id}/approve`).set(as('director')).attach('signature', png, { filename: 's.png', contentType: 'image/png' }).expect(404);
  });

  test('approval requires a director signature', async () => {
    const id = await submitted();
    const res = await request(app).post(`/api/vouchers/${id}/approve`).set(as('director'));
    expect(res.status).toBe(400);
    expect(res.body.fields.signature).toBeDefined();
  });

  test('approving stores the signature, then the voucher is read-only', async () => {
    const id = await submitted();
    const ok = await request(app).post(`/api/vouchers/${id}/approve`).set(as('director'))
      .attach('signature', png, { filename: 's.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('APPROVED');
    expect(ok.body.hasDirectorSignature).toBe(true);
    expect(ok.body.approvedAt).toBeTruthy();

    await request(app).post(`/api/vouchers/${id}/approve`).set(as('director')).attach('signature', png, { filename: 's.png', contentType: 'image/png' }).expect(409);
    await request(app).post(`/api/vouchers/${id}/reject`).set(as('director')).send({ reason: 'changed my mind' }).expect(409);
    await request(app).put(`/api/vouchers/${id}`).set(as('priya')).field('department', 'X').field('title', 'X').field('category', 'Meals').field('amount', '1').field('expenseDate', '2026-01-01').expect(409);
  });

  test('rejection requires a reason, and the employee can read it', async () => {
    const id = await submitted();
    const missing = await request(app).post(`/api/vouchers/${id}/reject`).set(as('director')).send({ reason: '   ' });
    expect(missing.status).toBe(400);
    expect(missing.body.fields.reason).toBeDefined();

    await request(app).post(`/api/vouchers/${id}/reject`).set(as('director')).send({ reason: 'Receipt missing' }).expect(200);
    const view = await request(app).get(`/api/vouchers/${id}`).set(as('priya')).expect(200);
    expect(view.body.status).toBe('REJECTED');
    expect(view.body.rejectionReason).toBe('Receipt missing');
    expect(view.body.history.map((h) => h.toStatus)).toEqual(['DRAFT', 'PENDING_APPROVAL', 'REJECTED']);
  });

  test('the Director cannot modify employee-entered details', async () => {
    const id = await submitted();
    await request(app).put(`/api/vouchers/${id}`).set(as('director')).field('department', 'X').field('title', 'X').field('category', 'Meals').field('amount', '1').field('expenseDate', '2026-01-01').expect(403);
  });
});

describe('accounts team', () => {
  test('is read-only but can view all submitted vouchers and both signatures', async () => {
    const id = await submitted();
    await request(app).post(`/api/vouchers/${id}/approve`).set(as('director')).attach('signature', png, { filename: 's.png', contentType: 'image/png' }).expect(200);

    await request(app).post(`/api/vouchers/${id}/submit`).set(as('accounts')).expect(403);
    await request(app).delete(`/api/vouchers/${id}`).set(as('accounts')).expect(403);
    await request(app).post(`/api/vouchers/${id}/approve`).set(as('accounts')).expect(403);
    await request(app).post(`/api/vouchers/${id}/reject`).set(as('accounts')).send({ reason: 'x' }).expect(403);

    const emp = await request(app).get(`/api/vouchers/${id}/signature/employee`).set(as('accounts')).expect(200);
    const dir = await request(app).get(`/api/vouchers/${id}/signature/director`).set(as('accounts')).expect(200);
    expect(emp.headers['content-type']).toMatch(/image\/png/);
    expect(dir.headers['content-type']).toMatch(/image\/png/);
  });

  test('director signature is 404 until the voucher is approved', async () => {
    const id = await submitted();
    await request(app).get(`/api/vouchers/${id}/signature/director`).set(as('accounts')).expect(404);
  });
});

describe('search, filter, sort and pagination', () => {
  beforeAll(async () => {
    for (const [title, amount, category, dept] of [
      ['Alpha cab', '100', 'Travel', 'Sales'],
      ['Beta lunch', '2500', 'Meals', 'Sales'],
      ['Gamma laptop bag', '9000', 'Office Supplies', 'Support'],
    ]) {
      const { body } = await createVoucher('rahul', { overrides: { title, amount, category, department: dept } }).expect(201);
      await request(app).post(`/api/vouchers/${body.id}/submit`).set(as('rahul')).expect(200);
    }
  });

  const get = (qs) => request(app).get(`/api/vouchers?${qs}`).set(as('accounts'));

  test('search by title text', async () => {
    const res = await get('q=laptop').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Gamma laptop bag');
  });

  test('filters by category, department, amount range and status', async () => {
    expect((await get('category=Meals&employeeName=rahul')).body.data.every((v) => v.category === 'Meals')).toBe(true);
    expect((await get('department=Support')).body.meta.total).toBe(1);
    const range = await get('minAmount=2000&maxAmount=3000&department=Sales');
    expect(range.body.data.map((v) => v.title)).toEqual(['Beta lunch']);
    expect((await get('status=APPROVED')).body.data.every((v) => v.status === 'APPROVED')).toBe(true);
  });

  test('sorts and paginates on the server', async () => {
    const res = await get('sortBy=amount&order=asc&limit=2&page=1').expect(200);
    const amounts = res.body.data.map((v) => v.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.totalPages).toBeGreaterThan(1);
  });

  test('rejects bad filters and cannot sort by arbitrary columns (SQL injection safe)', async () => {
    await get('sortBy=amount;DROP TABLE vouchers').expect(400);
    await get('dateFrom=2026-05-01&dateTo=2026-01-01').expect(400);
    await get('status=BOGUS').expect(400);
  });
});

describe('dashboards', () => {
  test('each role gets its own metrics', async () => {
    const emp = await request(app).get('/api/dashboard').set(as('rahul')).expect(200);
    expect(emp.body.stats).toEqual(expect.objectContaining({ totalVouchers: expect.any(Number), totalAmountClaimed: expect.any(Number) }));
    const dir = await request(app).get('/api/dashboard').set(as('director')).expect(200);
    expect(dir.body.stats).toEqual(expect.objectContaining({ pendingApprovalCount: expect.any(Number), recentActivity: expect.any(Array) }));
    const acc = await request(app).get('/api/dashboard').set(as('accounts')).expect(200);
    expect(acc.body.stats).toEqual(expect.objectContaining({ totalApprovedAmount: expect.any(Number), recentApproved: expect.any(Array) }));
  });
});
