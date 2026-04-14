import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, requireManager } from '@/lib/auth-helpers'
import { renderAndStoreInvoicePDF } from '@/lib/pdf/render-invoice'
import { reportError } from '@/lib/observability'

// Audit R3-#1: this route is now a thin wrapper around `renderAndStoreInvoicePDF`.
// The previous version inlined the rendering pipeline AND was the only entry
// point — `lib/actions/invoicing.ts:generateInvoicePDF` did an HTTP self-fetch
// here, which always returned 401 because session cookies aren't forwarded
// on server-side fetch. Both call sites now share the helper directly.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const body = await req.json().catch(() => ({}))
    const invoiceId = body.invoiceId as string | undefined

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    // Authn + authz: must be manager of the job's company
    let companyId: string
    let role: string | null
    try {
      ;({ companyId, role } = await getUserWithCompany())
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    try {
      requireManager(role)
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    try {
      await verifyJobOwnership(jobId, companyId)
    } catch {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const supabase = await createClient()
    const { url } = await renderAndStoreInvoicePDF(supabase, {
      invoiceId,
      jobId,
      companyId,
    })

    return NextResponse.json({ url })
  } catch (err) {
    reportError(err, { route: '/api/jobs/[jobId]/invoice-pdf' })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
