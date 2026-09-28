// Outgoing email through Brevo's HTTPS API (Railway blocks outbound SMTP on
// the Free, Trial and Hobby plans, so SMTP can't be used there).
//   BREVO_API_KEY  Brevo → SMTP & API → API keys. Without it, email is off.
//   BREVO_API_URL  optional, for testing against a local mock server

const API_URL = process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email';
const API_KEY = process.env.BREVO_API_KEY || '';
const SENDER = { name: 'Autique', email: 'info@autique.pk' };
const TIMEOUT_MS = 15000;
const MAX_ATTACHMENT = 4 * 1024 * 1024;   // Brevo's limit per attachment

const configured = () => !!API_KEY;

// Returns { status: 'sent', messageId } or { status: 'off' }. Throws on a
// timeout, network error or non-2xx response, with Brevo's reply in the message.
async function send({ to, name, subject, html, text, attachments }) {
  if (!configured()) {
    console.log(`[email not sent: set BREVO_API_KEY to enable] To ${to}: ${subject}`);
    return { status: 'off' };
  }
  const attachment = (attachments || []).map(a => {
    const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
    if (buf.length > MAX_ATTACHMENT) throw new Error(`Attachment ${a.filename} is over Brevo's 4 MB limit`);
    return { name: a.filename, content: buf.toString('base64') };
  });
  const body = {
    sender: SENDER,
    to: [name ? { email: to, name } : { email: to }],
    subject,
    htmlContent: html,
    ...(text ? { textContent: text } : {}),
    ...(attachment.length ? { attachment } : {})
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'api-key': API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    const reason = e.name === 'TimeoutError' ? `no reply from Brevo within ${TIMEOUT_MS / 1000} seconds` : `network error: ${e.cause ? e.cause.message || e.cause.code : e.message}`;
    throw new Error(reason);
  }
  const reply = await res.text().catch(() => '');
  if (!res.ok) {
    console.error(`Brevo rejected the email to ${to} (HTTP ${res.status}): ${reply}`);
    throw new Error(`Brevo HTTP ${res.status}: ${reply.slice(0, 300)}`);
  }
  let messageId = '';
  try { messageId = JSON.parse(reply).messageId || ''; } catch { /* 2xx without JSON is still sent */ }
  return { status: 'sent', messageId };
}

module.exports = { send, configured, SENDER };
