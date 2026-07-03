import { db } from '../db.js';

// Rule-based intent scoring. Weights are transparent and tunable; once real
// historical data accumulates (events + closed/lost outcomes) this module is
// the single place to swap in a trained model.
const WEIGHTS = {
  pricing_view: { points: 8, cap: 24 },
  brochure_download: { points: 15, cap: 30 },
  floor_plan_view: { points: 6, cap: 18 },
  unit_config_view: { points: 5, cap: 15 },
  section_view: { points: 2, cap: 10 },
  page_view: { points: 2, cap: 6 },
  link_shared: { points: 10, cap: 20 },
};

const TIERS = [
  [30, 'cold'],
  [60, 'warm'],
  [80, 'hot'],
  [100, 'ready'],
];

export function computeScore(leadId) {
  const rows = db
    .prepare('SELECT event, duration, scroll_depth, session_id, created_at FROM events WHERE lead_id = ?')
    .all(leadId);

  let score = 0;
  const counts = {};
  let totalTime = 0;
  let maxScroll = 0;
  const sessions = new Set();
  const visitDays = new Set();

  for (const r of rows) {
    counts[r.event] = (counts[r.event] || 0) + 1;
    if (r.event === 'time_spent') totalTime += r.duration || 0;
    if (r.scroll_depth) maxScroll = Math.max(maxScroll, r.scroll_depth);
    if (r.session_id) sessions.add(r.session_id);
    visitDays.add((r.created_at || '').slice(0, 10));
  }

  for (const [event, { points, cap }] of Object.entries(WEIGHTS)) {
    score += Math.min((counts[event] || 0) * points, cap);
  }

  // Engagement depth: time on site (1 pt / 30s, max 10) and scroll depth
  score += Math.min(Math.floor(totalTime / 30), 10);
  if (maxScroll >= 75) score += 5;
  else if (maxScroll >= 50) score += 3;

  // Return behaviour: extra sessions and multi-day interest are strong signals
  score += Math.min(Math.max(sessions.size - 1, 0) * 8, 16);
  score += Math.min(Math.max(visitDays.size - 1, 0) * 6, 12);

  score = Math.min(score, 100);

  const tier = TIERS.find(([max]) => score <= max)[1];
  return { score, tier, visits: sessions.size, totalTime, maxScroll, counts };
}

// Human-readable engagement summary for the WhatsApp alert
export function summarize(leadId) {
  const { score, tier, visits, totalTime, counts } = computeScore(leadId);
  const parts = [];
  if (counts.pricing_view) parts.push(`Viewed pricing ${counts.pricing_view}x`);
  if (counts.brochure_download) parts.push('Downloaded brochure');
  if (counts.floor_plan_view) parts.push(`Viewed floor plans ${counts.floor_plan_view}x`);
  if (counts.unit_config_view) parts.push('Checked unit configurations');
  if (visits > 1) parts.push(`Returned ${visits - 1}x`);
  if (totalTime > 60) parts.push(`Spent ${Math.round(totalTime / 60)} min on site`);
  return { score, tier, lines: parts };
}
