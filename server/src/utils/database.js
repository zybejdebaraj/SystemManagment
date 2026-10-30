const fs = require('node:fs');
const path = require('node:path');

async function ensureSchema(db) {
  await db.query(fs.readFileSync(path.join(__dirname, '../../inventory_db.sql'), 'utf8'));
}
async function transaction(db, action) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
module.exports = { ensureSchema, transaction };
