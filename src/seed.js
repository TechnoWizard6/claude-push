import { db } from './db.js';

const existing = db.prepare('SELECT COUNT(*) AS n FROM projects').get();
if (existing.n > 0) {
  console.log('Database already seeded — skipping. Delete data/leads-track.db to reseed.');
  process.exit(0);
}

db.prepare(
  `INSERT INTO projects (slug, name, location, description, price_range, amenities, units, brochure_name)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
).run(
  'skyline-heights',
  'Skyline Heights',
  'Whitefield, Bengaluru',
  'Premium 2 & 3 BHK residences across 4 towers with 70% open space, a 40,000 sq.ft clubhouse and lake-facing views. RERA approved, possession Dec 2027.',
  '₹ 89L – 1.6Cr',
  JSON.stringify(['Clubhouse', 'Swimming pool', 'Gym', 'Kids play area', 'EV charging', '24x7 security', 'Co-working lounge']),
  JSON.stringify([
    { type: '2 BHK', size: '1,180 sq.ft', price: '₹ 89L onwards' },
    { type: '2.5 BHK', size: '1,340 sq.ft', price: '₹ 1.05Cr onwards' },
    { type: '3 BHK', size: '1,620 sq.ft', price: '₹ 1.32Cr onwards' },
    { type: '3 BHK Premium', size: '1,850 sq.ft', price: '₹ 1.6Cr onwards' },
  ]),
  'skyline-heights-brochure.pdf'
);

console.log('Seeded project "Skyline Heights" (slug: skyline-heights).');
console.log('Create a lead with:');
console.log(`  curl -X POST http://localhost:3000/webhooks/crm/lead -H 'Content-Type: application/json' \\
    -d '{"name":"Tarun Mehta","phone":"+919876543210","source":"facebook","project":"skyline-heights"}'`);
