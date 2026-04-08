import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Company } from '@/lib/types/database'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface InvoiceProps {
  company: Company
  invoice: {
    invoice_number: string
    type: string
    amount: number
    total_amount: number
    status: string
    due_date: string | null
    notes: string | null
    payment_link: string | null
    created_at: string
  }
  job: {
    job_number: string
    customer_name: string
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    phone: string | null
    email: string | null
  }
  lineItems?: LineItem[]
  taxRate?: number // e.g. 0.0875 for 8.75%
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' }
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111111',
    paddingTop: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
    backgroundColor: '#FFFFFF',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  companyBlock: {
    flex: 1,
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  companyDetail: {
    fontSize: 8,
    color: '#444444',
    marginBottom: 1,
  },
  invoiceTitleBlock: {
    alignItems: 'flex-end',
  },
  invoiceTitle: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    color: '#111111',
    letterSpacing: 3,
  },
  invoiceNumber: {
    fontSize: 10,
    color: '#555555',
    marginTop: 4,
  },
  invoiceDate: {
    fontSize: 8,
    color: '#777777',
    marginTop: 2,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#CCCCCC',
    marginVertical: 12,
  },
  accentDivider: {
    height: 2,
    backgroundColor: '#1a1a1a',
    marginVertical: 12,
  },

  // Bill To
  billRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  billBlock: {
    flex: 1,
  },
  billLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#888888',
    letterSpacing: 1,
    marginBottom: 4,
  },
  billName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  billDetail: {
    fontSize: 8.5,
    color: '#333333',
    marginBottom: 1,
  },
  dueDateBlock: {
    alignItems: 'flex-end',
  },
  dueDateLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#888888',
    letterSpacing: 1,
    marginBottom: 4,
  },
  dueDateValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  jobRefValue: {
    fontSize: 8.5,
    color: '#555555',
    marginTop: 4,
  },

  // Line items table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    padding: 6,
    marginBottom: 0,
  },
  tableHeaderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#F8F8F8',
  },
  colDesc: { flex: 1 },
  colQty: { width: 50, textAlign: 'right' },
  colUnit: { width: 70, textAlign: 'right' },
  colTotal: { width: 70, textAlign: 'right' },
  cellText: { fontSize: 8.5, color: '#333333' },
  cellTextRight: { fontSize: 8.5, color: '#333333', textAlign: 'right' },

  // Totals
  totalsBlock: {
    alignSelf: 'flex-end',
    width: 200,
    marginTop: 12,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  totalsLabel: {
    fontSize: 8.5,
    color: '#555555',
  },
  totalsValue: {
    fontSize: 8.5,
    color: '#111111',
  },
  totalsDivider: {
    height: 0.5,
    backgroundColor: '#CCCCCC',
    marginVertical: 4,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: '#1a1a1a',
    marginTop: 2,
  },
  grandTotalLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  grandTotalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },

  // Notes
  notesSection: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderLeftWidth: 2,
    borderLeftColor: '#CCCCCC',
  },
  notesLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#888888',
    letterSpacing: 1,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 8.5,
    color: '#444444',
    lineHeight: 1.4,
  },

  // Payment link
  paySection: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#F0F7FF',
    borderWidth: 0.5,
    borderColor: '#AACCFF',
    borderRadius: 3,
  },
  payLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#1a5296',
    marginBottom: 3,
  },
  payLink: {
    fontSize: 8.5,
    color: '#0066CC',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#CCCCCC',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#999999',
  },
})

// ─── Component ──────────────────────────────────────────────────────────────

export function InvoicePDF({ company, invoice, job, lineItems = [], taxRate }: InvoiceProps) {
  const subtotal = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + item.total, 0)
    : invoice.amount

  const taxAmount = taxRate ? subtotal * taxRate : 0
  const totalDue = lineItems.length > 0 ? subtotal + taxAmount : invoice.total_amount

  const customerAddress = [job.address, job.city, job.state, job.zip]
    .filter(Boolean)
    .join(', ')

  const invoiceType = invoice.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.companyBlock}>
            <Text style={s.companyName}>{company.name}</Text>
            {company.address && (
              <Text style={s.companyDetail}>{company.address}</Text>
            )}
            {company.phone && (
              <Text style={s.companyDetail}>Tel: {company.phone}</Text>
            )}
            {company.license_number && (
              <Text style={s.companyDetail}>License: {company.license_number}</Text>
            )}
          </View>
          <View style={s.invoiceTitleBlock}>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceNumber}>{invoice.invoice_number}</Text>
            <Text style={s.invoiceDate}>
              {invoiceType} | Issued {formatDate(invoice.created_at)}
            </Text>
          </View>
        </View>

        <View style={s.accentDivider} />

        {/* Bill To + Due Date */}
        <View style={s.billRow}>
          <View style={s.billBlock}>
            <Text style={s.billLabel}>BILL TO</Text>
            <Text style={s.billName}>{job.customer_name}</Text>
            {customerAddress ? (
              <Text style={s.billDetail}>{customerAddress}</Text>
            ) : null}
            {job.phone ? (
              <Text style={s.billDetail}>{job.phone}</Text>
            ) : null}
            {job.email ? (
              <Text style={s.billDetail}>{job.email}</Text>
            ) : null}
          </View>
          <View style={s.dueDateBlock}>
            <Text style={s.dueDateLabel}>DUE DATE</Text>
            <Text style={s.dueDateValue}>
              {invoice.due_date ? formatDate(invoice.due_date) : 'Upon Receipt'}
            </Text>
            <Text style={s.jobRefValue}>Job #{job.job_number}</Text>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colDesc]}>DESCRIPTION</Text>
          <Text style={[s.tableHeaderText, s.colQty, { textAlign: 'right' }]}>QTY</Text>
          <Text style={[s.tableHeaderText, s.colUnit, { textAlign: 'right' }]}>UNIT PRICE</Text>
          <Text style={[s.tableHeaderText, s.colTotal, { textAlign: 'right' }]}>TOTAL</Text>
        </View>

        {lineItems.length > 0 ? (
          lineItems.map((item, idx) => (
            <View key={item.id} style={idx % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={[s.cellText, s.colDesc]}>{item.description}</Text>
              <Text style={[s.cellTextRight, s.colQty]}>{item.quantity}</Text>
              <Text style={[s.cellTextRight, s.colUnit]}>{formatMoney(item.unit_price)}</Text>
              <Text style={[s.cellTextRight, s.colTotal]}>{formatMoney(item.total)}</Text>
            </View>
          ))
        ) : (
          <View style={s.tableRow}>
            <Text style={[s.cellText, s.colDesc]}>
              {invoiceType} — {job.customer_name} ({job.job_number})
            </Text>
            <Text style={[s.cellTextRight, s.colQty]}>1</Text>
            <Text style={[s.cellTextRight, s.colUnit]}>{formatMoney(invoice.amount)}</Text>
            <Text style={[s.cellTextRight, s.colTotal]}>{formatMoney(invoice.amount)}</Text>
          </View>
        )}

        {/* Totals */}
        <View style={s.totalsBlock}>
          {lineItems.length > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsValue}>{formatMoney(subtotal)}</Text>
            </View>
          )}
          {taxRate && taxRate > 0 ? (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Tax ({(taxRate * 100).toFixed(2)}%)</Text>
              <Text style={s.totalsValue}>{formatMoney(taxAmount)}</Text>
            </View>
          ) : null}
          <View style={s.totalsDivider} />
          <View style={s.grandTotalRow}>
            <Text style={s.grandTotalLabel}>TOTAL DUE</Text>
            <Text style={s.grandTotalValue}>{formatMoney(totalDue)}</Text>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes ? (
          <View style={s.notesSection}>
            <Text style={s.notesLabel}>NOTES</Text>
            <Text style={s.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Payment Link */}
        {invoice.payment_link ? (
          <View style={s.paySection}>
            <Text style={s.payLabel}>PAY ONLINE</Text>
            <Text style={s.payLink}>{invoice.payment_link}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{company.name} — {invoice.invoice_number}</Text>
          <Text style={s.footerText}>
            {invoice.due_date ? `Due: ${formatDate(invoice.due_date)}` : 'Payment due upon receipt'}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
