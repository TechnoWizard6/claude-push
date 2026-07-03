import { db } from '../db.js';
import { config } from '../config.js';
import { publish } from './bus.js';

// Sends a WhatsApp message via whichever provider is configured.
// Falls back to "console mode": the message is logged and stored, so the whole
// pipeline is demoable without any WhatsApp credentials.
export async function sendWhatsApp(leadId, recipient, message) {
  let channel = 'console';
  let status = 'logged';

  try {
    if (config.twilio.accountSid && config.twilio.authToken) {
      channel = 'whatsapp';
      const auth = Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            From: config.twilio.from,
            To: `whatsapp:${recipient}`,
            Body: message,
          }),
        }
      );
      status = res.ok ? 'sent' : 'failed';
    } else if (config.metaWhatsApp.token && config.metaWhatsApp.phoneNumberId) {
      channel = 'whatsapp';
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${config.metaWhatsApp.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.metaWhatsApp.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: recipient.replace(/^\+/, ''),
            type: 'text',
            text: { body: message },
          }),
        }
      );
      status = res.ok ? 'sent' : 'failed';
    } else {
      console.log(`[whatsapp:console-mode] to=${recipient || '(sales exec not configured)'}\n${message}`);
    }
  } catch (err) {
    status = 'failed';
    console.error('[notifier] send failed:', err.message);
  }

  const info = db
    .prepare('INSERT INTO notifications (lead_id, channel, recipient, message, status) VALUES (?, ?, ?, ?, ?)')
    .run(leadId, channel, recipient || '', message, status);

  publish('notification', {
    id: Number(info.lastInsertRowid),
    lead_id: leadId,
    channel,
    recipient,
    message,
    status,
    created_at: new Date().toISOString(),
  });

  return { channel, status };
}
