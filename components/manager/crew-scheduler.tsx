'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  getCrewAvailability,
  assignJobToCrew,
  assignJobToCrewMultiDay,
  unassignJobFromCrew,
  markCrewUnavailable,
  clearCrewUnavailable,
} from '@/lib/actions/scheduling'

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface WeatherData {
  temp: number
  description: string
  windSpeed: number
  rainProbability: number
}

function WeatherBadge({ weather }: { weather: WeatherData | null | undefined }) {
  if (!weather) return null
  const isRisky = weather.rainProbability > 50 || weather.windSpeed > 25
  const isWarn = weather.rainProbability > 25 || weather.windSpeed > 15
  if (!isRisky && !isWarn) return null

  const color = isRisky ? '#ef4444' : '#f59e0b'
  const bg = isRisky ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'
  const label = isRisky
    ? weather.rainProbability > 50 ? `${weather.rainProbability}% rain` : `${weather.windSpeed}mph wind`
    : weather.rainProbability > 25 ? `${weather.rainProbability}% rain` : `${weather.windSpeed}mph`

  return (
    <div
      title={`${weather.description} | Rain: ${weather.rainProbability}% | Wind: ${weather.windSpeed}mph`}
      style={{
        fontSize: '10px',
        fontWeight: 600,
        color,
        backgroundColor: bg,
        padding: '2px 5px',
        borderRadius: '3px',
        marginTop: '3px',
        display: 'inline-block',
      }}
    >
      {label}
    </div>
  )
}

export function CrewScheduler() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  // Drag state
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null)

  // Multi-day assignment modal
  const [assignModal, setAssignModal] = useState<{ jobId: string; crewId: string; date: string } | null>(null)
  const [assignDuration, setAssignDuration] = useState(1)
  const [assigning, setAssigning] = useState(false)

  // Weather: map of date string -> weather
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({})

  // Initialize with current week start (Monday)
  useEffect(() => {
    const today = new Date()
    const day = today.getDay() || 7
    const diff = today.getDate() - day + 1
    const monday = new Date(today.setDate(diff))
    setWeekStart(monday.toISOString().split('T')[0])
  }, [])

  const loadData = useCallback(async (ws: string) => {
    try {
      setLoading(true)
      const result = await getCrewAvailability(ws)
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!weekStart) return
    loadData(weekStart)
  }, [weekStart, loadData])

  // Fetch weather for the week once we have a weekStart
  useEffect(() => {
    if (!weekStart) return

    async function fetchWeather() {
      const newMap: Record<string, WeatherData> = {}
      // Use one city for the whole week (simplified; could extend to per-job city)
      try {
        const res = await fetch('/api/weather')
        if (res.ok) {
          const w: WeatherData = await res.json()
          // Apply same weather to all days (current weather API returns current conditions)
          for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart)
            d.setDate(d.getDate() + i)
            newMap[d.toISOString().split('T')[0]] = w
          }
        }
      } catch {
        // Weather is non-critical
      }
      setWeatherMap(newMap)
    }

    fetchWeather()
  }, [weekStart])

  const getDateForDay = (dayOffset: number): string => {
    const dateObj = new Date(weekStart)
    dateObj.setDate(dateObj.getDate() + dayOffset)
    return dateObj.toISOString().split('T')[0]
  }

  // Returns jobs that span this cell (start date + duration covers this day)
  const getJobsForCrewDay = (crewId: string, dayOffset: number) => {
    const date = getDateForDay(dayOffset)
    const assignments: any[] = data?.assignments?.[crewId] || []
    return assignments.filter((a: any) => {
      if (a.date === date) return true
      // Multi-day: check if this day falls within the job's range
      const duration = a.durationDays || 1
      if (duration <= 1) return false
      const startMs = new Date(a.date).getTime()
      const endMs = startMs + (duration - 1) * 86400000
      const cellMs = new Date(date).getTime()
      return cellMs > startMs && cellMs <= endMs
    })
  }

  const isMultiDaySpanCell = (crewId: string, dayOffset: number) => {
    const date = getDateForDay(dayOffset)
    const assignments: any[] = data?.assignments?.[crewId] || []
    return assignments.some((a: any) => {
      const duration = a.durationDays || 1
      if (duration <= 1) return false
      const startMs = new Date(a.date).getTime()
      const cellMs = new Date(date).getTime()
      return cellMs > startMs && cellMs < startMs + duration * 86400000
    })
  }

  const isCrewUnavailable = (crewId: string, dayOffset: number): boolean => {
    if (!data?.unavailability) return false
    const date = getDateForDay(dayOffset)
    return (data.unavailability[crewId] || []).includes(date)
  }

  // ─── Drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    setDraggingJobId(jobId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', jobId)
  }

  const handleDragEnd = () => {
    setDraggingJobId(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, crewId: string, dayOffset: number) => {
    e.preventDefault()
    const jobId = e.dataTransfer.getData('text/plain') || draggingJobId
    if (!jobId) return

    setDraggingJobId(null)

    if (isCrewUnavailable(crewId, dayOffset)) {
      setError('Crew member is unavailable on this date')
      return
    }

    const date = getDateForDay(dayOffset)
    // Open modal for duration selection
    setAssignModal({ jobId, crewId, date })
    setAssignDuration(1)
  }

  const handleConfirmAssign = async () => {
    if (!assignModal) return
    setAssigning(true)
    try {
      await assignJobToCrewMultiDay(assignModal.jobId, assignModal.crewId, assignModal.date, assignDuration)
      await loadData(weekStart)
      setAssignModal(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed')
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassignJob = async (jobId: string) => {
    try {
      await unassignJobFromCrew(jobId)
      await loadData(weekStart)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unassignment failed')
    }
  }

  const handleToggleUnavailable = async (crewId: string, dayOffset: number) => {
    const date = getDateForDay(dayOffset)
    const currently = isCrewUnavailable(crewId, dayOffset)
    try {
      if (currently) {
        await clearCrewUnavailable(crewId, date)
      } else {
        await markCrewUnavailable(crewId, date, 'Day off')
      }
      await loadData(weekStart)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update availability')
    }
  }

  if (!weekStart) return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading...</div>

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading schedule...</div>
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Duration assign modal */}
      {assignModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setAssignModal(null) }}
        >
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '24px', width: '320px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Assign Job
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Starting {new Date(assignModal.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                DURATION (DAYS)
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => setAssignDuration(Math.max(1, assignDuration - 1))}
                  style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '16px' }}
                >
                  -
                </button>
                <span style={{ minWidth: '32px', textAlign: 'center', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {assignDuration}
                </span>
                <button
                  onClick={() => setAssignDuration(Math.min(7, assignDuration + 1))}
                  style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '16px' }}
                >
                  +
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>max 7</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAssignModal(null)}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssign}
                disabled={assigning}
                style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', backgroundColor: 'var(--accent)', color: 'var(--bg-deep)', cursor: assigning ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>Crew Schedule</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => {
              const newDate = new Date(weekStart)
              newDate.setDate(newDate.getDate() - 7)
              setWeekStart(newDate.toISOString().split('T')[0])
            }}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}
          >
            Previous Week
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', minWidth: '120px', textAlign: 'center' }}>
            Week of {new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => {
              const newDate = new Date(weekStart)
              newDate.setDate(newDate.getDate() + 7)
              setWeekStart(newDate.toISOString().split('T')[0])
            }}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }}
          >
            Next Week
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: 'var(--bg-danger-dim, rgba(239,68,68,0.1))', color: '#ef4444', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.3)', fontSize: '13px' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>Dismiss</button>
        </div>
      )}

      {/* Unassigned jobs — draggable */}
      {data?.unassignedJobs.length > 0 && (
        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            UNASSIGNED JOBS ({data.unassignedJobs.length}) — drag to schedule
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {data.unassignedJobs.map((job: any) => (
              <div
                key={job.id}
                draggable
                onDragStart={(e) => handleDragStart(e, job.id)}
                onDragEnd={handleDragEnd}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: `1px solid ${draggingJobId === job.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  backgroundColor: draggingJobId === job.id ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'grab',
                  fontWeight: 500,
                  userSelect: 'none',
                  opacity: draggingJobId === job.id ? 0.6 : 1,
                }}
              >
                {job.job_number} - {job.customer_name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly grid */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px', backgroundColor: 'var(--bg-surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', width: '120px', borderRight: '1px solid var(--border-subtle)' }}>
                CREW MEMBER
              </th>
              {DAYS_OF_WEEK.map((day, idx) => {
                const dateStr = getDateForDay(idx)
                const weather = weatherMap[dateStr]
                const isRisky = weather && (weather.rainProbability > 50 || weather.windSpeed > 25)
                const isWarn = weather && (weather.rainProbability > 25 || weather.windSpeed > 15)
                const dateObj = new Date(weekStart)
                dateObj.setDate(dateObj.getDate() + idx)
                const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                return (
                  <th
                    key={day}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: isRisky ? '#ef4444' : isWarn ? '#f59e0b' : 'var(--text-secondary)',
                      borderRight: idx < 6 ? '1px solid var(--border-subtle)' : 'none',
                      backgroundColor: isRisky
                        ? 'rgba(239,68,68,0.06)'
                        : isWarn
                        ? 'rgba(245,158,11,0.06)'
                        : undefined,
                    }}
                  >
                    <div>{day}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{dateLabel}</div>
                    <WeatherBadge weather={weather} />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {data?.crew.map((member: any) => (
              <tr key={member.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {/* Crew name */}
                <td style={{ padding: '12px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', borderRight: '1px solid var(--border-subtle)', maxWidth: '120px', wordBreak: 'break-word' }}>
                  {member.name}
                </td>

                {/* Day cells */}
                {DAYS_OF_WEEK.map((_, dayOffset) => {
                  const jobs = getJobsForCrewDay(member.id, dayOffset)
                  const unavailable = isCrewUnavailable(member.id, dayOffset)
                  const isDropTarget = draggingJobId !== null && !unavailable
                  const date = getDateForDay(dayOffset)

                  return (
                    <td
                      key={dayOffset}
                      onDragOver={isDropTarget ? handleDragOver : undefined}
                      onDrop={isDropTarget ? (e) => handleDrop(e, member.id, dayOffset) : undefined}
                      style={{
                        padding: '6px',
                        textAlign: 'center',
                        borderRight: dayOffset < 6 ? '1px solid var(--border-subtle)' : 'none',
                        minHeight: '72px',
                        verticalAlign: 'top',
                        backgroundColor: unavailable
                          ? 'rgba(100,100,100,0.08)'
                          : isDropTarget && jobs.length === 0
                          ? 'rgba(var(--accent-rgb, 59,130,246), 0.06)'
                          : undefined,
                        transition: 'background-color 0.1s',
                      }}
                    >
                      {unavailable ? (
                        <div
                          onClick={() => handleToggleUnavailable(member.id, dayOffset)}
                          style={{
                            padding: '6px 4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            letterSpacing: '0.5px',
                            cursor: 'pointer',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(100,100,100,0.1)',
                          }}
                          title="Click to clear time-off"
                        >
                          OFF
                        </div>
                      ) : jobs.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '4px 0' }}>
                          {isDropTarget && (
                            <div style={{ fontSize: '10px', color: 'var(--accent)', opacity: 0.7 }}>Drop here</div>
                          )}
                          {!isDropTarget && (
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Available</div>
                          )}
                          <button
                            onClick={() => handleToggleUnavailable(member.id, dayOffset)}
                            title="Mark as day off"
                            style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '2px', opacity: 0.5 }}
                          >
                            Mark OFF
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {jobs.map((job: any) => {
                            const isStartDay = job.date === date
                            const isMultiDay = (job.durationDays || 1) > 1
                            return (
                              <div
                                key={job.jobId + date}
                                onDoubleClick={() => isStartDay ? handleUnassignJob(job.jobId) : undefined}
                                style={{
                                  padding: '5px 6px',
                                  backgroundColor: isMultiDay && !isStartDay ? 'rgba(var(--accent-rgb,59,130,246),0.15)' : 'var(--accent-dim)',
                                  borderRadius: isMultiDay && !isStartDay ? '0' : '4px',
                                  borderLeft: isMultiDay && !isStartDay ? '2px solid var(--accent)' : undefined,
                                  fontSize: '11px',
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                  cursor: isStartDay ? 'pointer' : 'default',
                                  textAlign: 'left',
                                }}
                                onMouseEnter={(e) => {
                                  if (isStartDay) {
                                    const el = e.currentTarget as HTMLElement
                                    el.style.backgroundColor = 'var(--accent)'
                                    el.style.color = 'var(--bg-deep)'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  const el = e.currentTarget as HTMLElement
                                  el.style.backgroundColor = isMultiDay && !isStartDay ? 'rgba(var(--accent-rgb,59,130,246),0.15)' : 'var(--accent-dim)'
                                  el.style.color = 'var(--text-primary)'
                                }}
                                title={`${job.jobNumber} — ${job.customerName}${isMultiDay ? ` (${job.durationDays} days)` : ''}${isStartDay ? '\nDouble-click to unassign' : ' (span)'}`}
                              >
                                {isStartDay ? job.jobNumber : (
                                  <span style={{ opacity: 0.7 }}>{job.jobNumber}</span>
                                )}
                                {isStartDay && isMultiDay && (
                                  <span style={{ fontSize: '9px', marginLeft: '4px', opacity: 0.7 }}>
                                    {job.durationDays}d
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: '20px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        <div><span style={{ color: 'var(--text-muted)' }}>Drag:</span> Drag unassigned jobs onto crew cells</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Remove:</span> Double-click a job to unassign</div>
        <div><span style={{ color: 'var(--text-muted)' }}>Time off:</span> Click "Mark OFF" or click OFF to clear</div>
        <div><span style={{ color: '#f59e0b' }}>Amber header</span> = weather advisory</div>
        <div><span style={{ color: '#ef4444' }}>Red header</span> = high rain / wind warning</div>
      </div>
    </div>
  )
}
