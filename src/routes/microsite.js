import { Router } from 'express';
import { db, getLeadByToken, getProject } from '../db.js';
import { ingestEvent } from '../services/pipeline.js';

export const microsite = Router();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Personalized microsite — one unique URL per lead
microsite.get('/:token', (req, res) => {
  const lead = getLeadByToken(req.params.token);
  if (!lead) return res.status(404).send('This link is no longer valid.');
  const project = getProject(lead.project_id);
  const amenities = JSON.parse(project.amenities || '[]');
  const units = JSON.parse(project.units || '[]');

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.name)}</title>
<style>
  :root { --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --line:#e1e0d9;
          --surface:#fcfcfb; --page:#f9f9f7; --brand:#4a3aa7; --brand-ink:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#fff; --ink2:#c3c2b7; --muted:#898781; --line:#2c2c2a;
            --surface:#1a1a19; --page:#0d0d0d; --brand:#9085e9; --brand-ink:#0d0d0d; }
  }
  * { box-sizing:border-box; margin:0; }
  body { font-family:system-ui,-apple-system,"Segoe UI",sans-serif; background:var(--page); color:var(--ink); line-height:1.55; }
  main { max-width:720px; margin:0 auto; padding:0 20px 80px; }
  .hero { background:linear-gradient(135deg,#4a3aa7,#2a78d6); color:#fff; padding:48px 20px 40px; text-align:center; }
  .hero h1 { font-size:1.9rem; margin-bottom:6px; }
  .hero p { opacity:.9; }
  .greet { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 18px; margin:-24px auto 8px; max-width:680px; position:relative; }
  section { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:22px; margin-top:16px; }
  h2 { font-size:1.1rem; margin-bottom:10px; }
  .muted { color:var(--ink2); }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-variant-numeric:tabular-nums; }
  th,td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-size:.8rem; text-transform:uppercase; letter-spacing:.04em; }
  .price { font-size:1.5rem; font-weight:700; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .chip { border:1px solid var(--line); border-radius:999px; padding:5px 12px; font-size:.85rem; color:var(--ink2); }
  .plan { display:flex; gap:12px; overflow-x:auto; padding-bottom:6px; }
  .plan figure { flex:0 0 200px; border:1px solid var(--line); border-radius:10px; padding:14px; text-align:center; }
  .plan svg { width:100%; height:110px; }
  .btn { display:inline-block; background:var(--brand); color:var(--brand-ink); border:none; border-radius:10px;
         padding:14px 22px; font-size:1rem; font-weight:600; cursor:pointer; text-decoration:none; }
  .cta { position:fixed; bottom:0; left:0; right:0; background:var(--surface); border-top:1px solid var(--line);
         padding:12px 20px; display:flex; gap:10px; justify-content:center; }
  .cta .btn { flex:1; max-width:340px; text-align:center; }
</style>
</head>
<body data-token="${esc(lead.token)}">
<div class="hero">
  <h1>${esc(project.name)}</h1>
  <p>📍 ${esc(project.location)}</p>
</div>
<main>
  <div class="greet">Hi <strong>${esc(lead.name.split(' ')[0])}</strong>, this page was prepared just for you 👋</div>

  <section data-track-section="project_info">
    <h2>About the project</h2>
    <p class="muted">${esc(project.description)}</p>
    <div class="chips">${amenities.map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>
  </section>

  <section data-track-section="floor_plans">
    <h2>Floor plans</h2>
    <div class="plan">
      ${units
        .map(
          (u) => `<figure>
        <svg viewBox="0 0 100 60"><rect x="4" y="4" width="92" height="52" rx="3" fill="none" stroke="currentColor" opacity=".5"/><line x1="50" y1="4" x2="50" y2="56" stroke="currentColor" opacity=".3"/><line x1="4" y1="30" x2="96" y2="30" stroke="currentColor" opacity=".3"/></svg>
        <figcaption><strong>${esc(u.type)}</strong><br><span class="muted">${esc(u.size)}</span></figcaption>
      </figure>`
        )
        .join('')}
    </div>
  </section>

  <section data-track-section="unit_config">
    <h2>Unit configurations</h2>
    <table>
      <tr><th>Type</th><th>Size</th><th>Price</th></tr>
      ${units.map((u) => `<tr><td>${esc(u.type)}</td><td>${esc(u.size)}</td><td>${esc(u.price)}</td></tr>`).join('')}
    </table>
  </section>

  <section data-track-section="pricing">
    <h2>Pricing</h2>
    <p class="price">${esc(project.price_range)}</p>
    <p class="muted">All-inclusive pricing. Flexible payment plans available — ask us on the call.</p>
  </section>

  <section data-track-section="location">
    <h2>Location</h2>
    <p class="muted">${esc(project.location)} — well connected to schools, IT hubs and the metro line.</p>
  </section>
</main>
<div class="cta">
  <a class="btn" href="/p/${esc(lead.token)}/brochure" data-track="brochure_download">⬇ Download brochure</a>
</div>
<script src="/track.js" defer></script>
</body>
</html>`);
});

// Brochure download — tracked server-side so it counts even without JS
microsite.get('/:token/brochure', async (req, res) => {
  const lead = getLeadByToken(req.params.token);
  if (!lead) return res.status(404).send('This link is no longer valid.');
  const project = getProject(lead.project_id);

  await ingestEvent(lead, { event: 'brochure_download', source: 'microsite' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${project.brochure_name}"`);
  // Minimal valid one-page PDF placeholder; replace with the real brochure file
  res.send(Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n` +
    `trailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF`
  ));
});
