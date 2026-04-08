'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createJob } from '@/lib/actions/jobs'

interface Company {
  id: string
  name: string
  color: string
}

interface QuickAddFabProps {
  companies: Company[]
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function QuickAddFab({ companies }: QuickAddFabProps) {
  const [open, setOpen] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companies[0]?.id ?? '')
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus name field when form opens
  useEffect(() => {
    if (open && nameRef.current) {
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [open])

  // Reset form on close
  function handleClose() {
    setOpen(false)
    setCustomerName('')
    setPhone('')
    setError(null)
  }

  function handleSubmit() {
    if (!customerName.trim()) {
      setError('Customer name is required')
      return
    }
    if (!selectedCompanyId) {
      setError('Select a company')
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const job = await createJob({
          company_id: selectedCompanyId,
          customer_name: customerName.trim(),
          address: 'TBD',
          city: 'Fresno',
          phone: phone.trim() || null,
          job_type: 'reroof',
        })
        handleClose()
        router.push(`/jobs/${job.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create lead')
      }
    })
  }

  return (
    <>
      {/* Slide-up form overlay */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              zIndex: 998,
            }}
          />

          {/* Form panel */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 999,
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '20px 20px 0 0',
              padding: '24px 20px 40px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxWidth: '480px',
              margin: '0 auto',
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: '36px',
                height: '4px',
                borderRadius: '2px',
                backgroundColor: 'var(--border-subtle)',
                margin: '-12px auto 0',
              }}
            />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '18px',
                  fontWeight: 900,
                  color: 'var(--text-primary)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                New Lead
              </h2>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Company selector — big tap targets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Company
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {companies.map((company) => {
                  const isSelected = selectedCompanyId === company.id
                  return (
                    <button
                      key={company.id}
                      type="button"
                      onClick={() => setSelectedCompanyId(company.id)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: `2px solid ${isSelected ? company.color : 'var(--border-subtle)'}`,
                        backgroundColor: isSelected ? company.color + '22' : 'var(--bg-elevated)',
                        color: isSelected ? company.color : 'var(--text-secondary)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, color 0.15s, background-color 0.15s',
                      }}
                    >
                      {company.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Customer name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                htmlFor="fab-name"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Customer Name
              </label>
              <input
                ref={nameRef}
                id="fab-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="John Smith"
                autoComplete="off"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Phone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                htmlFor="fab-phone"
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Phone
              </label>
              <input
                id="fab-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="(559) 555-0100"
                autoComplete="tel"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '16px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  color: 'var(--accent-red)',
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !customerName.trim()}
              style={{
                width: '100%',
                padding: '16px',
                borderRadius: '12px',
                background: isPending || !customerName.trim()
                  ? 'var(--bg-elevated)'
                  : 'linear-gradient(135deg, var(--accent), #00c46a)',
                border: 'none',
                color: isPending || !customerName.trim() ? 'var(--text-muted)' : '#000',
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                fontWeight: 900,
                cursor: isPending || !customerName.trim() ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.01em',
                transition: 'opacity 0.15s',
              }}
            >
              {isPending ? 'Creating...' : 'Add Lead'}
            </button>
          </div>
        </>
      )}

      {/* FAB button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add new lead"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), #00c46a)',
          border: 'none',
          color: '#000',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,230,118,0.4)',
          zIndex: 900,
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
      >
        <PlusIcon />
      </button>
    </>
  )
}
