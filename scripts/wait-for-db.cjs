const net = require('node:net');
const { URL } = require('node:url');

const databaseUrl = process.env.DATABASE_URL || 'postgresql://physio_dev:physio_dev_pass@localhost:5432/physio_note_finisher';

let host = 'localhost';
let port = 5432;

try {
  const parsed = new URL(databaseUrl);
  if (parsed.hostname) host = parsed.hostname;
  if (parsed.port) port = parseInt(parsed.port, 10);
} catch {
  // fallback to default host/port
}

const maxAttempts = 30;
let attempts = 0;

function checkConnection() {
  attempts++;
  const socket = new net.Socket();

  socket.setTimeout(2000);

  socket.on('connect', () => {
    socket.destroy();
    console.log(`[wait-for-db] Database port ${port} on ${host} is ready.`);
    process.exit(0);
  });

  socket.on('error', (err) => {
    socket.destroy();
    if (attempts >= maxAttempts) {
      console.error(`[wait-for-db] Failed to connect to database at ${host}:${port} after ${maxAttempts} attempts:`, err.message);
      process.exit(1);
    } else {
      setTimeout(checkConnection, 1000);
    }
  });

  socket.on('timeout', () => {
    socket.destroy();
    if (attempts >= maxAttempts) {
      console.error(`[wait-for-db] Connection attempt timed out to ${host}:${port} after ${maxAttempts} attempts.`);
      process.exit(1);
    } else {
      setTimeout(checkConnection, 1000);
    }
  });

  socket.connect(port, host);
}

console.log(`[wait-for-db] Waiting for PostgreSQL database at ${host}:${port}...`);
checkConnection();
