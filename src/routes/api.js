import { Router } from 'express';
import { db, getLeadByToken } from '../db.js';
import { ingestEvent } from '../services/pipeline.js';
import { subscribe } from '../services/bus.js';

export const api = Router();

// --- Event ingestion (called by the tracking SDK on the microsite) ---
api.post('/events', async (req, res) => {
  const { token, events } = req.body || {};
  const lead = token && getLeadByToken(token);
  if (!lead) return res.status(404).json({ error: 'unknown lead token' });

  const list = Array.isArray(events) ? events : [req.body];
  let updated = lead;
  for (const evt of list) {
    if (!evt.event) continue;
    updated = await ingestEvent(updated, evt);
  }
  res.json({ ok: true, intent_score: updated.intent_score, intent_tier: updated.intent_tier });
});

// --- Dashboard data ---
api.get('/leads', (req, res) => {
  const leads = db
    .prepare(
      `SELECT l.*, p.name AS project_name FROM leads l
       JOIN projects p ON p.id = l.project_id
       ORDER BY l.intent_score DESC, l.updated_at DESC`
    )
    .all();
  res.json(leads);
});

api.get('/leads/:id/timeline', (req, res) => {
  const events = db
    .prepare('SELECT * FROM events WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 200')
    .all(req.params.id);
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE lead_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.params.id);
  res.json({ events, notifications });
});

api.get('/stats', (req, res) => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN intent_tier = 'ready' THEN 1 ELSE 0 END) AS ready,
              SUM(CASE WHEN intent_tier = 'hot' THEN 1 ELSE 0 END) AS hot,
              SUM(CASE WHEN intent_tier = 'warm' THEN 1 ELSE 0 END) AS warm,
              ROUND(AVG(intent_score)) AS avg_score
       FROM leads`
    )
    .get();
  const eventsToday = db
    .prepare(`SELECT COUNT(*) AS n FROM events WHERE created_at >= date('now')`)
    .get();
  res.json({ ...row, events_today: eventsToday.n });
});

api.get('/feed', (req, res) => {
  const events = db
    .prepare(
      `SELECT e.id, e.lead_id, l.name AS lead_name, e.event, e.section, e.duration,
              e.scroll_depth, e.created_at
       FROM events e JOIN leads l ON l.id = e.lead_id
       WHERE e.event NOT IN ('time_spent', 'scroll')
       ORDER BY e.created_at DESC, e.id DESC LIMIT 30`
    )
    .all();
  res.json(events);
});

// --- Realtime stream (Server-Sent Events) ---
api.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  const unsubscribe = subscribe(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});
