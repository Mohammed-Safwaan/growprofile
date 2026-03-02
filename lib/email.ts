/**
 * Email Service
 *
 * Provides email sending capabilities using Resend SDK.
 * Falls back to console logging in development if no API key is configured.
 *
 * Usage:
 *   import { sendEmail, sendWelcomeEmail, sendCampaignAlert } from '@/lib/email'
 */

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

// ─── Core send function ───────────────────────────────

export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromAddress = options.from || process.env.EMAIL_FROM || 'GrowProfile <noreply@growprofile.com>'

  if (!apiKey) {
    // Dev mode: log to console
    console.log('[email] (dev mode, no RESEND_API_KEY set)')
    console.log(`  To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`)
    console.log(`  Subject: ${options.subject}`)
    console.log(`  Body preview: ${options.text || options.html.slice(0, 200)}...`)
    return { success: true, id: `dev-${Date.now()}` }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: options.replyTo,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[email] Resend API error:', data)
      return { success: false, error: data.message || 'Email send failed' }
    }

    return { success: true, id: data.id }
  } catch (error: any) {
    console.error('[email] Failed to send:', error)
    return { success: false, error: error.message }
  }
}

// ─── Template helpers ─────────────────────────────────

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; }
    .container { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #7c3aed, #a855f7, #ec4899); padding: 32px 24px; text-align: center; }
    .header h1 { color: #fff; font-size: 24px; margin: 0; }
    .body { padding: 32px 24px; color: #334155; line-height: 1.6; }
    .body h2 { color: #1e293b; margin-top: 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #7c3aed, #a855f7); color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .footer { padding: 24px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; }
    .stat-box { display: inline-block; padding: 12px 20px; background: #f1f5f9; border-radius: 8px; margin: 4px; text-align: center; }
    .stat-box .value { font-size: 24px; font-weight: 700; color: #7c3aed; }
    .stat-box .label { font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div style="padding: 24px;">
    <div class="container">
      <div class="header">
        <h1>GrowProfile</h1>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        &copy; ${new Date().getFullYear()} GrowProfile. All rights reserved.<br>
        <a href="\${unsubscribeUrl}" style="color: #94a3b8;">Unsubscribe</a>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ─── Pre-built email types ────────────────────────────

/**
 * Welcome email sent after signup
 */
export async function sendWelcomeEmail(params: {
  to: string
  name: string
}): Promise<EmailResult> {
  const { to, name } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://growprofile.com'

  return sendEmail({
    to,
    subject: `Welcome to GrowProfile, ${name}! 🎉`,
    html: baseTemplate(`
      <h2>Welcome, ${name}!</h2>
      <p>Thanks for joining GrowProfile — the smartest way to grow your Instagram audience through automated DMs.</p>
      <p>Here's how to get started:</p>
      <ol>
        <li><strong>Connect your Instagram</strong> — Link your business or creator account</li>
        <li><strong>Create a campaign</strong> — Set up keywords, messages, and triggers</li>
        <li><strong>Watch it grow</strong> — Sit back while your DMs convert followers into leads</li>
      </ol>
      <a href="${appUrl}/dashboard" class="btn">Go to Dashboard →</a>
      <p style="color: #64748b; font-size: 14px;">Need help? Reply to this email or check our <a href="${appUrl}/dashboard/help">Help Center</a>.</p>
    `),
    text: `Welcome to GrowProfile, ${name}! Get started at ${appUrl}/dashboard`,
  })
}

/**
 * Campaign status change notification
 */
export async function sendCampaignAlert(params: {
  to: string
  name: string
  campaignName: string
  status: string
  reason?: string
}): Promise<EmailResult> {
  const { to, name, campaignName, status, reason } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://growprofile.com'

  const statusText = {
    ACTIVE: 'is now active and sending DMs',
    PAUSED: 'has been paused',
    ARCHIVED: 'has been archived',
    FAILED: 'encountered an error',
  }[status] || `status changed to ${status}`

  return sendEmail({
    to,
    subject: `Campaign "${campaignName}" ${status.toLowerCase()}`,
    html: baseTemplate(`
      <h2>Campaign Update</h2>
      <p>Hi ${name},</p>
      <p>Your campaign <strong>"${campaignName}"</strong> ${statusText}.</p>
      ${reason ? `<p style="background: #fef2f2; padding: 12px; border-radius: 8px; color: #991b1b;"><strong>Reason:</strong> ${reason}</p>` : ''}
      <a href="${appUrl}/dashboard/apps/autodm" class="btn">View Campaign →</a>
    `),
    text: `Campaign "${campaignName}" ${statusText}. View at ${appUrl}/dashboard/apps/autodm`,
  })
}

/**
 * Weekly digest email with stats
 */
export async function sendWeeklyDigest(params: {
  to: string
  name: string
  stats: {
    dmsSent: number
    leadsCapured: number
    activeCampaigns: number
    topKeyword?: string
  }
}): Promise<EmailResult> {
  const { to, name, stats } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://growprofile.com'

  return sendEmail({
    to,
    subject: `Your weekly GrowProfile digest 📊`,
    html: baseTemplate(`
      <h2>Weekly Digest</h2>
      <p>Hi ${name}, here's your performance summary for the past week:</p>
      <div style="text-align: center; margin: 24px 0;">
        <div class="stat-box">
          <div class="value">${stats.dmsSent}</div>
          <div class="label">DMs Sent</div>
        </div>
        <div class="stat-box">
          <div class="value">${stats.leadsCapured}</div>
          <div class="label">Leads Captured</div>
        </div>
        <div class="stat-box">
          <div class="value">${stats.activeCampaigns}</div>
          <div class="label">Active Campaigns</div>
        </div>
      </div>
      ${stats.topKeyword ? `<p>🔑 Your top-performing keyword: <strong>#${stats.topKeyword}</strong></p>` : ''}
      <a href="${appUrl}/dashboard/growth/insights" class="btn">View Full Analytics →</a>
    `),
    text: `Weekly digest: ${stats.dmsSent} DMs sent, ${stats.leadsCapured} leads captured. View at ${appUrl}/dashboard`,
  })
}

/**
 * Usage limit warning email
 */
export async function sendUsageLimitWarning(params: {
  to: string
  name: string
  resourceName: string
  current: number
  limit: number
  percentage: number
}): Promise<EmailResult> {
  const { to, name, resourceName, current, limit, percentage } = params
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://growprofile.com'

  return sendEmail({
    to,
    subject: `⚠️ You've used ${percentage}% of your ${resourceName} limit`,
    html: baseTemplate(`
      <h2>Usage Alert</h2>
      <p>Hi ${name},</p>
      <p>You've used <strong>${percentage}%</strong> of your monthly <strong>${resourceName}</strong> limit.</p>
      <div style="text-align: center; margin: 24px 0;">
        <div class="stat-box">
          <div class="value">${current} / ${limit}</div>
          <div class="label">${resourceName}</div>
        </div>
      </div>
      <p>Upgrade your plan to increase your limits and keep growing.</p>
      <a href="${appUrl}/dashboard/plan" class="btn">Upgrade Plan →</a>
    `),
    text: `Usage alert: ${current}/${limit} ${resourceName} used (${percentage}%). Upgrade at ${appUrl}/dashboard/plan`,
  })
}

/**
 * Account suspended notification
 */
export async function sendSuspensionEmail(params: {
  to: string
  name: string
  reason: string
}): Promise<EmailResult> {
  const { to, name, reason } = params

  return sendEmail({
    to,
    subject: 'Your GrowProfile account has been suspended',
    html: baseTemplate(`
      <h2>Account Suspended</h2>
      <p>Hi ${name},</p>
      <p>Your GrowProfile account has been suspended for the following reason:</p>
      <p style="background: #fef2f2; padding: 12px; border-radius: 8px; color: #991b1b;">${reason}</p>
      <p>If you believe this is a mistake, please contact our support team by replying to this email.</p>
    `),
    text: `Your GrowProfile account has been suspended. Reason: ${reason}`,
    replyTo: 'support@growprofile.com',
  })
}
