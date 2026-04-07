export async function sendSMS(to: string, body: string): Promise<{ success: boolean; sid?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.log('Twilio not configured — skipping SMS')
    return { success: false }
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
      }
    )
    const data = await response.json()
    if (data.sid) return { success: true, sid: data.sid }
    console.error('Twilio error:', data)
    return { success: false }
  } catch (error) {
    console.error('SMS send error:', error)
    return { success: false }
  }
}
