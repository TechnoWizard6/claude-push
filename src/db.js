import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'data'), { recursive: true });

export const db = new DatabaseSync(join(root, 'data', 'leads-track.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    description TEXT,
    price_range TEXT,
    amenities TEXT DEFAULT '[]',      -- JSON array
    units TEXT DEFAULT '[]',          -- JSON array of {type, size, price}
    brochure_name TEXT DEFAULT 'brochure.pdf',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,       -- unique microsite token, /p/:token
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source TEXT DEFAULT 'website',    -- facebook / google / magicbricks / walk-in ...
    crm_id TEXT,                      -- id in the external CRM
    project_id INTEGER NOT NULL REFERENCES projects(id),
    intent_score INTEGER DEFAULT 0,
    intent_tier TEXT DEFAULT 'cold',  -- cold | warm | hot | ready
    status TEXT DEFAULT 'new',        -- new | engaged | alerted | contacted
    visit_count INTEGER DEFAULT 0,
    last_seen_at TEXT,
    notified_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    event TEXT NOT NULL,              -- page_view | section_view | pricing_view | brochure_download | ...
    section TEXT,                     -- pricing | floor_plans | location | ...
    duration INTEGER,                 -- seconds, for time_spent events
    scroll_depth INTEGER,             -- percent, for scroll events
    device TEXT,
    session_id TEXT,
    source TEXT,                      -- whatsapp | direct | ...
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_lead ON events(lead_id, created_at);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    channel TEXT NOT NULL,            -- whatsapp | console
    recipient TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'sent',       -- sent | failed | logged
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS crm_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    provider TEXT NOT NULL,           -- hubspot | log
    payload TEXT NOT NULL,            -- JSON of what was synced
    status TEXT DEFAULT 'ok',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

export function getLead(id) {
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

export function getLeadByToken(token) {
  return db.prepare('SELECT * FROM leads WHERE token = ?').get(token);
}

export function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}
