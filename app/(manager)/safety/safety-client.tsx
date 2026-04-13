'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getSafetyStats,
  getToolboxTalks,
  getRecentToolboxSessions,
  getIncidents,
  getAllCertificationsWithUsers,
  getCrewsMissingTalkToday,
} from '@/lib/actions/safety'
import type { Certification } from '@/lib/actions/safety'
import { SafetyDashboard } from '@/components/safety/safety-dashboard'
import { ToolboxTalkConductor } from '@/components/safety/toolbox-talk-conductor'
import { CertManager } from '@/components/safety/cert-manager'
import { IncidentReport } from '@/components/safety/incident-report'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

type SafetyData = {
  stats: Awaited<ReturnType<typeof getSafetyStats>>
  talks: Awaited<ReturnType<typeof getToolboxTalks>>
  recentSessions: Awaited<ReturnType<typeof getRecentToolboxSessions>>
  incidents: Awaited<ReturnType<typeof getIncidents>>
  crewMembers: { id: string; name: string; avatar_url: string | null }[]
  usersWithCerts: { id: string; name: string; avatar_url: string | null; certs: Certification[] }[]
  missingTalks: Awaited<ReturnType<typeof getCrewsMissingTalkToday>>
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string }> = {
  minor: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  moderate: { color: 'var(--accent-amber)', bg: 'var(--accent-amber-dim)' },
  serious: { color: 'var(--accent-red)', bg: 'var(--accent-red-dim)' },
  fatal: { color: '#fff', bg: '#7f1d1d' },
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  reported: { color: 'var(--accent-red)', bg: 'var(--accent-red-dim)' },
  investigating: { color: 'var(--accent-amber)', bg: 'var(--accent-amber-dim)' },
  resolved: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  closed: { color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
}

export function SafetyClient() {
  const [data, setData] = useState<SafetyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function fetchAll() {
      const supabase = createClient()
      const [stats, talks, recentSessions, incidents, allCerts, crewResult, missingTalks] = await Promise.all([
        getSafetyStats(),
        getToolboxTalks(),
        getRecentToolboxSessions(10),
        getIncidents(),
        getAllCertificationsWithUsers(),
        supabase.from('users').select('id, name, avatar_url').eq('role', 'crew').order('name'),
        getCrewsMissingTalkToday(),
      ])

      const crewMembers = (crewResult.data ?? []) as { id: string; name: string; avatar_url: string | null }[]

      const certsByUser = allCerts.reduce<Record<string, Certification[]>>((acc, cert) => {
        const uid = cert.user_id
        if (!acc[uid]) acc[uid] = []
        acc[uid].push(cert)
        return acc
      }, {})

      const usersWithCerts = crewMembers.map((user) => ({
        ...user,
        certs: certsByUser[user.id] ?? [],
      }))

      if (mounted) {
        setData({ stats, talks, recentSessions, incidents, crewMembers, usersWithCerts, missingTalks })
      }
    }

    fetchAll()
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [])

  if (loading || !data) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Skeleton width="100px" height="28px" />
            <Skeleton width="50px" height="20px" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  const { stats, talks, recentSessions, incidents, crewMembers, usersWithCerts, missingTalks } = data

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      {/* Page header */}
      <div
        style={{
          padding: '24px 24px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Safety
        </h1>
        <span
          style={{
            padding: '2px 8px',
            backgroundColor: 'var(--accent-dim)',
            borderRadius: '4px',
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          OSHA
        </span>
      </div>

      <SafetyDashboard
        talksThisWeek={stats.talksThisWeek}
        inspectionsPassed={stats.inspectionsThisMonth.passed}
        inspectionsFailed={stats.inspectionsThisMonth.failed}
        openIncidents={stats.openIncidents}
        expiringCerts={stats.expiringCerts}
      >
        {{
          overview: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {missingTalks.length > 0 && (
                <div
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--accent-red-dim)',
                    border: '1px solid rgba(255,82,82,0.3)',
                    borderRadius: '8px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--accent-red)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Crew Missing Toolbox Talk Today ({missingTalks.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {missingTalks.map((m) => (
                      <div
                        key={m.userId}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                        }}
                      >
                        {m.userName}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {recentSessions.length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Recent Toolbox Talks
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentSessions.slice(0, 5).map((session) => (
                      <div
                        key={session.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {session.talk?.title ?? 'Safety Talk'}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              marginTop: '2px',
                            }}
                          >
                            {new Date(session.conducted_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {incidents.filter((i) => i.status === 'reported' || i.status === 'investigating').length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--accent-red)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Open Incidents
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {incidents
                      .filter((i) => i.status === 'reported' || i.status === 'investigating')
                      .slice(0, 3)
                      .map((incident) => {
                        const sevStyle = SEVERITY_COLORS[incident.severity] ?? SEVERITY_COLORS.minor
                        return (
                          <div
                            key={incident.id}
                            style={{
                              padding: '12px 14px',
                              backgroundColor: 'var(--accent-red-dim)',
                              border: '1px solid rgba(255,82,82,0.2)',
                              borderRadius: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span
                                style={{
                                  padding: '1px 7px',
                                  backgroundColor: sevStyle.bg,
                                  borderRadius: '4px',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: sevStyle.color,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {incident.severity}
                              </span>
                              <span
                                style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                }}
                              >
                                {incident.incident_type.replace('_', ' ')}
                              </span>
                            </div>
                            <div
                              style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {incident.description}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          ),

          talks: (
            <ToolboxTalkConductor
              talks={talks}
              crewMembers={crewMembers}
              jobId={undefined}
            />
          ),

          inspections: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                Inspections are conducted from the crew job view. Use the Overview tab to see today&apos;s inspection status.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: '#22c55e',
                    minWidth: '40px',
                  }}
                >
                  {stats.inspectionsThisMonth.passed}
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Passed this month
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '24px',
                    fontWeight: 700,
                    color: stats.inspectionsThisMonth.failed > 0 ? 'var(--accent-red)' : 'var(--text-muted)',
                    minWidth: '40px',
                  }}
                >
                  {stats.inspectionsThisMonth.failed}
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Failed this month
                </span>
              </div>
            </div>
          ),

          incidents: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '12px',
                  }}
                >
                  File a New Incident Report
                </div>
                <IncidentReport />
              </div>

              {incidents.length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '8px',
                    }}
                  >
                    Incident Log
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {incidents.map((incident) => {
                      const sevStyle = SEVERITY_COLORS[incident.severity] ?? SEVERITY_COLORS.minor
                      const statStyle = STATUS_COLORS[incident.status] ?? STATUS_COLORS.reported
                      return (
                        <div
                          key={incident.id}
                          style={{
                            padding: '16px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                backgroundColor: sevStyle.bg,
                                borderRadius: '4px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '10px',
                                fontWeight: 700,
                                color: sevStyle.color,
                                textTransform: 'uppercase',
                              }}
                            >
                              {incident.severity}
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-sans)',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {incident.incident_type.replace('_', ' ')}
                            </span>
                            <span style={{ marginLeft: 'auto' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  backgroundColor: statStyle.bg,
                                  borderRadius: '4px',
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: statStyle.color,
                                  textTransform: 'uppercase',
                                }}
                              >
                                {incident.status}
                              </span>
                            </span>
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-sans)',
                              fontSize: '13px',
                              color: 'var(--text-secondary)',
                              lineHeight: 1.5,
                            }}
                          >
                            {incident.description}
                          </div>
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {new Date(incident.reported_at).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            {incident.location && ` · ${incident.location}`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ),

          certifications: <CertManager usersWithCerts={usersWithCerts} />,
        }}
      </SafetyDashboard>
    </div>
  )
}
