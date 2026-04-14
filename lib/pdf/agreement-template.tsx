import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Job, Company, EstimateSpecs } from '@/lib/types/database'
import { formatMoneyPdf } from '@/lib/utils'
import { readMoneyFromRow, centsToDollars, halfCents } from '@/lib/money'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgreementProps {
  company: Company
  job: Job
  repSignature?: string   // base64 PNG (optional)
  customerSignature?: string // base64 PNG (optional)
  signedDate?: string     // acceptance date (optional)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function numberToWords(amount: number): string {
  if (amount < 0) return 'zero'
  if (amount === 0) return 'zero'

  const ones = ['','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
    'eighteen','nineteen']
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']

  function below1000(num: number): string {
    if (num === 0) return ''
    if (num < 20) return ones[num] + ' '
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '') + ' '
    return ones[Math.floor(num / 100)] + ' hundred ' + below1000(num % 100)
  }

  function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  const dollars = Math.floor(amount)
  const cents = Math.round((amount - dollars) * 100)

  // Handle millions
  if (dollars >= 1_000_000) {
    const millions = Math.floor(dollars / 1_000_000)
    const remainder = dollars % 1_000_000
    const millionPart = below1000(millions).trim() + ' million'
    let words: string
    if (remainder === 0) {
      words = millionPart
    } else {
      let remWords = ''
      if (remainder >= 1000) remWords += below1000(Math.floor(remainder / 1000)) + 'thousand '
      remWords += below1000(remainder % 1000)
      words = millionPart + ' ' + remWords.trim()
    }
    const result = capitalize(words) + ' dollars'
    if (cents > 0) return result + ` and ${cents}/100`
    return result + ' and 00/100'
  }

  let words = ''
  if (dollars >= 1000) words += below1000(Math.floor(dollars / 1000)) + 'thousand '
  words += below1000(dollars % 1000)
  words = words.trim()

  const result = capitalize(words) + ' dollars'
  if (cents > 0) return result + ` and ${cents}/100`
  return result + ' and 00/100'
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000000',
    paddingTop: 36,
    paddingBottom: 36,
    paddingLeft: 36,
    paddingRight: 36,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  companyNameBlock: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 2,
  },
  companySubtitle: {
    fontSize: 7,
    color: '#444444',
    fontStyle: 'italic',
    marginTop: 1,
  },
  companyAddressBlock: {
    alignItems: 'flex-end',
  },
  companyAddressLine: {
    fontSize: 7.5,
    textAlign: 'right',
  },

  // Title
  titleRow: {
    marginTop: 6,
    marginBottom: 6,
    textAlign: 'center',
  },
  titleText: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },

  // Info box
  infoBox: {
    borderWidth: 1,
    borderColor: '#999999',
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    minHeight: 16,
  },
  infoRowLast: {
    flexDirection: 'row',
    minHeight: 16,
  },
  infoLabel: {
    width: 80,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingLeft: 4,
    paddingTop: 3,
    paddingBottom: 2,
  },
  infoInput: {
    flex: 1,
    backgroundColor: '#FFF9E6',
    fontSize: 9,
    paddingLeft: 4,
    paddingTop: 3,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000080',
    color: '#000080',
  },
  infoLabelRight: {
    width: 100,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    paddingLeft: 6,
    paddingTop: 3,
    paddingBottom: 2,
    borderLeftWidth: 0.5,
    borderLeftColor: '#cccccc',
  },
  infoInputRight: {
    flex: 1,
    backgroundColor: '#FFF9E6',
    fontSize: 9,
    paddingLeft: 4,
    paddingTop: 3,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000080',
    color: '#000080',
  },

  // Body text
  bodyText: {
    fontSize: 8,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  bodyBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  sectionHeader: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    marginTop: 2,
    marginBottom: 3,
  },

  // Specs section
  specsRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  specsLeft: {
    flex: 1,
    paddingRight: 8,
  },
  specsRight: {
    flex: 1,
    paddingLeft: 4,
    borderLeftWidth: 0.5,
    borderLeftColor: '#cccccc',
  },
  specItem: {
    flexDirection: 'row',
    minHeight: 13,
    marginBottom: 1,
    alignItems: 'center',
  },
  specBullet: {
    fontSize: 8,
    width: 8,
  },
  specLabel: {
    fontSize: 8,
    flex: 1,
  },
  specInputBox: {
    backgroundColor: '#FFF9E6',
    fontSize: 9,
    color: '#000080',
    paddingLeft: 3,
    paddingTop: 1,
    paddingBottom: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000080',
    minWidth: 60,
    flex: 1,
  },
  specUnit: {
    fontSize: 7,
    paddingLeft: 2,
  },

  // Yes/No specs
  ynHeader: {
    flexDirection: 'row',
    marginBottom: 2,
    marginTop: 4,
  },
  ynHeaderLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    width: 18,
    textAlign: 'center',
  },
  ynItem: {
    flexDirection: 'row',
    minHeight: 13,
    marginBottom: 1,
    alignItems: 'center',
  },
  ynBox: {
    width: 14,
    height: 11,
    borderWidth: 0.75,
    borderColor: '#999999',
    backgroundColor: '#FFF9E6',
    fontSize: 8,
    color: '#000080',
    textAlign: 'center',
    marginRight: 4,
    paddingTop: 1,
  },
  ynLabel: {
    fontSize: 8,
    flex: 1,
  },

  // Remarks
  remarkInput: {
    backgroundColor: '#FFF9E6',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000080',
    minHeight: 14,
    fontSize: 9,
    color: '#000080',
    paddingLeft: 4,
    paddingTop: 2,
    paddingBottom: 2,
    marginBottom: 3,
  },

  // Pricing
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 18,
    marginBottom: 2,
  },
  pricingLabel: {
    flex: 1,
    fontSize: 8,
  },
  pricingAmountWord: {
    flex: 2,
    backgroundColor: '#FFF9E6',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000080',
    fontSize: 9,
    color: '#000080',
    paddingLeft: 4,
    paddingTop: 2,
    paddingBottom: 2,
  },
  pricingDollarLabel: {
    fontSize: 8,
    marginLeft: 4,
    marginRight: 2,
  },
  pricingAmountBox: {
    width: 70,
    backgroundColor: '#FFF9E6',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000080',
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#000080',
    paddingLeft: 4,
    paddingTop: 2,
    paddingBottom: 2,
    textAlign: 'right',
    paddingRight: 4,
  },
  pricingParenClose: {
    fontSize: 8,
    marginLeft: 2,
  },
  pricingNote: {
    fontSize: 7.5,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 3,
    marginBottom: 3,
  },

  // Acceptance
  doubleLine: {
    borderTopWidth: 1.5,
    borderTopColor: '#000000',
    marginTop: 6,
    marginBottom: 4,
  },
  acceptanceText: {
    fontSize: 8,
    lineHeight: 1.4,
    marginBottom: 6,
  },
  sigRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 2,
  },
  sigBlock: {
    flex: 1,
    paddingRight: 8,
  },
  sigBlockRight: {
    flex: 1.4,
  },
  sigLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  sigLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  sigPrefix: {
    fontSize: 8,
    marginRight: 4,
    paddingBottom: 2,
  },
  sigInput: {
    flex: 1,
    backgroundColor: '#FFF9E6',
    borderBottomWidth: 0.75,
    borderBottomColor: '#000000',
    minHeight: 18,
    fontSize: 8,
    color: '#000080',
    paddingLeft: 3,
  },
  sigDateBox: {
    width: 80,
    backgroundColor: '#FFF9E6',
    borderBottomWidth: 0.75,
    borderBottomColor: '#000000',
    minHeight: 18,
    marginLeft: 6,
    fontSize: 8,
    color: '#000080',
    paddingLeft: 3,
  },
  sigDateLabel: {
    fontSize: 6.5,
    textAlign: 'center',
    marginBottom: 1,
    color: '#444444',
  },
  sigImage: {
    height: 30,
    objectFit: 'contain',
  },

  // Rescind notice
  rescindText: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginTop: 6,
  },

  disclaimerText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },

  spacer: {
    height: 4,
  },
  thinDivider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#cccccc',
    marginBottom: 4,
    marginTop: 2,
  },
})

// ─── Sub-components ───────────────────────────────────────────────────────────

function YNBox({ value }: { value: boolean | undefined }) {
  return (
    <Text style={s.ynBox}>{value ? 'X' : ''}</Text>
  )
}

function SpecYNRow({
  label,
  checked,
}: {
  label: string
  checked?: boolean
}) {
  return (
    <View style={s.ynItem}>
      <YNBox value={checked} />
      <YNBox value={checked === false || (!checked && checked !== undefined) ? true : undefined} />
      <Text style={[s.ynLabel, { marginLeft: 2 }]}>{label}</Text>
    </View>
  )
}

// ─── Main Document ────────────────────────────────────────────────────────────

export function RoofingAgreement({ company, job, repSignature, customerSignature, signedDate }: AgreementProps) {
  const specs: EstimateSpecs = job.estimate_specs ?? {}
  // Total comes from *_cents when available, falls back to legacy float dollars.
  // Deposit is computed in cents so the 50/50 split sums exactly to the total.
  // `halfCents` returns only the FIRST half — we compute the SECOND half as
  // `totalCents - firstHalfCents` so the two rows sum exactly to the total.
  // Audit R2-#9: previously both rows rendered the same `deposit` variable,
  // so for odd-cent totals like $10,000.01 the PDF showed $5,000.01 twice,
  // summing to $10,000.02 (one cent over contract).
  const totalCents = readMoneyFromRow(
    (job as { total_amount_cents?: number | null }).total_amount_cents,
    job.total_amount
  )
  const firstHalfCents = halfCents(totalCents)
  const secondHalfCents = totalCents - firstHalfCents
  const total = centsToDollars(totalCents)
  const firstHalf = centsToDollars(firstHalfCents)
  const secondHalf = centsToDollars(secondHalfCents)
  const companyName = company.name || 'ROOFING CO'

  // Parse company address into lines
  const addressLines = (company.address ?? '').split('\n').filter(Boolean)
  // Handle single-line address like "16721 Letteau Ave., Delhi, CA 95315  Tel 209.668.6222  Fax: 209.250.1918"
  // Try to split on commas or use as-is
  const addrLine1 = addressLines[0] ?? ''
  const addrLine2 = addressLines[1] ?? ''
  const addrLine3 = addressLines[2] ?? ''

  const notes = job.notes ?? ''
  const noteLines = notes.split('\n')
  const noteLine1 = noteLines[0] ?? ''
  const noteLine2 = noteLines[1] ?? ''
  const noteLine3 = noteLines[2] ?? ''

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ── HEADER ── */}
        <View style={s.headerRow}>
          <View style={s.companyNameBlock}>
            <Text style={s.companyName}>{companyName.toUpperCase()}</Text>
            <Text style={s.companySubtitle}>RESIDENTIAL &amp; COMMERCIAL</Text>
          </View>
          <View style={s.companyAddressBlock}>
            {addrLine1 ? <Text style={s.companyAddressLine}>{addrLine1}</Text> : null}
            {addrLine2 ? <Text style={s.companyAddressLine}>{addrLine2}</Text> : null}
            {addrLine3 ? <Text style={s.companyAddressLine}>{addrLine3}</Text> : null}
            {company.phone ? <Text style={s.companyAddressLine}>{company.phone}</Text> : null}
            {company.license_number ? (
              <Text style={[s.companyAddressLine, { fontFamily: 'Helvetica-Bold' }]}>
                Contractors Lic.# {company.license_number}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── TITLE ── */}
        <View style={s.titleRow}>
          <Text style={s.titleText}>ROOFING AGREEMENT</Text>
        </View>

        {/* ── CLIENT & JOB INFO BOX ── */}
        <View style={s.infoBox}>
          {/* Row 1: Name / Job Location */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Name</Text>
            <Text style={s.infoInput}>{job.customer_name ?? ''}</Text>
            <Text style={s.infoLabelRight}>Job Location</Text>
            <Text style={s.infoInputRight}>{job.address ?? ''}</Text>
          </View>
          {/* Row 2: Street / City */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Street</Text>
            <Text style={s.infoInput}>{job.address ?? ''}</Text>
            <Text style={s.infoLabelRight}>City</Text>
            <Text style={s.infoInputRight}>{job.city ?? ''}</Text>
          </View>
          {/* Row 3: City / State/Zip */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>City</Text>
            <Text style={s.infoInput}>{job.city ?? ''}</Text>
            <Text style={s.infoLabelRight}>State / Zip</Text>
            <Text style={s.infoInputRight}>{[job.state, job.zip].filter(Boolean).join('  ')}</Text>
          </View>
          {/* Row 4: Email / Approx Start Date */}
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Email</Text>
            <Text style={s.infoInput}>{job.email ?? ''}</Text>
            <Text style={s.infoLabelRight}>Approx. Start Date</Text>
            <Text style={s.infoInputRight}>{job.scheduled_date ?? ''}</Text>
          </View>
          {/* Row 5: Number / Approx Completion Date */}
          <View style={s.infoRowLast}>
            <Text style={s.infoLabel}>Number</Text>
            <Text style={s.infoInput}>{job.phone ?? ''}</Text>
            <Text style={s.infoLabelRight}>Approx. Completion Date</Text>
            <Text style={s.infoInputRight}>{job.completed_date ?? ''}</Text>
          </View>
        </View>

        <View style={s.spacer} />

        {/* ── SECTION 1 ── */}
        <Text style={s.bodyText}>It is mutually agreed as follows:</Text>
        <Text style={s.bodyText}>
          1. Construction - {companyName} will furnish the necessary labor, materials and equipment to perform in a workmanship like manner the work as detailed under the following specifications.
        </Text>

        {/* ── SECTION 2 ── */}
        <View style={s.specsRow}>
          <Text style={[s.sectionHeader, { flex: 1 }]}>2. Specifications -</Text>
          <Text style={[s.sectionHeader, { flex: 1, paddingLeft: 4 }]}>Specifications -</Text>
        </View>

        {/* Two-column specs layout */}
        <View style={{ flexDirection: 'row' }}>
          {/* LEFT COLUMN */}
          <View style={s.specsLeft}>

            {/* Roof with (material) */}
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={[s.specLabel, { width: 42 }]}>Roof with</Text>
              <Text style={s.specInputBox}>{job.material ?? ''}</Text>
            </View>

            {/* Color */}
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={[s.specLabel, { width: 42 }]}>Color</Text>
              <Text style={s.specInputBox}>{job.material_color ?? ''}</Text>
            </View>

            {/* Standard inclusions */}
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={s.specLabel}>Furnish &amp; install all required jacks, flashings and/or valleys</Text>
            </View>
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={s.specLabel}>Seal and paint all jacks, flashings and/or valleys</Text>
            </View>
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={s.specLabel}>Includes clean-up of roof and surrounding grounds</Text>
            </View>

            {/* Manufacturer warranty */}
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={[s.specLabel, { width: 38 }]}>Includes</Text>
              <Text style={[s.specInputBox, { width: 28, flex: 0 }]}>{job.warranty_manufacturer_years ?? ''}</Text>
              <Text style={s.specUnit}>yr mfr warranty NON-PRORATED</Text>
            </View>

            {/* Workmanship warranty */}
            <View style={s.specItem}>
              <Text style={s.specBullet}>•</Text>
              <Text style={[s.specLabel, { width: 38 }]}>Includes</Text>
              <Text style={[s.specInputBox, { width: 28, flex: 0 }]}>{job.warranty_workmanship_years ?? ''}</Text>
              <Text style={s.specUnit}>yr workmanship warranty</Text>
            </View>

            {/* Yes/No headers for left column */}
            <View style={s.ynHeader}>
              <Text style={s.ynHeaderLabel}>Yes</Text>
              <Text style={s.ynHeaderLabel}>No</Text>
            </View>

            {/* Felt */}
            <View style={s.ynItem}>
              <YNBox value={!!job.felt_type} />
              <YNBox value={!job.felt_type} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Furnish &amp; install felt: {job.felt_type ?? 'Synthetic  30lb.  Ice/water'}
              </Text>
            </View>

            {/* Fascia */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.fascia_replacement} />
              <YNBox value={!specs.fascia_replacement} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Removal &amp; replacement of {specs.fascia_lineal_ft ?? '___'} lineal ft of {specs.fascia_dimensions ?? '___ x ___'} fascia
              </Text>
            </View>

            {/* T&G/Shiplap */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.tg_shiplap} />
              <YNBox value={!specs.tg_shiplap} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Removal &amp; replacement of T&amp;G/shiplap
              </Text>
            </View>

          </View>

          {/* RIGHT COLUMN */}
          <View style={s.specsRight}>

            {/* Yes/No headers for right column */}
            <View style={s.ynHeader}>
              <Text style={s.ynHeaderLabel}>Yes</Text>
              <Text style={s.ynHeaderLabel}>No</Text>
            </View>

            {/* Tear off */}
            <View style={s.ynItem}>
              <YNBox value={job.layers != null && job.layers > 0} />
              <YNBox value={!(job.layers != null && job.layers > 0)} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Tear off {job.layers ?? '___'} layer(s) of existing roofing
              </Text>
            </View>

            {/* Sheeting */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.sheeting} />
              <YNBox value={!specs.sheeting} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Furnish &amp; Install {specs.sheeting_type ?? '___'} sheeting
              </Text>
            </View>

            {/* Metal nosing */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.metal_nosing} />
              <YNBox value={!specs.metal_nosing} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Furnish &amp; install metal nosing - Color {specs.nosing_color ?? '___'}
              </Text>
            </View>

            {/* Ridge caps */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.ridge_caps} />
              <YNBox value={!specs.ridge_caps} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Furnish &amp; install dimensional ridge-caps
              </Text>
            </View>

            {/* Ridge vent / O'Hagen vents */}
            <View style={s.ynItem}>
              <YNBox value={!!(specs.ridge_vent_ft || specs.ohagen_vents)} />
              <YNBox value={!(specs.ridge_vent_ft || specs.ohagen_vents)} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Furnish {specs.ridge_vent_ft ?? '___'} ft. Ridge Vent (or) {specs.ohagen_vents ?? '___'} O&apos;hagen vents
              </Text>
            </View>

            {/* Antenna */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.antenna_removal} />
              <YNBox value={!specs.antenna_removal} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>Remove &amp; reinstall existing antenna(s)</Text>
            </View>

            {/* Solar */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.solar_removal} />
              <YNBox value={!specs.solar_removal} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>Remove &amp; reinstall existing solar panels</Text>
            </View>

            {/* Flat section */}
            <View style={s.ynItem}>
              <YNBox value={!!(specs.flat_section_sq && specs.flat_section_sq > 0)} />
              <YNBox value={!(specs.flat_section_sq && specs.flat_section_sq > 0)} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Re-roofing of {specs.flat_section_sq ?? '___'} sq. flat section(s)
              </Text>
            </View>

            {/* Other structures */}
            <View style={s.ynItem}>
              <YNBox value={!!specs.other_structures} />
              <YNBox value={!specs.other_structures} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Re-roofing of other structures: {specs.other_structures ?? '___'}
              </Text>
            </View>

            {/* Gutters */}
            <View style={s.ynItem}>
              <YNBox value={!!(job.gutters_length && job.gutters_length > 0)} />
              <YNBox value={!(job.gutters_length && job.gutters_length > 0)} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Furnish &amp; Install {job.gutters_length ?? '___'} ft. {job.gutter_size ?? '5" or 7"'} Seamless Rain Gutter
              </Text>
            </View>

            {/* Down spouts */}
            <View style={s.ynItem}>
              <YNBox value={!!(job.downspout_color)} />
              <YNBox value={!job.downspout_color} />
              <Text style={[s.ynLabel, { marginLeft: 2 }]}>
                Down Spouts - Color: {job.downspout_color ?? '___'}  Gutter Color: {job.gutter_color ?? '___'}
              </Text>
            </View>

          </View>
        </View>

        <View style={s.thinDivider} />

        {/* ── SPECIAL REMARKS ── */}
        <Text style={s.bodyBold}>Special Remarks:</Text>
        <Text style={s.remarkInput}>{noteLine1}</Text>
        <Text style={s.remarkInput}>{noteLine2}</Text>
        <Text style={s.remarkInput}>{noteLine3}</Text>

        {/* ── DISCLAIMERS ── */}
        <Text style={s.disclaimerText}>
          • {companyName} will not re-align Satellite Dish.
        </Text>
        <Text style={s.disclaimerText}>
          • {companyName} is not responsible for cracked driveways.
        </Text>
        <Text style={s.disclaimerText}>
          • {companyName} is not responsible for dry rot or termite damage in the existing roof structure unless otherwise noted above. Dry rot found will be replaced with an additional charge.
        </Text>

        <View style={s.spacer} />

        {/* ── SECTION 3: PRICING ── */}
        <Text style={s.bodyText}>
          3. Owner promises to pay or cause to be paid to {companyName} in consideration therefore, the sum of:
        </Text>

        {/* Total amount: words + dollars */}
        <View style={s.pricingRow}>
          <Text style={s.pricingAmountWord}>{numberToWords(total)}</Text>
          <Text style={s.pricingDollarLabel}>Dollars ($</Text>
          <Text style={s.pricingAmountBox}>{formatMoneyPdf(total)}</Text>
          <Text style={s.pricingParenClose}>)</Text>
        </View>

        {/* First half — due on material delivery */}
        <View style={s.pricingRow}>
          <Text style={s.pricingLabel}>50% Due upon delivery of materials:</Text>
          <Text style={s.pricingDollarLabel}>$</Text>
          <Text style={s.pricingAmountBox}>{formatMoneyPdf(firstHalf)}</Text>
        </View>

        {/* Second half — due on completion. For odd-cent totals the two
            halves differ by 1¢ so they sum exactly to `total`. */}
        <View style={s.pricingRow}>
          <Text style={s.pricingLabel}>50% Due upon completion:</Text>
          <Text style={s.pricingDollarLabel}>$</Text>
          <Text style={s.pricingAmountBox}>{formatMoneyPdf(secondHalf)}</Text>
        </View>

        <Text style={s.pricingNote}>
          ( This estimate is for a cash/check discount price )  Estimate is good for 15 days and subject to Lumber &amp; Material increases
        </Text>

        {/* ── ACCEPTANCE ── */}
        <View style={s.doubleLine} />

        <Text style={s.acceptanceText}>
          ACCEPTANCE - The above prices, specifications and conditions are satisfactory and are hereby accepted. You are authorized to do the work as specified. Payment will also be outlined above. Buyer has the right to rescind this agreement within three days of acceptance.
        </Text>

        {/* Signature rows */}
        <View style={s.sigRow}>
          <View style={s.sigBlock}>
            <Text style={s.sigLabel}>{companyName.toUpperCase()}</Text>
            {/* By line */}
            <View style={s.sigLine}>
              <Text style={s.sigPrefix}>By</Text>
              <View style={s.sigInput}>
                {repSignature ? (
                  <Image src={repSignature} style={s.sigImage} />
                ) : null}
              </View>
              <View style={{ marginLeft: 6 }}>
                <Text style={s.sigDateLabel}>Date</Text>
                <View style={s.sigDateBox}>
                  {signedDate ? <Text style={{ fontSize: 8, color: '#000080', paddingLeft: 3, paddingTop: 2 }}>{signedDate}</Text> : null}
                </View>
              </View>
            </View>
          </View>

          <View style={s.sigBlockRight}>
            <Text style={s.sigLabel}>HOMEOWNER</Text>
            {/* Buyer 1 */}
            <View style={s.sigLine}>
              <View style={{ flex: 1 }}>
                <Text style={s.sigDateLabel}>Buyer&apos;s Signature</Text>
                <View style={s.sigInput}>
                  {customerSignature ? (
                    <Image src={customerSignature} style={s.sigImage} />
                  ) : null}
                </View>
              </View>
              <View style={{ marginLeft: 6 }}>
                <Text style={s.sigDateLabel}>Acceptance Date</Text>
                <View style={s.sigDateBox}>
                  {signedDate ? <Text style={{ fontSize: 8, color: '#000080', paddingLeft: 3, paddingTop: 2 }}>{signedDate}</Text> : null}
                </View>
              </View>
            </View>
            {/* Buyer 2 */}
            <View style={s.sigLine}>
              <View style={{ flex: 1 }}>
                <Text style={s.sigDateLabel}>Buyer&apos;s Signature</Text>
                <View style={s.sigInput} />
              </View>
              <View style={{ marginLeft: 6 }}>
                <Text style={s.sigDateLabel}>Acceptance Date</Text>
                <View style={s.sigDateBox} />
              </View>
            </View>
          </View>
        </View>

        {/* ── RESCIND NOTICE ── */}
        <Text style={s.rescindText}>
          {companyName.toUpperCase()} HAS THE RIGHT TO RESCIND THIS CONTRACT WITHIN FIFTEEN WORKING DAYS OF ACCEPTANCE
        </Text>

      </Page>

      {/* Page 2: Notice of Cancellation (CA Civil Code 1689.7) */}
      <Page size="LETTER" style={s.page}>
        <View style={{ textAlign: 'center', marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>NOTICE OF CANCELLATION</Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10 }}>Date of Transaction: {signedDate ?? '_______________'}</Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10 }}>
            You may cancel this transaction, without any penalty or obligation, within three business days from the above date.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10 }}>
            If you cancel, any property traded in, any payments made by you under the contract or sale, and any negotiable instrument executed by you will be returned within 10 business days following receipt by the seller of your cancellation notice, and any security interest arising out of the transaction will be cancelled.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10 }}>
            If you cancel, you must make available to the seller at your residence, in substantially as good condition as when received, any goods delivered to you under this contract or sale, or you may, if you wish, comply with the instructions of the seller regarding the return shipment of the goods at the seller&apos;s expense and risk.
          </Text>
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 10 }}>
            If you do make the goods available to the seller and the seller does not pick them up within 20 days of the date of your notice of cancellation, you may retain or dispose of the goods without any further obligation.
          </Text>
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 10 }}>
            To cancel this transaction, mail or deliver a signed and dated copy of this cancellation notice, or any other written notice, to:
          </Text>
        </View>

        <View style={{ marginBottom: 20, paddingLeft: 40 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>{company.name}</Text>
          <Text style={{ fontSize: 10 }}>{company.address}</Text>
          {company.license_number ? (
            <Text style={{ fontSize: 10 }}>Contractor License #{company.license_number}</Text>
          ) : null}
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 10 }}>NOT LATER THAN MIDNIGHT OF THE THIRD BUSINESS DAY AFTER THE DATE OF THIS TRANSACTION.</Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 10 }}>I HEREBY CANCEL THIS TRANSACTION.</Text>
        </View>

        <View style={{ marginTop: 30 }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: '#000000', width: 300, marginBottom: 4 }} />
          <Text style={{ fontSize: 9 }}>Buyer&apos;s Signature</Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: '#000000', width: 200, marginBottom: 4 }} />
          <Text style={{ fontSize: 9 }}>Date</Text>
        </View>
      </Page>

    </Document>
  )
}
