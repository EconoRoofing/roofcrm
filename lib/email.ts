import { Resend } from 'resend'

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function sendEstimateEmail(
  customerEmail: string,
  customerName: string,
  companyName: string,
  pdfUrl: string
): Promise<boolean> {
  const resend = getResendClient()
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return false
  }

  if (!isValidEmail(customerEmail)) {
    console.warn(`Invalid customer email: ${customerEmail}`)
    return false
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  try {
    await resend.emails.send({
      from: `${companyName} <${fromEmail}>`,
      to: customerEmail,
      subject: `Your Roofing Agreement from ${companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hello ${customerName},</h2>
          <p>Thank you for choosing ${companyName} for your roofing project.</p>
          <p>Your signed roofing agreement is attached below:</p>
          <p><a href="${pdfUrl}" style="display: inline-block; padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">View Your Agreement</a></p>
          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            If you have any questions, please don&apos;t hesitate to contact us.
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">
            &mdash; ${companyName}
          </p>
        </div>
      `,
    })
    return true
  } catch (error) {
    console.error('Email send error:', error)
    return false
  }
}
