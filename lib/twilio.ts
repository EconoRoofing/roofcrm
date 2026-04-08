// Normalize and validate E.164 phone format
function normalizePhone(phone: string): string | null {
  // Strip everything except digits and leading +
  const cleaned = phone.replace(/[^\d+]/g, '')
  // Add +1 if it's a 10-digit US number
  if (/^\d{10}$/.test(cleaned)) return '+1' + cleaned
  // Already has country code
  if (/^\+1\d{10}$/.test(cleaned)) return cleaned
  // 11 digits starting with 1
  if (/^1\d{10}$/.test(cleaned)) return '+' + cleaned
  // Invalid
  return null
}

export async function sendSMS(
  to: string,
  body: string,
  retries = 2
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('Twilio not configured — skipping SMS')
    return { success: false }
  }

  const normalizedTo = normalizePhone(to)
  if (!normalizedTo) {
    console.error(`Invalid phone number: ${to}`)
    return { success: false, error: 'invalid_phone' }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const options = {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: normalizedTo, From: fromNumber, Body: body }),
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) })
      const data = await response.json()

      if (data.sid) return { success: true, sid: data.sid }

      // Detect opted-out numbers (Twilio error 21610)
      if (data.code === 21610 || data.error_code === 21610) {
        return { success: false, error: 'opted_out' }
      }

      // Retry on server errors
      if (response.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }

      console.error('Twilio error:', data)
      return { success: false, error: data.message ?? 'Unknown error' }
    } catch (error) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      console.error('SMS send error:', error)
      return { success: false, error: 'network_error' }
    }
  }
  return { success: false, error: 'max_retries' }
}
