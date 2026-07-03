import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.js';
import './src/db.js';
import { api } from './src/routes/api.js';
import { webhooks } from './src/routes/webhooks.js';
import { microsite } from './src/routes/microsite.js';

const root = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '256kb' }));
app.use(express.static(join(root, 'public')));

app.use('/api', api);
app.use('/webhooks', webhooks);
app.use('/p', microsite);

app.get('/', (req, res) => res.redirect('/dashboard/'));
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  console.log(`Leads-Track running:
  Dashboard   ${config.baseUrl}/dashboard/
  CRM webhook POST ${config.baseUrl}/webhooks/crm/lead
  Microsites  ${config.baseUrl}/p/<token>
  Intent threshold: ${config.intentThreshold}`);
});
