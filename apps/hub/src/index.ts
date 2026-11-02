import path from 'node:path';
import { initDatabase } from './db/database.js';
import { buildApp } from './app.js';
import { startReaperJob } from './services/reaper.js';

export { buildApp } from './app.js';
export { initDatabase } from './db/database.js';

async function start(): Promise<void> {
  const dbPath = process.env.HUB_DB_PATH || path.resolve(process.cwd(), 'agent-hub.db');
  console.log(`[HUB] Connecting SQLite database at ${dbPath}...`);

  const { db, adminToken } = initDatabase(dbPath);
  if (adminToken) {
    console.log(`=======================================================`);
    console.log(`[HUB BOOTSTRAP] Initial Admin Token Generated:`);
    console.log(`  ${adminToken}`);
    console.log(`Save this token securely. It will not be printed again.`);
    console.log(`=======================================================`);
  }

  const reaperInterval = startReaperJob(db, 60000);
  const app = buildApp(db);

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`[HUB] Agent Hub server listening on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    clearInterval(reaperInterval);
    process.exit(1);
  }
}

// Only start when executed directly
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  start();
}
