'use client'

import { useState } from 'react'
import { exportPayrollCSV } from '@/lib/actions/export'

interface PayrollExportProps {
  companies?: { id: string; name: string }[]
}

export function PayrollExport({ companies = [] }: PayrollExportProps) {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0]

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(today)
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleExport = async () => {
    if (!startDate || !endDate) {
      setError('Start and end dates are required')
      return
    }
    if (startDate > endDate) {
      setError('Start date must be before end date')
      return
    }
    setError('')
    setLoading(true)
    try {
      const csv = await exportPayrollCSV({
        startDate: `${startDate}T00:00:00.000Z`,
        endDate: `${endDate}T23:59:59.999Z`,
        companyId: companyId || undefined,
      })

      if (!csv) {
        setError('No time entries found for this period')
        return
      }

      // Trigger download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `payroll_${startDate}_to_${endDate}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '1.5px',
    marginBottom: '6px',
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        padding: '24px',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '16px',
          fontWeight: 800,
          color: 'var(--text-primary)',
          margin: '0 0 16px',
        }}
      >
        Payroll Export
      </h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
        <div style={{ flex: '1', minWidth: '140px' }}>
          <label style={labelStyle}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ flex: '1', minWidth: '140px' }}>
          <label style={labelStyle}>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            style={inputStyle}
          />
        </div>

        {companies.length > 0 && (
          <div style={{ flex: '1', minWidth: '160px' }}>
            <label style={labelStyle}>Company (optional)</label>
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              style={inputStyle}
            >
              <option value="">All Companies</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? 'var(--bg-elevated)' : 'var(--accent)',
              border: 'none',
              borderRadius: '8px',
              color: loading ? 'var(--text-muted)' : '#000',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Exporting...' : 'Export Payroll CSV'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: '12px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--accent-red)',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
