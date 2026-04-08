'use server'

import { createClient } from '@/lib/supabase/server'
import { getUserWithCompany, verifyJobOwnership, escapeHtml } from '@/lib/auth-helpers'

interface PhotoReportResult {
  html: string
  photoCount: number
  categories: string[]
}

const CATEGORY_ORDER = ['Before', 'During', 'After', 'Damage', 'General'] as const

const CATEGORY_COLORS: Record<string, string> = {
  Before: '#f59e0b',
  During: '#3b82f6',
  After: '#22c55e',
  Damage: '#ef4444',
  General: '#8b5cf6',
}

export async function generatePhotoReport(jobId: string): Promise<PhotoReportResult> {
  const { companyId } = await getUserWithCompany()
  const job = await verifyJobOwnership(jobId, companyId)

  const supabase = await createClient()

  // Fetch company name
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single()

  const companyName = company?.name ?? 'Roofing Company'

  // Fetch all photos for this job
  const { data: photos, error } = await supabase
    .from('job_photos')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })

  if (error) throw new Error('Failed to fetch photos')

  const allPhotos = photos ?? []

  if (allPhotos.length === 0) {
    throw new Error('No photos found for this job')
  }

  // Generate signed URLs in a single batch call (1-hour expiry)
  const paths = allPhotos.map(p => p.storage_path)
  const { data: signedBatch } = await supabase.storage
    .from('estimates')
    .createSignedUrls(paths, 3600)

  const urlMap = new Map((signedBatch ?? []).map(s => [s.path, s.signedUrl]))
  const photosWithUrls = allPhotos.map(photo => ({
    ...photo,
    signedUrl: urlMap.get(photo.storage_path) ?? null,
  }))

  // Group by category
  const grouped: Record<string, typeof photosWithUrls> = {}
  for (const photo of photosWithUrls) {
    const cat = photo.category || 'General'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(photo)
  }

  // Determine which categories have photos, in display order
  const activeCategories = CATEGORY_ORDER.filter((cat) => grouped[cat]?.length)

  // Build report date
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // Job details
  const customerName = escapeHtml(job.customer_name ?? 'N/A')
  const address = escapeHtml(job.address ?? 'N/A')
  const jobNumber = escapeHtml(job.job_number ?? job.id?.slice(0, 8) ?? '')

  // Build category sections
  const sections = activeCategories.map((cat) => {
    const catPhotos = grouped[cat]
    const color = CATEGORY_COLORS[cat] ?? '#888'

    const photoCards = catPhotos
      .map((p) => {
        if (!p.signedUrl) return ''

        const timestamp = formatReportTimestamp(p.created_at)
        const gpsLine =
          p.latitude != null && p.longitude != null
            ? `<div style="font-size:11px;color:#888;margin-top:4px;">GPS: ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</div>`
            : ''

        return `
          <div style="break-inside:avoid;border:1px solid #ddd;border-radius:6px;overflow:hidden;background:#fff;">
            <img src="${escapeHtml(p.signedUrl)}" alt="${escapeHtml(cat)} photo" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;" />
            <div style="padding:8px 10px;">
              <div style="font-size:12px;color:#444;">${escapeHtml(timestamp)}</div>
              ${gpsLine}
            </div>
          </div>
        `
      })
      .filter(Boolean)
      .join('\n')

    return `
      <div style="margin-bottom:32px;break-inside:avoid;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <div style="width:4px;height:20px;border-radius:2px;background:${color};"></div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#222;">${escapeHtml(cat)}</h2>
          <span style="font-size:13px;color:#888;">(${catPhotos.length} photo${catPhotos.length !== 1 ? 's' : ''})</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
          ${photoCards}
        </div>
      </div>
    `
  })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Photo Report - Job ${escapeHtml(jobNumber)}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      img { max-height: 280px; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #222; }
  </style>
</head>
<body>
  <div style="max-width:900px;margin:0 auto;padding:32px 24px;">

    <!-- Print button -->
    <div class="no-print" style="text-align:right;margin-bottom:16px;">
      <button onclick="window.print()" style="padding:8px 20px;border-radius:6px;border:1px solid #ccc;background:#fff;font-size:13px;font-weight:600;cursor:pointer;">
        Print Report
      </button>
    </div>

    <!-- Header -->
    <div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111;">${escapeHtml(companyName)}</h1>
          <div style="font-size:13px;color:#888;">Photo Documentation Report</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:12px;color:#888;">Report Date</div>
          <div style="font-size:14px;font-weight:600;color:#222;">${escapeHtml(reportDate)}</div>
        </div>
      </div>

      <div style="margin-top:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;">
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Job Number</div>
          <div style="font-size:14px;font-weight:600;color:#222;">${customerName ? jobNumber : 'N/A'}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Customer</div>
          <div style="font-size:14px;font-weight:600;color:#222;">${customerName}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Address</div>
          <div style="font-size:14px;font-weight:600;color:#222;">${address}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px;">Total Photos</div>
          <div style="font-size:14px;font-weight:600;color:#222;">${allPhotos.length}</div>
        </div>
      </div>
    </div>

    <!-- Photo sections -->
    ${sections.join('\n')}

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0 8px;border-top:1px solid #e0e0e0;margin-top:16px;">
      <div style="font-size:11px;color:#aaa;">Generated by ${escapeHtml(companyName)} on ${escapeHtml(reportDate)}</div>
    </div>
  </div>
</body>
</html>`

  return {
    html,
    photoCount: allPhotos.length,
    categories: activeCategories as string[],
  }
}

function formatReportTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
