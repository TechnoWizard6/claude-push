// Demo traffic generator: creates leads via the CRM webhook and replays
// realistic buyer sessions against the events API so the dashboard shows
// live activity. Usage: npm run simulate  (server must be running)
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const BUYERS = [
  { name: 'Tarun Mehta', phone: '+919876543210', source: 'facebook', intensity: 'high' },
  { name: 'Ananya Rao', phone: '+919812345678', source: 'google', intensity: 'medium' },
  { name: 'Vikram Shah', phone: '+919933221100', source: 'magicbricks', intensity: 'low' },
  { name: 'Priya Nair', phone: '+919845098450', source: 'walk-in', intensity: 'high' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

function session(token, sessionId, source) {
  const base = { device: Math.random() > 0.4 ? 'mobile' : 'desktop', session_id: sessionId, source };
  return (event, extra = {}) => post('/api/events', { token, events: [{ event, ...base, ...extra }] });
}

async function browse(token, source, intensity, visit) {
  const sid = `sim-${visit}-${Math.random().toString(36).slice(2, 8)}`;
  const send = session(token, sid, source);

  await send('page_view');
  await sleep(400);
  await send('section_view', { section: 'project_info' });
  await sleep(400);

  if (intensity !== 'low') {
    await send('floor_plan_view', { section: 'floor_plans' });
    await sleep(300);
    await send('unit_config_view', { section: 'unit_config' });
    await sleep(300);
  }
  await send('pricing_view', { section: 'pricing' });
  await send('scroll', { scroll_depth: intensity === 'low' ? 50 : 100 });

  const slices = intensity === 'high' ? 6 : intensity === 'medium' ? 3 : 1;
  for (let i = 0; i < slices; i++) {
    await send('time_spent', { duration: 15 });
    await sleep(250);
  }

  if (intensity === 'high') {
    await fetch(`${BASE}/p/${token}/brochure`); // server-side tracked download
    await send('pricing_view', { section: 'pricing' });
  }
}

async function main() {
  console.log(`Simulating buyer traffic against ${BASE} ...`);
  for (const buyer of BUYERS) {
    const { token, microsite_url } = await post('/webhooks/crm/lead', {
      name: buyer.name,
      phone: buyer.phone,
      source: buyer.source,
      project: 'skyline-heights',
    });
    console.log(`  lead created: ${buyer.name} -> ${microsite_url}`);

    const visits = buyer.intensity === 'high' ? 3 : buyer.intensity === 'medium' ? 2 : 1;
    for (let v = 1; v <= visits; v++) {
      await browse(token, buyer.source, buyer.intensity, v);
      await sleep(600);
    }
  }
  console.log('Done. Open the dashboard to see scores and alerts.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
