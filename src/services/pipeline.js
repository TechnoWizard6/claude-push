import { randomBytes } from 'node:crypto';
import { db, getLead, getProject } from '../db.js';
import { config } from '../config.js';
import { computeScore, summarize } from './scoring.js';
import { sendWhatsApp } from './notifier.js';
import { syncLeadToCrm } from './crm.js';
import { publish } from './bus.js';

export function createLead({ name, phone, email, source, crm_id, project_id }) {
  const token = randomBytes(5).toString('hex');
  const info = db
    .prepare(
      `INSERT INTO leads (token, name, phone, email, source, crm_id, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(token, name, phone || '', email || '', source || 'website', crm_id || null, project_id);

  const lead = getLead(Number(info.lastInsertRowid));
  const project = getProject(lead.project_id);
  const micrositeUrl = `${config.baseUrl}/p/${lead.token}`;
  const buyerMessage =
    `Hi ${lead.name}, thanks for your interest in ${project.name}! ` +
    `Check out the project details, floor plans and pricing here 👉 ${micrositeUrl}`;

  publish('lead_created', lead);
  return { lead, micrositeUrl, buyerMessage };
}

// Every tracked interaction flows through here: store the event, rescore the
// lead, alert the sales exec when the threshold is crossed, sync the CRM, and
// broadcast to dashboard clients — all in real time, per event.
export async function ingestEvent(lead, evt) {
  const info = db
    .prepare(
      `INSERT INTO events (lead_id, event, section, duration, scroll_depth, device, session_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      lead.id,
      evt.event,
      evt.section || null,
      evt.duration ?? null,
      evt.scroll_depth ?? null,
      evt.device || null,
      evt.session_id || null,
      evt.source || null
    );

  const { score, tier, visits } = computeScore(lead.id);
  const status = lead.status === 'new' ? 'engaged' : lead.status;
  db.prepare(
    `UPDATE leads SET intent_score = ?, intent_tier = ?, status = ?, visit_count = ?,
     last_seen_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(score, tier, status, visits, lead.id);

  const updated = getLead(lead.id);

  publish('event', {
    id: Number(info.lastInsertRowid),
    lead_id: lead.id,
    lead_name: updated.name,
    event: evt.event,
    section: evt.section || null,
    duration: evt.duration ?? null,
    scroll_depth: evt.scroll_depth ?? null,
    created_at: new Date().toISOString(),
  });
  publish('lead_updated', updated);

  if (score >= config.intentThreshold) {
    await maybeNotify(updated);
  }

  // Keep the CRM current whenever the tier moves
  if (updated.intent_tier !== lead.intent_tier) {
    syncLeadToCrm(updated).catch(() => {});
  }

  return updated;
}

async function maybeNotify(lead) {
  if (lead.notified_at) {
    const elapsedMin = (Date.now() - Date.parse(lead.notified_at + 'Z')) / 60000;
    if (elapsedMin < config.notifyCooldownMinutes) return;
  }

  const { score, lines } = summarize(lead.id);
  const message =
    `🔥 High-intent lead: ${lead.name} (${lead.phone || 'no phone'})\n` +
    `Intent score: ${score}/100\n` +
    (lines.length ? lines.map((l) => `• ${l}`).join('\n') + '\n' : '') +
    `Recommended: Call immediately`;

  db.prepare(`UPDATE leads SET notified_at = datetime('now'), status = 'alerted' WHERE id = ?`).run(lead.id);
  await sendWhatsApp(lead.id, config.salesExecPhone, message);
  publish('lead_updated', getLead(lead.id));
}
