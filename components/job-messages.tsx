'use client'

import { useEffect, useRef, useState } from 'react'
import { getJobMessages, sendCustomMessage, type Message } from '@/lib/actions/messages'
import { formatTime, formatDate } from '@/lib/utils'

interface JobMessagesProps {
  jobId: string
  customerPhone: string | null
  initialMessages?: Message[]
  /**
   * Audit R3-#6: was previously computed inside this client component via
   * `process.env.TWILIO_ACCOUNT_SID`, which is `undefined` in the browser
   * bundle (server-only env vars are not inlined). The SMS UI was therefore
   * always hidden unless someone separately set `NEXT_PUBLIC_TWILIO_CONFIGURED`.
   * Now passed in from the server parent at `components/job-detail.tsx`.
   */
  twilioConfigured: boolean
}

export function JobMessages({ jobId, customerPhone, initialMessages, twilioConfigured }: JobMessagesProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [loading, setLoading] = useState(!initialMessages)
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Only fetch if no initial messages were provided server-side
    if (initialMessages) return
    getJobMessages(jobId).then((msgs) => {
      setMessages(msgs)
      setLoading(false)
    })
  }, [jobId, initialMessages])

  async function handleSend() {
    const body = inputValue.trim()
    if (!body || !customerPhone) return

    setSending(true)
    setInputValue('')

    // Optimistic: add immediately
    const optimistic: Message = {
      id: `optimistic-${Date.now()}`,
      job_id: jobId,
      direction: 'outbound',
      channel: 'sms',
      from_number: null,
      to_number: customerPhone,
      body,
      status: 'sending',
      auto_generated: false,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [optimistic, ...prev])

    try {
      const success = await sendCustomMessage(jobId, body)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimistic.id ? { ...m, status: success ? 'sent' : 'failed' } : m
        )
      )
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, status: 'failed' } : m))
      )
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '20px',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '12px',
          fontWeight: '700',
          color: 'var(--text-muted)',
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        Messages
      </h2>

      {/* Message list */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxHeight: '320px',
          overflowY: 'auto',
        }}
      >
        {loading && (
          <span
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            Loading...
          </span>
        )}

        {!loading && messages.length === 0 && (
          <span
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
              textAlign: 'center',
              padding: '16px 0',
            }}
          >
            No messages yet
          </span>
        )}

        {messages.map((msg) => {
          const isOutbound = msg.direction === 'outbound'
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isOutbound ? 'flex-end' : 'flex-start',
                gap: '4px',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: isOutbound ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  backgroundColor: isOutbound ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${isOutbound ? 'rgba(0,230,118,0.15)' : 'var(--border-subtle)'}`,
                  position: 'relative',
                }}
              >
                {msg.auto_generated && (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: '9px',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--accent)',
                      backgroundColor: 'rgba(0,230,118,0.1)',
                      border: '1px solid rgba(0,230,118,0.2)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      marginBottom: '6px',
                    }}
                  >
                    Auto
                  </span>
                )}
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                    margin: 0,
                    lineHeight: '1.5',
                    fontWeight: '400',
                  }}
                >
                  {msg.body}
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexDirection: isOutbound ? 'row-reverse' : 'row',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                  }}
                >
                  {`${formatDate(msg.created_at)}, ${formatTime(msg.created_at)}`}
                </span>
                {msg.status === 'failed' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--accent-red)',
                      fontWeight: '600',
                    }}
                  >
                    Failed
                  </span>
                )}
                {msg.status === 'sending' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-sans)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Sending...
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Send area */}
      {!customerPhone ? (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          No phone number — add one to send texts
        </p>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '16px',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a message..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            style={{
              flex: 1,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !inputValue.trim()}
            title={!twilioConfigured ? 'SMS not configured' : undefined}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              backgroundColor:
                sending || !inputValue.trim() ? 'var(--bg-elevated)' : 'var(--accent-dim)',
              border: `1px solid ${sending || !inputValue.trim() ? 'var(--border-subtle)' : 'rgba(0,230,118,0.25)'}`,
              color: sending || !inputValue.trim() ? 'var(--text-muted)' : 'var(--accent)',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              fontWeight: '700',
              cursor: sending || !inputValue.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {!twilioConfigured ? 'SMS not configured' : sending ? 'Sending...' : 'Send Text'}
          </button>
        </div>
      )}
    </div>
  )
}
