# Leads-Track

Real-time real estate lead engagement tracking and buyer-intent scoring — a
self-hosted PropFocus-style system. Every lead gets a personalized microsite;
every interaction on it (pricing views, brochure downloads, return visits,
time spent) is scored in real time, and the sales executive gets a WhatsApp
alert the moment a lead crosses the intent threshold.

Unlike a workflow tool (n8n/Zapier), this is a persistent server: events are
ingested and scored **per interaction, instantly**, and the dashboard updates
live over Server-Sent Events — no polling, no per-execution latency.

## How it works

```
CRM webhook ──► lead created ──► unique microsite /p/<token> ──► shared on WhatsApp
                                        │
                              buyer browses (SDK tracks
                              pricing, brochure, time, returns)
                                        │
                              POST /api/events  (per event)
                                        │
                        rescore ──► tier (cold/warm/hot/ready)
                            │               │
              score ≥ threshold?      SSE push to dashboard (live)
                            │
              WhatsApp alert to sales exec + CRM sync
```

## Quick start

```bash
npm install
npm run seed        # creates the demo project "Skyline Heights"
npm start           # http://localhost:3000

# in a second terminal — generates 4 leads with realistic browsing sessions
npm run simulate
```

Then open:

- **Dashboard** (live): http://localhost:3000/dashboard/
- **A microsite**: the simulator prints each lead's unique URL

## Creating leads (CRM webhook)

Point your CRM's "lead created" webhook (Salesforce / HubSpot / Zoho — or an
n8n workflow, or a Facebook Lead Ads integration) at:

```bash
curl -X POST http://localhost:3000/webhooks/crm/lead \
  -H 'Content-Type: application/json' \
  -d '{"name":"Tarun Mehta","phone":"+919876543210","source":"facebook","project":"skyline-heights","crm_id":"12345"}'
```

Response includes the lead's unique `microsite_url`. If a phone number is
given, the personalized WhatsApp invite is sent automatically (or logged, in
console mode).

## Intent scoring

Transparent, weighted rules in `src/services/scoring.js` — recomputed on
**every** event:

| Signal | Points |
|---|---|
| Pricing view | 8 (cap 24) |
| Brochure download | 15 (cap 30) |
| Floor plan view | 6 (cap 18) |
| Unit configuration view | 5 (cap 15) |
| Link shared | 10 (cap 20) |
| Time on site | 1 per 30s (cap 10) |
| Scroll ≥ 75% / ≥ 50% | 5 / 3 |
| Each return session | 8 (cap 16) |
| Each extra day of visits | 6 (cap 12) |

Tiers: 0–30 **cold** · 31–60 **warm** · 61–80 **hot** · 81–100 **ready to
call**. When the score crosses `INTENT_THRESHOLD` (default 85), the sales
executive is alerted on WhatsApp with an engagement summary, with a cooldown
so they aren't spammed. Once real outcome data accumulates in the `events`
table, `src/services/scoring.js` is the single place to swap in a trained
model (XGBoost/LightGBM) without touching the rest of the pipeline.

## Configuration

Copy `.env.example` to `.env` and run with `node --env-file=.env server.js`
(or export the variables). Everything works with **zero configuration** —
WhatsApp messages are logged to the console and stored in the DB, and CRM
syncs are recorded in `crm_sync_log`, so the whole flow is demoable without
any external accounts.

To go live, set:

- **WhatsApp** — either Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_WHATSAPP_FROM`) or Meta Cloud API (`WHATSAPP_TOKEN`,
  `WHATSAPP_PHONE_NUMBER_ID`), plus `SALES_EXEC_PHONE`
- **CRM** — `HUBSPOT_TOKEN` (HubSpot private app); pass the contact id as
  `crm_id` in the webhook payload
- **`BASE_URL`** — your public domain, so microsite links in WhatsApp work

## Stack & scaling

Node 22 + Express + built-in `node:sqlite` (zero native deps), vanilla-JS
frontend, Server-Sent Events for realtime. Deliberately boring so it runs
anywhere (Railway/Render/VPS/EC2).

When volume grows: swap SQLite for PostgreSQL (`src/db.js`), replace the
in-process bus (`src/services/bus.js`) with Redis pub/sub to run multiple
instances, and put Kafka in front of `/api/events` only when you're past
tens of thousands of events per minute.

## Project layout

```
server.js                  entry point
src/db.js                  schema + SQLite
src/routes/webhooks.js     CRM "lead created" webhook
src/routes/microsite.js    personalized microsite + tracked brochure download
src/routes/api.js          event ingestion, dashboard API, SSE stream
src/services/pipeline.js   event → rescore → alert → CRM sync → broadcast
src/services/scoring.js    intent model (weights, tiers)
src/services/notifier.js   WhatsApp (Twilio / Meta / console)
src/services/crm.js        CRM sync (HubSpot / log)
public/track.js            engagement tracking SDK (embedded on microsites)
public/dashboard/          live sales dashboard
src/seed.js                demo project
src/simulate.js            synthetic buyer traffic for demos
```
