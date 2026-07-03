export const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  intentThreshold: Number(process.env.INTENT_THRESHOLD || 85),
  notifyCooldownMinutes: Number(process.env.NOTIFY_COOLDOWN_MINUTES || 60),
  salesExecPhone: process.env.SALES_EXEC_PHONE || '',
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_WHATSAPP_FROM || '',
  },
  metaWhatsApp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  },
  hubspotToken: process.env.HUBSPOT_TOKEN || '',
};
