import { Router } from 'express';
import { db } from '../db.js';
import { createLead } from '../services/pipeline.js';
import { sendWhatsApp } from '../services/notifier.js';

export const webhooks = Router();

// CRM "lead created" webhook — point Salesforce/HubSpot/Zoho (or n8n) here.
// Body: { name, phone, email, source, crm_id, project: "<project slug>" }
webhooks.post('/crm/lead', async (req, res) => {
  const { name, phone, email, source, crm_id, project } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });

  const proj = project
    ? db.prepare('SELECT * FROM projects WHERE slug = ?').get(project)
    : db.prepare('SELECT * FROM projects ORDER BY id LIMIT 1').get();
  if (!proj) return res.status(400).json({ error: `unknown project: ${project}` });

  const { lead, micrositeUrl, buyerMessage } = createLead({
    name,
    phone,
    email,
    source,
    crm_id,
    project_id: proj.id,
  });

  // Share the personalized microsite with the buyer over WhatsApp
  if (phone) await sendWhatsApp(lead.id, phone, buyerMessage);

  res.status(201).json({ lead_id: lead.id, token: lead.token, microsite_url: micrositeUrl });
});
