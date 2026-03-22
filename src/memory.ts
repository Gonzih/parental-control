import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { computeSpiralScore } from './classifier.js';

export interface MessageRecord {
  id: number;
  profileId: string;
  role: string;
  content: string;
  timestamp: number;
  flagged: boolean;
  category?: string;
}

export interface SpiralAnalysis {
  spiralScore: number;
  recentMessages: Array<{ role: string; content: string }>;
  flags: string[];
  topTopics: string[];
}

let db: Database.Database | null = null;

function getDbPath(): string {
  const envPath = process.env.PARENTAL_CONTROL_DB;
  if (envPath) {
    return envPath.replace('~', os.homedir());
  }
  const defaultDir = path.join(os.homedir(), '.parental-control');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return path.join(defaultDir, 'db.sqlite');
}

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath();
    db = new Database(dbPath);
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      flagged INTEGER NOT NULL DEFAULT 0,
      category TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_profile ON messages(profile_id, timestamp);

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      decision TEXT,
      parent_note TEXT,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      profile_id TEXT PRIMARY KEY,
      start_time INTEGER NOT NULL,
      total_minutes INTEGER NOT NULL DEFAULT 0,
      last_active INTEGER NOT NULL
    );
  `);
}

export function logMessage(
  profileId: string,
  role: string,
  content: string,
  flagged = false,
  category?: string
): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO messages (profile_id, role, content, timestamp, flagged, category)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(profileId, role, content, Date.now(), flagged ? 1 : 0, category ?? null);
}

export function getRecentMessages(
  profileId: string,
  limit = 20
): MessageRecord[] {
  const database = getDb();
  const rows = database.prepare(`
    SELECT id, profile_id as profileId, role, content, timestamp, flagged, category
    FROM messages
    WHERE profile_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(profileId, limit) as Array<{
    id: number; profileId: string; role: string; content: string;
    timestamp: number; flagged: number; category: string | null;
  }>;

  return rows.reverse().map(r => ({
    id: r.id,
    profileId: r.profileId,
    role: r.role,
    content: r.content,
    timestamp: r.timestamp,
    flagged: r.flagged === 1,
    category: r.category ?? undefined,
  }));
}

export function analyzeSpiralRisk(profileId: string, windowSize = 20): SpiralAnalysis {
  const messages = getRecentMessages(profileId, windowSize);
  const spiralScore = computeSpiralScore(messages);

  const flags: string[] = [];
  const flaggedMsgs = messages.filter(m => m.flagged && m.category);
  const categoryCounts = new Map<string, number>();

  for (const msg of flaggedMsgs) {
    if (msg.category) {
      categoryCounts.set(msg.category, (categoryCounts.get(msg.category) ?? 0) + 1);
    }
  }

  for (const [cat, count] of categoryCounts) {
    if (count > 1) {
      flags.push(`Repeated ${cat} flags (${count}x)`);
    }
  }

  if (spiralScore > 3) flags.push('High spiral risk score');
  if (spiralScore > 5) flags.push('Critical: sustained negative thought patterns');

  return {
    spiralScore,
    recentMessages: messages.map(m => ({ role: m.role, content: m.content })),
    flags,
    topTopics: Array.from(categoryCounts.keys()),
  };
}

export function createApproval(
  id: string,
  profileId: string,
  content: string,
  category: string
): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO approvals (id, profile_id, content, category, created_at, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(id, profileId, content, category, Date.now());
}

export function resolveApproval(
  id: string,
  decision: 'approve' | 'deny',
  parentNote?: string
): boolean {
  const database = getDb();
  const result = database.prepare(`
    UPDATE approvals
    SET decision = ?, parent_note = ?, resolved_at = ?, status = 'resolved'
    WHERE id = ? AND status = 'pending'
  `).run(decision, parentNote ?? null, Date.now(), id);
  return result.changes > 0;
}

export function getPendingApprovals(profileId?: string): Array<{
  id: string; profileId: string; content: string; category: string;
  createdAt: number; status: string;
}> {
  const database = getDb();
  let query = `SELECT id, profile_id as profileId, content, category, created_at as createdAt, status FROM approvals WHERE status = 'pending'`;
  const params: string[] = [];
  if (profileId) {
    query += ' AND profile_id = ?';
    params.push(profileId);
  }
  return database.prepare(query).all(...params) as Array<{
    id: string; profileId: string; content: string; category: string;
    createdAt: number; status: string;
  }>;
}

export function getApprovalStatus(id: string): {
  status: string; decision?: string; parentNote?: string;
} | null {
  const database = getDb();
  const row = database.prepare(`
    SELECT status, decision, parent_note as parentNote FROM approvals WHERE id = ?
  `).get(id) as { status: string; decision?: string; parentNote?: string; } | undefined;
  return row ?? null;
}
