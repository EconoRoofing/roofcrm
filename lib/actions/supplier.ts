'use server'

import { createClient } from '@/lib/supabase/server'
import { sendEstimateEmail } from '@/lib/email'
import { calculateMaterials, type MaterialCalcInput } from '@/lib/material-calculator'

export async function generateSupplierOrderText(jobId: string): Promise<string> {
  const supabase = await createClient()

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(
      'id, job_number, customer_name, address, city, squares, material, felt_type, layers, gutter_length_ft, ridge_type, job_type'
    )
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    throw new Error('Job not found')
  }

  const { data: materialList } = await supabase
    .from('material_lists')
    .select('items, waste_factor, supplier_name')
    .eq('job_id', jobId)
    .single()

  let text = `ROOFING SUPPLY ORDER\n`
  text += `=====================================\n\n`
  text += `Job Details:\n`
  text += `Job #: ${job.job_number}\n`
  text += `Customer: ${job.customer_name}\n`
  text += `Address: ${job.address}, ${job.city}\n`
  text += `Job Type: ${job.job_type}\n`
  text += `\n`

  text += `Materials Needed:\n`
  text += `-------------------------------------\n`

  if (materialList?.items && Array.isArray(materialList.items)) {
    materialList.items.forEach((item: any) => {
      text += `• ${item.name}: ${item.quantity} ${item.unit}\n`
      if (item.formula) {
        text += `  (${item.formula})\n`
      }
    })
  } else {
    // Fallback calculation if no material list exists
    const calcInput: MaterialCalcInput = {
      squares: job.squares || 0,
      job_type: job.job_type,
      material: job.material || undefined,
      felt_type: job.felt_type || undefined,
      layers: job.layers || undefined,
      gutter_length_ft: job.gutter_length_ft || undefined,
    }

    const materials = calculateMaterials(calcInput)
    materials.forEach((item) => {
      text += `• ${item.name}: ${item.quantity} ${item.unit}\n`
      text += `  (${item.formula})\n`
    })
  }

  text += `\n`
  text += `Waste Factor: ${materialList?.waste_factor ? (materialList.waste_factor * 100).toFixed(0) + '%' : '10%'}\n`
  text += `\n`
  text += `Please provide quote and delivery timeline.\n`
  text += `Thank you,\nRoofing Company\n`

  return text
}

export async function emailSupplierOrder(
  jobId: string,
  supplierEmail: string,
  senderCompanyName: string = 'Roofing Company'
): Promise<boolean> {
  try {
    const text = await generateSupplierOrderText(jobId)

    // Ensure valid email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierEmail)) {
      console.warn(`Invalid supplier email: ${supplierEmail}`)
      return false
    }

    // Use sendEstimateEmail template — adjust subject/body as needed
    // For simplicity, we're using the existing email infrastructure
    const resend = process.env.RESEND_API_KEY

    if (!resend) {
      console.warn('RESEND_API_KEY not set — cannot send supplier order')
      return false
    }

    // Import Resend dynamically to avoid build issues if not available
    const { Resend } = await import('resend')
    const client = new Resend(resend)

    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

    await client.emails.send({
      from: `${senderCompanyName} <${fromEmail}>`,
      to: supplierEmail,
      subject: `Material Order Request - Job ${jobId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; white-space: pre-wrap;">
          <h2>Roofing Supply Order</h2>
          <p>${text}</p>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #ccc;">
          <p style="color: #666; font-size: 12px;">
            This is an automated order request. Please reply with quote and availability.
          </p>
        </div>
      `,
    })

    return true
  } catch (error) {
    console.error('Supplier email error:', error)
    return false
  }
}
