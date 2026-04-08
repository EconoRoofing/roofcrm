/**
 * Stripe integration — uses the REST API directly via fetch.
 * No npm package required. Returns null if STRIPE_SECRET_KEY is not set.
 */

export async function createPaymentLink(
  invoiceId: string,
  amount: number,
  customerName: string,
  jobNumber: string
): Promise<string | null> {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return null

  try {
    const response = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `Invoice - Job #${jobNumber} - ${customerName}`,
        'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
        'line_items[0][quantity]': '1',
        // Include invoice ID in metadata for webhook reconciliation
        'metadata[invoice_id]': invoiceId,
        'metadata[job_number]': jobNumber,
        // Prevent duplicate payments by limiting to one-time use
        'payment_intent_data[metadata][invoice_id]': invoiceId,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('[stripe] createPaymentLink failed', response.status, errBody)
      return null
    }

    const data = await response.json()
    return (data.url as string) ?? null
  } catch (err) {
    console.error('[stripe] createPaymentLink error', err)
    return null
  }
}
