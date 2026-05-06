const twilio = require('twilio');

let client = null;

function getClient() {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio credentials not configured');
    client = twilio(sid, token);
  }
  return client;
}

async function sendSms(to, body) {
  const from = process.env.TWILIO_SMS_FROM;
  if (!from) throw new Error('TWILIO_SMS_FROM not configured');
  await getClient().messages.create({ from, to, body });
}

// Send critical alert to parent via SMS
async function sendCriticalAlert(parentPhone, studentName, message) {
  if (!parentPhone) return;
  const body = `SchoolBridge Alert — ${studentName}: ${message} Reply STOP to unsubscribe.`;
  try {
    await sendSms(parentPhone, body);
    console.log(`[sms] Critical alert sent to ${maskPhone(parentPhone)}`);
  } catch (err) {
    console.error(`[sms] Failed to send alert: ${err.message}`);
  }
}

function maskPhone(str) {
  if (!str) return str;
  return str.replace(/(\+\d{1,3})(\d+)(\d{4})/, (_, p, mid, last4) =>
    `${p}${'*'.repeat(mid.length)}${last4}`
  );
}

module.exports = { sendSms, sendCriticalAlert };
