const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EVENT_LABELS = {
  page_view: 'opened the microsite',
  pricing_view: 'viewed pricing 💰',
  floor_plan_view: 'viewed floor plans',
  unit_config_view: 'checked unit configurations',
  section_view: 'viewed a section',
  brochure_download: 'downloaded the brochure 📄',
  scroll: 'scrolled',
  time_spent: 'is reading',
  link_shared: 'shared the link',
};

const TIER_LABELS = { ready: 'Ready to call', hot: 'Hot', warm: 'Warm', cold: 'Cold' };

let leads = [];

function timeAgo(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso.includes('T') ? iso : iso + 'Z');
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function renderLeads(flashId) {
  leads.sort((a, b) => b.intent_score - a.intent_score || (b.updated_at > a.updated_at ? 1 : -1));
  $('leads').innerHTML = leads
    .map(
      (l) => `<tr class="lead-row ${l.id === flashId ? 'flash' : ''}" data-id="${l.id}">
      <td><strong>${esc(l.name)}</strong><br><span style="color:var(--muted);font-size:.78rem">${esc(l.phone || l.email || '')}</span></td>
      <td>${esc(l.project_name || '')}</td>
      <td>${esc(l.source)}</td>
      <td><div class="scorecell"><div class="scorebar"><i style="width:${l.intent_score}%"></i></div><span class="score">${l.intent_score}</span></div></td>
      <td><span class="badge ${l.intent_tier}">${TIER_LABELS[l.intent_tier] || l.intent_tier}</span></td>
      <td>${l.visit_count}</td>
      <td>${timeAgo(l.last_seen_at)}</td>
    </tr>`
    )
    .join('');
  document.querySelectorAll('tr.lead-row').forEach((tr) => tr.addEventListener('click', () => openDrawer(+tr.dataset.id)));
}

function renderStats(s) {
  $('t-total').textContent = s.total ?? 0;
  $('t-ready').textContent = s.ready ?? 0;
  $('t-hot').textContent = s.hot ?? 0;
  $('t-warm').textContent = s.warm ?? 0;
  $('t-avg').textContent = s.avg_score ?? 0;
  $('t-events').textContent = s.events_today ?? 0;
}

function feedItem(e) {
  const li = document.createElement('li');
  li.innerHTML = `<span class="who">${esc(e.lead_name)}</span> ${EVENT_LABELS[e.event] || esc(e.event)}` +
    (e.section ? ` <span style="color:var(--muted)">(${esc(e.section)})</span>` : '') +
    ` <div class="when">${timeAgo(e.created_at)}</div>`;
  return li;
}

async function refreshStats() {
  renderStats(await fetch('/api/stats').then((r) => r.json()));
}

async function load() {
  const [leadRows, feed] = await Promise.all([
    fetch('/api/leads').then((r) => r.json()),
    fetch('/api/feed').then((r) => r.json()),
  ]);
  leads = leadRows;
  renderLeads();
  const ul = $('feed');
  ul.innerHTML = '';
  feed.forEach((e) => ul.appendChild(feedItem(e)));
  await refreshStats();
}

// ---- Realtime via Server-Sent Events ----
function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => $('live').classList.remove('off');
  es.onerror = () => $('live').classList.add('off');

  es.addEventListener('lead_updated', (m) => {
    const lead = JSON.parse(m.data);
    const i = leads.findIndex((l) => l.id === lead.id);
    if (i >= 0) leads[i] = { ...leads[i], ...lead };
    else load();
    renderLeads(lead.id);
    refreshStats();
  });

  es.addEventListener('lead_created', () => load());

  es.addEventListener('event', (m) => {
    const e = JSON.parse(m.data);
    if (e.event === 'time_spent' || e.event === 'scroll') return; // keep the feed readable
    const ul = $('feed');
    ul.prepend(feedItem(e));
    while (ul.children.length > 30) ul.lastChild.remove();
  });

  es.addEventListener('notification', (m) => {
    const n = JSON.parse(m.data);
    const li = document.createElement('li');
    li.className = 'notif';
    li.innerHTML = `<span class="who">WhatsApp alert</span> → ${esc(n.recipient || 'sales exec')} <div class="when">${esc(
      n.message
    )}</div>`;
    $('feed').prepend(li);
  });
}

// ---- Lead drawer / timeline ----
async function openDrawer(id) {
  const lead = leads.find((l) => l.id === id);
  if (!lead) return;
  $('d-name').textContent = lead.name;
  $('d-meta').innerHTML = `${esc(lead.phone || '')} · ${esc(lead.project_name || '')} · score <strong>${lead.intent_score}</strong> (${TIER_LABELS[lead.intent_tier]})`;
  const { events, notifications } = await fetch(`/api/leads/${id}/timeline`).then((r) => r.json());
  $('d-timeline').innerHTML = [
    ...notifications.map(
      (n) => `<li>📣 WhatsApp alert sent (${esc(n.status)})<div class="when">${timeAgo(n.created_at)}</div></li>`
    ),
    ...events.map(
      (e) =>
        `<li>${EVENT_LABELS[e.event] || esc(e.event)}${e.section ? ` (${esc(e.section)})` : ''}${
          e.duration ? ` · ${e.duration}s` : ''
        }${e.scroll_depth ? ` · ${e.scroll_depth}%` : ''}<div class="when">${timeAgo(e.created_at)}</div></li>`
    ),
  ].join('');
  $('drawer').classList.add('open');
}
function closeDrawer() {
  $('drawer').classList.remove('open');
}

load().then(connect);
setInterval(() => renderLeads(), 60000); // keep "last seen" fresh
