const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClientServer } = require('./proxy.cjs');

const port = Number(process.env.CLIENT_PORT || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('CLIENT_PORT must be a valid port');
const target = process.env.SERVER_URL || 'http://127.0.0.1:3002';
const backend = new URL(target);
if (['localhost','127.0.0.1','[::1]'].includes(backend.hostname) && Number(backend.port || (backend.protocol === 'https:' ? 443 : 80)) === port) {
  throw new Error('CLIENT_PORT and the server port must be different');
}
const server = createClientServer({ target });
server.listen(port, () => console.log(`Inventory client running on http://localhost:${port}`));
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Client port ${port} is already in use. Stop the other client instance or set CLIENT_PORT in client/.env.local.`
    : `Client startup failed: ${error.code || error.name}`);
  process.exitCode = 1;
});
const stop = () => { server.close(); server.closeAllConnections(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
