// Outgoing email. Configure with environment variables:
//   SMTP_HOST, SMTP_PORT (587 by default; 465 uses SSL), SMTP_USER, SMTP_PASS
//   MAIL_FROM   sender shown to customers (default "Autique <info@autique.pk>")
//   MAIL_REPLY_TO  optional reply-to address (defaults to MAIL_FROM)
// For testing without a mail account, set MAIL_OUTBOX_DIR to a folder: every
// email is saved there as an .eml file (open it in Outlook/Mail) plus an .html
// preview, instead of being sent.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const FROM = process.env.MAIL_FROM || 'Autique <info@autique.pk>';
const REPLY_TO = process.env.MAIL_REPLY_TO || '';
const OUTBOX = process.env.MAIL_OUTBOX_DIR || '';

let transport = null;
let mode = 'off';
if (process.env.SMTP_HOST) {
  const port = Number(process.env.SMTP_PORT) || 587;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined
  });
  mode = 'smtp';
} else if (OUTBOX) {
  transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  mode = 'outbox';
}

const safeName = s => String(s).replace(/[^\w.@-]+/g, '_').slice(0, 80);

// Returns { status: 'sent' | 'saved' | 'off', ... }
async function send({ to, subject, html, text, attachments }) {
  if (!transport) {
    console.log(`[email not sent: set SMTP_HOST to enable] To ${to}: ${subject}`);
    return { status: 'off' };
  }
  const info = await transport.sendMail({ from: FROM, replyTo: REPLY_TO || undefined, to, subject, html, text, attachments });
  if (mode === 'outbox') {
    fs.mkdirSync(OUTBOX, { recursive: true });
    const base = path.join(OUTBOX, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeName(to)}_${safeName(subject)}`);
    fs.writeFileSync(base + '.eml', info.message);
    fs.writeFileSync(base + '.html', html);
    for (const a of attachments || []) fs.writeFileSync(`${base}_${safeName(a.filename)}`, a.content);
    return { status: 'saved', file: base + '.eml' };
  }
  return { status: 'sent', messageId: info.messageId };
}

module.exports = { send, mode: () => mode, FROM };
