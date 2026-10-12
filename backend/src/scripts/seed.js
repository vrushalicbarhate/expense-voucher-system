const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const svc = require('../services/voucherService');
const { makeSignaturePng } = require('./signaturePng');

const PASSWORD = 'Password@123';

const USERS = [
  { name: 'Dana Director', email: 'director@abc.com', role: 'DIRECTOR', department: 'Management' },
  { name: 'Arun Accounts', email: 'accounts@abc.com', role: 'ACCOUNTS', department: 'Finance' },
  { name: 'Priya Sharma', email: 'priya@abc.com', role: 'EMPLOYEE', department: 'Engineering', employee_code: 'EMP-101' },
  { name: 'Rahul Verma', email: 'rahul@abc.com', role: 'EMPLOYEE', department: 'Sales', employee_code: 'EMP-102' },
];

function writeSignature(seed) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const filename = `${crypto.randomUUID()}.png`;
  fs.writeFileSync(path.join(config.uploadDir, filename), makeSignaturePng(seed));
  return { filename };
}

async function seedUsers() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  for (const u of USERS) {
    await db.query(
      `INSERT INTO users (name, email, password_hash, role, employee_code, department)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, hash, u.role, u.employee_code || null, u.department]
    );
  }
}

async function seedDemoVouchers() {
  const { rows: existing } = await db.query('SELECT COUNT(*)::int AS n FROM vouchers');
  if (existing[0].n > 0) return console.log('Vouchers already exist, skipping demo data.');

  const get = async (email) => (await db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  const [priya, rahul, director] = await Promise.all([get('priya@abc.com'), get('rahul@abc.com'), get('director@abc.com')]);

  const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
  const mk = (user, seed, data) => svc.create(user, { description: '', ...data }, writeSignature(seed));

  const a = await mk(priya, 1, { department: 'Engineering', title: 'Client site visit - Mumbai', category: 'Travel', amount: 8450.5, expenseDate: day(6), description: 'Flight and cab fares for the onboarding visit.' });
  const b = await mk(priya, 2, { department: 'Engineering', title: 'Team offsite lunch', category: 'Meals', amount: 3200, expenseDate: day(4) });
  const c = await mk(priya, 3, { department: 'Engineering', title: 'IDE licence renewal', category: 'Software & Subscriptions', amount: 12999, expenseDate: day(3) });
  await mk(priya, 4, { department: 'Engineering', title: 'Conference ticket (draft)', category: 'Training', amount: 15000, expenseDate: day(1) });
  const d = await mk(rahul, 5, { department: 'Sales', title: 'Hotel stay - Pune roadshow', category: 'Accommodation', amount: 6800, expenseDate: day(5) });
  const e = await mk(rahul, 6, { department: 'Sales', title: 'Client dinner', category: 'Client Entertainment', amount: 4100, expenseDate: day(2) });

  for (const [u, v] of [[priya, a], [priya, b], [priya, c], [rahul, d], [rahul, e]]) await svc.submit(u, v.id);

  await svc.approve(director, a.id, { file: writeSignature(9) });
  await svc.approve(director, d.id, { file: writeSignature(9) });
  await svc.reject(director, b.id, 'Please attach itemised restaurant bill and resubmit.');
  console.log('Demo vouchers created.');
}

async function main() {
  await require('./migrate')();
  await seedUsers();
  if (process.argv.includes('--demo')) await seedDemoVouchers();
  console.log(`Seeded users (password for all: ${PASSWORD})`);
  USERS.forEach((u) => console.log(`  ${u.role.padEnd(9)} ${u.email}`));
}

if (require.main === module) {
  main().then(() => db.pool.end()).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seedUsers, PASSWORD, USERS };
