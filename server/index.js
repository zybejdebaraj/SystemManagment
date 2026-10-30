const config = require('./src/config/env');
const { createDatabase } = require('./db');
const { ensureSchema } = require('./src/utils/database');
const { createApp } = require('./app');

async function start() {
  const db = createDatabase(config.database);
  try {
    await db.query('SELECT 1');
    await ensureSchema(db);
    const app = createApp({ db, config });
    const server = app.listen(config.port, () => console.log(`Inventory Management running on http://localhost:${config.port} (PostgreSQL)`));
    server.on('error', async error => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${config.port} is already in use. Run the app from one terminal only, or choose a free PORT in server/.env.local. Then press Ctrl+C and run npm run dev again.`);
      } else console.error('Server startup failed:', error.code);
      app.locals.sessionStore.close();
      await db.end(); process.exitCode = 1;
    });
    const stop = () => server.close(() => { app.locals.sessionStore.close(); db.end().finally(() => process.exit(0)); });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error('PostgreSQL startup failed:', error.code || error.name);
    await db.end(); process.exitCode = 1;
  }
}
start();
