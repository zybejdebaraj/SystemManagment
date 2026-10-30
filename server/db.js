const { Pool } = require('pg');

function createDatabase(options) {
  const pool = new Pool(options);
  pool.on('error', error => console.error('Idle PostgreSQL connection failed:', error.code || error.name));
  return pool;
}

module.exports = { createDatabase };
