import 'server-only';

/**
 * Transactional email through Brevo's HTTP API (ported from the root app's
 * mailer, minus the SMTP fallback, so no nodemailer dependency is needed).
 * The HTTP API is not subject to Brevo's SMTP "authorized IPs" restriction,
 * so it works from localhost and any host.
 *
 * Env: BREVO_API_KEY, SMTP_FROM (sender address), SMTP_FROM_NAME.
 * Without BREVO_API_KEY, sending is skipped (in-app notifications still work).
 */
export interface Mail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.SMTP_FROM);
}

export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.SMTP_FROM;
  if (!apiKey || !fromEmail) throw new Error('Email is not configured (BREVO_API_KEY / SMTP_FROM).');
  const text = mail.text ?? mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: fromEmail, name: process.env.SMTP_FROM_NAME || 'ZPPSU SmartMin' },
      to: [{ email: mail.to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email provider returned ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/** Escapes text for safe interpolation into an HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
