import { db } from '../db.js';
import { config } from '../config.js';

// Pushes intent score + status back to the CRM. HubSpot is wired up as the
// reference integration; without a token every sync is recorded in
// crm_sync_log so the flow stays visible in demos and in the dashboard.
export async function syncLeadToCrm(lead) {
  const payload = {
    intent_score: lead.intent_score,
    intent_tier: lead.intent_tier,
    lead_status: lead.status,
    last_engagement: lead.last_seen_at,
  };

  let provider = 'log';
  let status = 'ok';

  if (config.hubspotToken && lead.crm_id) {
    provider = 'hubspot';
    try {
      const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${lead.crm_id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${config.hubspotToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties: payload }),
      });
      status = res.ok ? 'ok' : 'failed';
    } catch (err) {
      status = 'failed';
      console.error('[crm] sync failed:', err.message);
    }
  }

  db.prepare('INSERT INTO crm_sync_log (lead_id, provider, payload, status) VALUES (?, ?, ?, ?)')
    .run(lead.id, provider, JSON.stringify(payload), status);
}
