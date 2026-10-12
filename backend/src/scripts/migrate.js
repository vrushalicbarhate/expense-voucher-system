const fs = require('fs');
const path = require('path');
const db = require('../db');

const dir = path.join(__dirname, '..', '..', 'migrations');

async function migrate() {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await db.tx(async (client) => {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`applied ${file}`);
  }
}

module.exports = migrate;

if (require.main === module) {
  migrate()
    .then(() => { console.log('Migrations up to date.'); return db.pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
