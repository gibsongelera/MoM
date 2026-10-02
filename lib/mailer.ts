// Server-only transactional email via SMTP (Brevo). Used for password-reset
// links and could power meeting invites later. This is INDEPENDENT of Supabase
// Auth's built-in SMTP — we generate the auth link with the admin API and send
// it ourselves, so a flaky Supabase SMTP integration can't block sign-in help.
import nodemailer from 'nodemailer';

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS).');
  }
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user, pass },
  });
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(mail: Mail): Promise<{ messageId: string }> {
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const fromName = process.env.SMTP_FROM_NAME || 'ZPPSU SmartMin';
  const text = mail.text || mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Preferred: Brevo HTTP API — NOT subject to the SMTP "Authorized IPs"
  // restriction, so it works from any host (localhost, Vercel, Supabase-free).
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo API ${res.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { messageId: data.messageId || 'brevo-api' };
  }

  // Fallback: SMTP relay (requires the sending IP to be authorized in Brevo).
  const info = await getTransport().sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: mail.to,
    subject: mail.subject,
    text,
    html: mail.html,
  });
  return { messageId: info.messageId };
}

/** Branded password-reset email body. */
export function resetEmailHtml(link: string, name?: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f1f1f">
    <div style="background:#570000;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">ZPPSU SmartMin</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:.9">Institutional Governance &amp; AI Assistant</p>
    </div>
    <div style="border:1px solid #e5e0d5;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px">Hello${name ? ' ' + name : ''},</p>
      <p style="font-size:15px">We received a request to reset your SmartMin password. Click the button below to choose a new one. This link expires in about an hour.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${link}" style="background:#570000;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block">Reset my password</a>
      </p>
      <p style="font-size:13px;color:#666">If the button doesn't work, copy this link into your browser:</p>
      <p style="font-size:12px;word-break:break-all;color:#570000">${link}</p>
      <p style="font-size:13px;color:#666;margin-top:24px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      <p style="font-size:12px;color:#999;margin-top:24px">© Zamboanga Peninsula Polytechnic State University</p>
    </div>
  </div>`;
}

/** Branded email-confirmation body (signup). */
export function confirmEmailHtml(link: string, name?: string): string {
  return `
  <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f1f1f">
    <div style="background:#570000;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px">ZPPSU SmartMin</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:.9">Institutional Governance &amp; AI Assistant</p>
    </div>
    <div style="border:1px solid #e5e0d5;border-top:0;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px">Hello${name ? ' ' + name : ''},</p>
      <p style="font-size:15px">Confirm your email to finish creating your SmartMin account. You will be able to sign in after you click the button below.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${link}" style="background:#570000;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block">Confirm my email</a>
      </p>
      <p style="font-size:13px;color:#666">If the button doesn't work, copy this link into your browser:</p>
      <p style="font-size:12px;word-break:break-all;color:#570000">${link}</p>
      <p style="font-size:13px;color:#666;margin-top:24px">If you didn't create an account, you can ignore this email.</p>
      <p style="font-size:12px;color:#999;margin-top:24px">© Zamboanga Peninsula Polytechnic State University</p>
    </div>
  </div>`;
}
