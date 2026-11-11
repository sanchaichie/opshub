import { randomBytes } from 'node:crypto'
import { PermanentError } from '../../lib/errors'

/**
 * Builds the raw RFC 2822 message Gmail's API sends. Header values are
 * sanitized (no CR/LF), so customer data like a name can never inject extra
 * headers such as Bcc; non-ASCII subjects use RFC 2047 encoding.
 */

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/

const headerSafe = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()
const encodeWord = (value: string) => /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

export function buildRawMessage({ to, subject, text, html }: { to: string, subject: string, text: string, html: string }): string {
  if (!EMAIL.test(to)) throw new PermanentError('Invalid recipient address')
  const boundary = `opshub-${randomBytes(12).toString('hex')}`

  const lines = [
    `To: ${headerSafe(to)}`,
    `Subject: ${encodeWord(headerSafe(subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
    '',
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

/**
 * Who actually receives mail or invites. In the public demo it's ALWAYS the
 * owner's allowlisted inbox, never the order's customer, whoever typed what.
 */
export function recipientFor(customerEmail: string | null, isDemo: boolean, demoAllowlist: string): string {
  if (isDemo) {
    const allowed = demoAllowlist.split(',').map(s => s.trim()).filter(s => EMAIL.test(s))
    if (!allowed.length) throw new PermanentError('Demo email is disabled: NUXT_DEMO_EMAIL_ALLOWLIST is empty')
    return allowed[0]!
  }
  if (!customerEmail || !EMAIL.test(customerEmail)) throw new PermanentError('Order has no valid customer email')
  return customerEmail
}

export function followUpEmail({ customerName, orgName, items }: { customerName: string | null, orgName: string, items: { name: string, quantity: number }[] }) {
  const first = (customerName ?? '').trim().split(/\s+/)[0] || 'there'
  const list = items.map(i => `${i.quantity} × ${i.name}`)
  const subject = `Your ${orgName} order has arrived`
  const text = [
    `Hi ${first},`,
    '',
    `Your order from ${orgName} was delivered:`,
    ...list.map(l => `  • ${l}`),
    '',
    'If anything isn\'t right, just reply to this email and we\'ll sort it out.',
    '',
    `— The ${orgName} team`,
  ].join('\n')
  const html = `<p>Hi ${escapeHtml(first)},</p><p>Your order from ${escapeHtml(orgName)} was delivered:</p><ul>${list.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul><p>If anything isn't right, just reply to this email and we'll sort it out.</p><p>— The ${escapeHtml(orgName)} team</p>`
  return { subject, text, html }
}
