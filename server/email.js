import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'noreply@rhettgames.com';

let transporter = null;

if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  console.log(`[email] SMTP configured → ${SMTP_HOST}:${SMTP_PORT}`);
} else {
  console.log('[email] No SMTP configured — reset codes will be logged to console');
}

export async function sendResetCode(toEmail, code, userName){
  const subject = `RHETT GAMES — Password Reset Code`;
  const text = `Hi ${userName},\n\nYour password reset code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:monospace;background:#0a0a12;color:#fff;padding:32px;border-radius:8px;max-width:480px;">
      <h2 style="color:#ffcb3a;margin:0 0 16px;">RHETT GAMES</h2>
      <p>Hi <strong>${userName}</strong>,</p>
      <p>Your password reset code is:</p>
      <div style="font-size:28px;letter-spacing:6px;color:#ffcb3a;background:#161622;padding:16px 24px;border-radius:6px;text-align:center;margin:16px 0;">${code}</div>
      <p style="color:#888;font-size:12px;">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
    </div>`;

  if (!transporter) {
    console.log(`[email] Reset code for ${userName} (${toEmail}): ${code}`);
    return true;
  }

  try {
    await transporter.sendMail({ from: SMTP_FROM, to: toEmail, subject, text, html });
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return false;
  }
}
