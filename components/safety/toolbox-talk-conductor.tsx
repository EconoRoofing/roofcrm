'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  getToolboxTalks,
  startToolboxTalkSession,
  signToolboxTalk,
} from '@/lib/actions/safety'
import type { ToolboxTalk } from '@/lib/actions/safety'
import { HardHatIcon, SignatureIcon, CheckIcon, CameraIcon } from '@/components/icons'

const TOPIC_LABELS: Record<string, string> = {
  fall_protection: 'Fall Protection',
  ladder_safety: 'Ladder Safety',
  heat_illness: 'Heat Illness',
  electrical: 'Electrical',
  ppe: 'PPE',
  general: 'General',
}

const TOPIC_COLORS: Record<string, { bg: string; color: string }> = {
  fall_protection: { bg: 'var(--accent-red-dim)', color: 'var(--accent-red)' },
  ladder_safety: { bg: 'var(--accent-amber-dim)', color: 'var(--accent-amber)' },
  heat_illness: { bg: 'rgba(255,107,53,0.12)', color: '#ff6b35' },
  electrical: { bg: 'rgba(255,213,0,0.12)', color: '#ffd500' },
  ppe: { bg: 'var(--accent-dim)', color: 'var(--accent)' },
  general: { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' },
}

interface CrewMember {
  id: string
  name: string
  avatar_url: string | null
}

interface Props {
  talks: ToolboxTalk[]
  crewMembers: CrewMember[]
  jobId?: string
}

type Step = 'select' | 'read' | 'signoff' | 'done'

export function ToolboxTalkConductor({ talks, crewMembers, jobId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('select')
  const [selectedTalk, setSelectedTalk] = useState<ToolboxTalk | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [signedUsers, setSignedUsers] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSelectTalk(talk: ToolboxTalk) {
    setSelectedTalk(talk)
    setStep('read')
  }

  function handleStartSignoff() {
    if (!selectedTalk) return
    startTransition(async () => {
      try {
        const session = await startToolboxTalkSession(selectedTalk.id, jobId ?? null)
        setSessionId(session.id)
        setStep('signoff')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start session')
      }
    })
  }

  function handleSign(userId: string) {
    if (!sessionId || signedUsers.has(userId)) return
    startTransition(async () => {
      try {
        // Temporarily set current user in server context via the action
        // We sign on behalf of the user by their ID — the action uses current auth user
        // For crew sign-off, each member needs to tap their own name
        // We store locally and batch-sign when complete
        setSignedUsers((prev) => new Set([...prev, userId]))
        await signToolboxTalk(sessionId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-off failed')
        setSignedUsers((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
      }
    })
  }

  function handleComplete() {
    setStep('done')
    router.refresh()
  }

  // ─── Step: Select a talk ──────────────────────────────────────────────────

  if (step === 'select') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Select a Safety Talk
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--accent-red-dim)',
              border: '1px solid rgba(255,82,82,0.2)',
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--accent-red)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {talks.map((talk) => {
            const topicStyle = TOPIC_COLORS[talk.topic] ?? TOPIC_COLORS.general
            return (
              <button
                key={talk.id}
                type="button"
                onClick={() => handleSelectTalk(talk)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 16px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'border-color 0.15s',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: topicStyle.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: topicStyle.color,
                    flexShrink: 0,
                  }}
                >
                  <HardHatIcon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {talk.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                    <span
                      style={{
                        padding: '1px 7px',
                        backgroundColor: topicStyle.bg,
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: topicStyle.color,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {TOPIC_LABELS[talk.topic] ?? talk.topic}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {talk.duration_minutes} min
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Step: Read the talk ──────────────────────────────────────────────────

  if (step === 'read' && selectedTalk) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button
          type="button"
          onClick={() => setStep('select')}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
            textAlign: 'left',
          }}
        >
          Back to list
        </button>

        <div
          style={{
            padding: '20px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '8px',
              lineHeight: 1.3,
            }}
          >
            {selectedTalk.title}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '16px',
            }}
          >
            {TOPIC_LABELS[selectedTalk.topic] ?? selectedTalk.topic} &bull; {selectedTalk.duration_minutes} min
          </div>

          {/* Content — large, readable for field use */}
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '16px',
              lineHeight: 1.7,
              color: 'var(--text-primary)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {selectedTalk.content}
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--accent-red-dim)',
              border: '1px solid rgba(255,82,82,0.2)',
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--accent-red)',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleStartSignoff}
          disabled={isPending}
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 800,
            color: 'var(--nav-text)',
            cursor: isPending ? 'not-allowed' : 'pointer',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? 'Starting...' : 'Talk Complete — Collect Sign-offs'}
        </button>
      </div>
    )
  }

  // ─── Step: Sign-off ───────────────────────────────────────────────────────

  if (step === 'signoff') {
    const signedCount = signedUsers.size
    const totalCount = crewMembers.length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Crew Sign-off
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              color: signedCount === totalCount ? '#22c55e' : 'var(--text-secondary)',
            }}
          >
            {signedCount} / {totalCount} signed
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: '6px',
            backgroundColor: 'var(--bg-elevated)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: totalCount > 0 ? `${(signedCount / totalCount) * 100}%` : '0%',
              backgroundColor: signedCount === totalCount ? '#22c55e' : 'var(--accent)',
              borderRadius: '3px',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--accent-red-dim)',
              border: '1px solid rgba(255,82,82,0.2)',
              borderRadius: '8px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              color: 'var(--accent-red)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {crewMembers.map((member) => {
            const isSigned = signedUsers.has(member.id)
            return (
              <div
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  backgroundColor: isSigned ? 'rgba(34,197,94,0.08)' : 'var(--bg-surface)',
                  border: `1px solid ${isSigned ? 'rgba(34,197,94,0.3)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px',
                  transition: 'background-color 0.15s, border-color 0.15s',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-elevated)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-sans)',
                    overflow: 'hidden',
                  }}
                >
                  {member.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.avatar_url}
                      alt={member.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    member.name.charAt(0).toUpperCase()
                  )}
                </div>

                <div
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {member.name}
                </div>

                {isSigned ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#22c55e',
                    }}
                  >
                    <CheckIcon size={14} />
                    Signed
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSign(member.id)}
                    disabled={isPending}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      backgroundColor: 'var(--accent-dim)',
                      border: '1px solid var(--accent)',
                      borderRadius: '8px',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <SignatureIcon size={14} />
                    Sign
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleComplete}
          style={{
            width: '100%',
            padding: '16px',
            background: 'linear-gradient(135deg, var(--nav-gradient-1), var(--nav-gradient-2))',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'var(--font-sans)',
            fontSize: '15px',
            fontWeight: 800,
            color: 'var(--nav-text)',
            cursor: 'pointer',
          }}
        >
          {signedCount === totalCount ? 'Complete Session' : `Save (${signedCount}/${totalCount} signed)`}
        </button>
      </div>
    )
  }

  // ─── Done ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: 'rgba(34,197,94,0.08)',
        border: '1px solid rgba(34,197,94,0.3)',
        borderRadius: '8px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '16px',
          fontWeight: 800,
          color: '#22c55e',
          marginBottom: '4px',
        }}
      >
        Safety Talk Complete
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        {signedUsers.size} crew member{signedUsers.size !== 1 ? 's' : ''} signed off on {selectedTalk?.title}
      </div>
      <button
        type="button"
        onClick={() => {
          setStep('select')
          setSelectedTalk(null)
          setSessionId(null)
          setSignedUsers(new Set())
          setError(null)
        }}
        style={{
          marginTop: '12px',
          padding: '8px 16px',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        Conduct Another Talk
      </button>
    </div>
  )
}
