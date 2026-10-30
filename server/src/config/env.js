const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

function port(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid port`);
  return value;
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Set a SESSION_SECRET of at least 32 characters in .env.local');
if (Boolean(process.env.GOOGLE_CLIENT_ID) !== Boolean(process.env.GOOGLE_CLIENT_SECRET)) throw new Error('Set both Google OAuth credentials or leave both empty');

module.exports = {
  port: port('PORT', 3002),
  production: process.env.NODE_ENV === 'production',
  sessionSecret: process.env.SESSION_SECRET,
  database: {
    ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
      host: process.env.DB_HOST || 'localhost', port: port('DB_PORT', 5432),
      user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'inventory_db',
    }),
    connectionTimeoutMillis: 5000,
  },
  google: process.env.GOOGLE_CLIENT_ID ? {
    clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5173/auth/google/callback',
  } : null,
};
