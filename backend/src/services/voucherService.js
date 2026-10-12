const db = require('../db');
const { STATUS, TRANSITIONS, ROLES } = require('../constants');
const { badRequest, notFound, conflict } = require('../errors');
const { SORTABLE } = require('../validators');
const { removeFile } = require('../middleware/upload');

const SELECT = `
  SELECT v.*,
         e.name AS employee_name, e.employee_code AS employee_code,
         d.name AS director_name
    FROM vouchers v
    JOIN users e ON e.id = v.employee_id
    LEFT JOIN users d ON d.id = v.director_id`;

const toVoucher = (r) => ({
  id: r.id,
  voucherNumber: r.voucher_number,
  voucherDate: r.voucher_date,
  expenseDate: r.expense_date,
  department: r.department,
  title: r.title,
  category: r.category,
  description: r.description,
  amount: r.amount,
  status: r.status,
  employee: { id: r.employee_id, name: r.employee_name, employeeCode: r.employee_code },
  hasEmployeeSignature: !!r.employee_signature_path,
  director: r.director_id ? { id: r.director_id, name: r.director_name } : null,
  hasDirectorSignature: !!r.director_signature_path,
  submittedAt: r.submitted_at,
  approvedAt: r.approved_at,
  rejectedAt: r.rejected_at,
  rejectionReason: r.rejection_reason,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Visibility rules (business rules 9-11):
 *  - Employees see only their own vouchers (including drafts).
 *  - Director and Accounts see every voucher that has been submitted.
 *    Drafts are an employee's private work-in-progress, so they are excluded.
 */
function scopeFor(user, params) {
  if (user.role === ROLES.EMPLOYEE) {
    params.push(user.id);
    return `v.employee_id = $${params.length}`;
  }
  return `v.status <> 'DRAFT'`;
}

// Loads a voucher the user is allowed to see, otherwise 404 (never reveals existence).
async function getVisible(user, id, client = db) {
  const params = [id];
  const scope = scopeFor(user, params);
  const { rows } = await client.query(`${SELECT} WHERE v.id = $1 AND ${scope}`, params);
  if (!rows[0]) throw notFound('Voucher not found');
  return rows[0];
}

async function nextVoucherNumber(client) {
  const { rows } = await client.query(
    `SELECT 'VCH-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('voucher_number_seq')::text, 6, '0') AS n`
  );
  return rows[0].n;
}

const recordEvent = (client, voucherId, actorId, from, to, note = null) =>
  client.query(
    `INSERT INTO voucher_events (voucher_id, actor_id, from_status, to_status, note) VALUES ($1,$2,$3,$4,$5)`,
    [voucherId, actorId, from, to, note]
  );

// Single place that decides whether a status change is legal.
function assertTransition(from, to) {
  if (!TRANSITIONS[from].includes(to)) {
    const msg =
      from === STATUS.DRAFT
        ? 'Only submitted vouchers can be approved or rejected'
        : from === STATUS.PENDING_APPROVAL
        ? 'This voucher has already been submitted and cannot be changed'
        : `This voucher is already ${from.toLowerCase()} and is read-only`;
    throw conflict(msg);
  }
}

// Loads and row-locks an employee's own voucher; must be a DRAFT.
async function lockOwnDraft(client, user, id) {
  const { rows } = await client.query(
    'SELECT * FROM vouchers WHERE id = $1 AND employee_id = $2 FOR UPDATE',
    [id, user.id]
  );
  if (!rows[0]) throw notFound('Voucher not found');
  if (rows[0].status !== STATUS.DRAFT) {
    throw conflict('Only vouchers in Draft status can be edited or deleted');
  }
  return rows[0];
}

// A signature file is "unused" when no voucher or profile points at it any more.
async function removeIfUnused(filename) {
  if (!filename) return;
  const { rows } = await db.query(
    `SELECT (SELECT COUNT(*) FROM vouchers WHERE employee_signature_path = $1 OR director_signature_path = $1)
          + (SELECT COUNT(*) FROM users WHERE signature_path = $1) AS refs`,
    [filename]
  );
  if (Number(rows[0].refs) === 0) removeFile(filename);
}

async function create(user, data, file) {
  try {
    const id = await db.tx(async (client) => {
      const number = await nextVoucherNumber(client);
      const signature = file?.filename || user.signature_path || null;
      const { rows } = await client.query(
        `INSERT INTO vouchers
           (voucher_number, expense_date, department, title, category, description, amount,
            employee_id, employee_signature_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [number, data.expenseDate, data.department, data.title, data.category, data.description,
         data.amount, user.id, signature]
      );
      await recordEvent(client, rows[0].id, user.id, null, STATUS.DRAFT, 'Draft created');
      return rows[0].id;
    });
    return toVoucher(await getVisible(user, id));
  } catch (err) {
    if (file) removeIfUnused(file.filename);
    throw err;
  }
}

async function update(user, id, data, file) {
  let oldSignature;
  try {
    await db.tx(async (client) => {
      const current = await lockOwnDraft(client, user, id);
      oldSignature = current.employee_signature_path;
      await client.query(
        `UPDATE vouchers SET expense_date=$1, department=$2, title=$3, category=$4, description=$5,
                amount=$6, employee_signature_path=COALESCE($7, employee_signature_path), updated_at=NOW()
          WHERE id=$8`,
        [data.expenseDate, data.department, data.title, data.category, data.description,
         data.amount, file?.filename || null, id]
      );
    });
  } catch (err) {
    if (file) removeIfUnused(file.filename);
    throw err;
  }
  if (file) removeIfUnused(oldSignature);
  return toVoucher(await getVisible(user, id));
}

async function remove(user, id) {
  let signature;
  await db.tx(async (client) => {
    const current = await lockOwnDraft(client, user, id);
    signature = current.employee_signature_path;
    await client.query('DELETE FROM vouchers WHERE id = $1', [id]);
  });
  removeIfUnused(signature);
}

async function submit(user, id) {
  await db.tx(async (client) => {
    const v = await lockOwnDraft(client, user, id);
    assertTransition(v.status, STATUS.PENDING_APPROVAL);

    const signature = v.employee_signature_path || user.signature_path;
    if (!signature) throw badRequest('Employee signature is required before submitting', { signature: 'Upload your signature to submit' });

    await client.query(
      `UPDATE vouchers SET status=$1, submitted_at=NOW(), employee_signature_path=$2, updated_at=NOW() WHERE id=$3`,
      [STATUS.PENDING_APPROVAL, signature, id]
    );
    await recordEvent(client, id, user.id, v.status, STATUS.PENDING_APPROVAL, 'Submitted for approval');
  });
  return toVoucher(await getVisible(user, id));
}

async function approve(user, id, { file, useSavedSignature }) {
  try {
    await db.tx(async (client) => {
      const { rows } = await client.query('SELECT * FROM vouchers WHERE id=$1 AND status <> $2 FOR UPDATE', [id, STATUS.DRAFT]);
      const v = rows[0];
      if (!v) throw notFound('Voucher not found');
      assertTransition(v.status, STATUS.APPROVED);

      const signature = file?.filename || (useSavedSignature ? user.signature_path : null);
      if (!signature) {
        throw badRequest('Director signature is required to approve', { signature: 'Upload your signature to approve' });
      }

      await client.query(
        `UPDATE vouchers SET status=$1, director_id=$2, director_signature_path=$3, approved_at=NOW(), updated_at=NOW() WHERE id=$4`,
        [STATUS.APPROVED, user.id, signature, id]
      );
      await recordEvent(client, id, user.id, v.status, STATUS.APPROVED, 'Approved');
    });
  } catch (err) {
    if (file) removeIfUnused(file.filename);
    throw err;
  }
  return toVoucher(await getVisible(user, id));
}

async function reject(user, id, reason) {
  await db.tx(async (client) => {
    const { rows } = await client.query('SELECT * FROM vouchers WHERE id=$1 AND status <> $2 FOR UPDATE', [id, STATUS.DRAFT]);
    const v = rows[0];
    if (!v) throw notFound('Voucher not found');
    assertTransition(v.status, STATUS.REJECTED);

    await client.query(
      `UPDATE vouchers SET status=$1, director_id=$2, rejected_at=NOW(), rejection_reason=$3, updated_at=NOW() WHERE id=$4`,
      [STATUS.REJECTED, user.id, reason, id]
    );
    await recordEvent(client, id, user.id, v.status, STATUS.REJECTED, reason);
  });
  return toVoucher(await getVisible(user, id));
}

async function list(user, f) {
  const params = [];
  const where = [scopeFor(user, params)];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (f.status) add('v.status = ?', f.status);
  if (f.department) add('v.department ILIKE ?', `%${f.department}%`);
  if (f.category) add('v.category = ?', f.category);
  if (f.employeeName && user.role !== ROLES.EMPLOYEE) add('e.name ILIKE ?', `%${f.employeeName}%`);
  if (f.dateFrom) add('v.expense_date >= ?', f.dateFrom);
  if (f.dateTo) add('v.expense_date <= ?', f.dateTo);
  if (f.minAmount !== undefined) add('v.amount >= ?', f.minAmount);
  if (f.maxAmount !== undefined) add('v.amount <= ?', f.maxAmount);
  if (f.q) {
    params.push(`%${f.q}%`);
    const p = `$${params.length}`;
    where.push(`(v.voucher_number ILIKE ${p} OR v.title ILIKE ${p} OR e.name ILIKE ${p})`);
  }

  const whereSql = where.join(' AND ');
  const sortCol = SORTABLE[f.sortBy];
  const dir = f.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (f.page - 1) * f.limit;

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total, COALESCE(SUM(v.amount),0) AS total_amount
       FROM vouchers v JOIN users e ON e.id = v.employee_id WHERE ${whereSql}`,
    params
  );
  const { rows } = await db.query(
    `${SELECT} WHERE ${whereSql} ORDER BY ${sortCol} ${dir}, v.id DESC LIMIT ${f.limit} OFFSET ${offset}`,
    params
  );

  const { total, total_amount } = countRes.rows[0];
  return {
    data: rows.map(toVoucher),
    meta: { page: f.page, limit: f.limit, total, totalPages: Math.max(1, Math.ceil(total / f.limit)), totalAmount: Number(total_amount) },
  };
}

async function getDetail(user, id) {
  const row = await getVisible(user, id);
  const { rows } = await db.query(
    `SELECT ev.id, ev.from_status, ev.to_status, ev.note, ev.created_at, u.name AS actor_name, u.role AS actor_role
       FROM voucher_events ev JOIN users u ON u.id = ev.actor_id
      WHERE ev.voucher_id = $1 ORDER BY ev.created_at ASC, ev.id ASC`,
    [id]
  );
  // Directors/Accounts never need draft history of others; employees see their own.
  return {
    ...toVoucher(row),
    history: rows.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      note: e.note,
      actorName: e.actor_name,
      actorRole: e.actor_role,
      createdAt: e.created_at,
    })),
  };
}

// Returns the stored signature filename after checking the viewer may see this voucher.
async function getSignatureFile(user, id, type) {
  const row = await getVisible(user, id);
  const file = type === 'director' ? row.director_signature_path : row.employee_signature_path;
  if (!file) throw notFound('Signature not found');
  return file;
}

module.exports = { create, update, remove, submit, approve, reject, list, getDetail, getSignatureFile, removeIfUnused };
