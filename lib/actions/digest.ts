'use server'

import { createClient as _createClient } from '@/lib/supabase/server'
import { getDashboardData } from './dashboard'
import { formatCurrency } from '@/lib/utils'

export async function sendDailyDigest(): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  const managerEmail = process.env.MANAGER_EMAIL
  if (!resendKey || !managerEmail) return false

  const data = await getDashboardData()

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1117; color: #f0f2f5; padding: 24px; border-radius: 12px;">
      <h2 style="color: #00e676; margin-top: 0;">RoofCRM Daily Digest</h2>
      <p style="color: #7a8294;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 12px; background: #151921; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #00e676;">${formatCurrency(data.pipelineValue)}</div>
            <div style="font-size: 12px; color: #7a8294;">Pipeline</div>
          </td>
          <td style="padding: 12px; background: #151921; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold;">${formatCurrency(data.revenueThisMonth)}</div>
            <div style="font-size: 12px; color: #7a8294;">Revenue This Month</div>
          </td>
          <td style="padding: 12px; background: #151921; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: ${data.staleLeadCount > 0 ? '#ff5252' : '#00e676'};">${data.staleLeadCount}</div>
            <div style="font-size: 12px; color: #7a8294;">Stale Leads</div>
          </td>
        </tr>
      </table>

      <h3 style="color: #f0f2f5; margin-top: 24px;">Revenue by Rep</h3>
      ${data.revenueByRep.map((r, i) => `
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e2430;">
          <span>${i + 1}. ${r.repName}</span>
          <span style="font-weight: bold;">${formatCurrency(r.revenue)} (${r.jobCount} jobs)</span>
        </div>
      `).join('')}

      <p style="color: #4a5168; font-size: 12px; margin-top: 24px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://roofcrm-alpha.vercel.app'}/pipeline" style="color: #00e676;">Open RoofCRM Dashboard</a>
      </p>
    </div>
  `

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(resendKey)
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

    await resend.emails.send({
      from: `RoofCRM <${fromEmail}>`,
      to: managerEmail,
      subject: `RoofCRM Digest: ${formatCurrency(data.pipelineValue)} pipeline, ${data.staleLeadCount} stale leads`,
      html,
    })
    return true
  } catch (error) {
    console.error('Digest email error:', error)
    return false
  }
}
