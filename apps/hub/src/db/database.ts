import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { SCHEMA_SQL } from './schema.js';
import { generateUlid } from '../services/ulid.js';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function initDatabase(dbPath: string = ':memory:'): {
  db: Database.Database;
  adminToken?: string;
} {
  const db = new Database(dbPath);

  // Set WAL mode and enable foreign keys
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  db.exec(SCHEMA_SQL);

  let adminToken: string | undefined;

  // Bootstrap initial admin if no members exist
  const countRow = db.prepare('SELECT COUNT(*) as count FROM members').get() as { count: number };
  if (countRow.count === 0) {
    const adminId = generateUlid();
    const tokenId = generateUlid();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    const insertMember = db.prepare(`
      INSERT INTO members (id, name, email, is_admin)
      VALUES (?, 'admin', 'admin@agent-hub.local', 1)
    `);

    const insertToken = db.prepare(`
      INSERT INTO api_tokens (id, member_id, token_hash, label)
      VALUES (?, ?, ?, 'Initial Admin Token')
    `);

    const insertEvent = db.prepare(`
      INSERT INTO events (actor_member_id, type, payload)
      VALUES (?, 'member.created', ?)
    `);

    db.transaction(() => {
      insertMember.run(adminId);
      insertToken.run(tokenId, adminId, tokenHash);
      insertEvent.run(adminId, JSON.stringify({ member_id: adminId, name: 'admin', is_admin: 1 }));
    })();

    adminToken = rawToken;
    console.log(`[BOOTSTRAP] Admin member initialized. Token: ${rawToken}`);
  }

  return { db, adminToken };
}
