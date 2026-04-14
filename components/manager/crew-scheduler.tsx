'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  getCrewAvailability,
  assignJobToCrew,
  assignJobToCrewMultiDay,
  unassignJobFromCrew,
  markCrewUnavailable,
  clearCrewUnavailable,
  getDailyDispatchSummary,
} from '@/lib/actions/scheduling'
import {
  checkWeatherAndAlert,
  autoRescheduleRainyJobs,
  sendWeatherAlertToCrews,
  rescheduleSingleJob,
} from '@/lib/actions/weather-alerts'

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface CrewMember {
  id: string
  name: string
  email: string
}

interface JobAssignment {
  jobId: string
  jobNumber: string
  customerName: string
  crewId: string
  crewName: string
  date: string
  durationDays: number
}

interface UnassignedJob {
  id: string
  job_number: string
  customer_name: string
  status: string
}

interface CrewAvailabilityData {
  crew: CrewMember[]
  assignments: Record<string, JobAssignment[]>
  unassignedJobs: UnassignedJob[]
  unavailability: Record<string, string[]>
  weekStart: string
  weekEnd: string
}

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
  const [data, setData] = useState<CrewAvailabilityData | null>(null)
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

  // Weather alert state
  const [weatherAlerts, setWeatherAlerts] = useState<{
    atRisk: Array<{
      jobId: string
      jobNumber: string
      customerName: string
      crewName: string
      city: string
      address: string
      weather: { rain: number; wind: number; description: string }
    }>
    safe: Array<any>
    totalJobs: number
  } | null>(null)
  const [weatherAlertExpanded, setWeatherAlertExpanded] = useState(false)
  const [weatherAlertLoading, setWeatherAlertLoading] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [alertingSMS, setAlertingSMS] = useState(false)
  const [weatherActionMsg, setWeatherActionMsg] = useState<string | null>(null)
  const [perJobRescheduleId, setPerJobRescheduleId] = useState<string | null>(null)
  const [perJobDate, setPerJobDate] = useState('')

  // Daily dispatch summary
  const [dispatch, setDispatch] = useState<{
    crews: Array<{
      crewId: string
      crewName: string
      jobs: Array<{ jobId: string; jobNumber: string; customerName: string; address: string; city: string; scheduledDate: string }>
      totalJobs: number
      isUnavailable: boolean
    }>
    unassignedJobs: number
    date: string
  } | null>(null)

  // Initialize with current week start (Monday)
  useEffect(() => {
    const now = new Date()
    const day = now.getDay() || 7
    const diff = now.getDate() - day + 1
    const monday = new Date(now)
    monday.setDate(diff)
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

      try {
        // Try forecast endpoint first (returns array of daily forecasts)
        const forecastRes = await fetch(`/api/weather?forecast=true&cnt=7`)
        if (forecastRes.ok) {
          const body = await forecastRes.json()

          if (Array.isArray(body)) {
            // Forecast API returned an array of daily weather
            body.forEach((w: WeatherData, i: number) => {
              const d = new Date(weekStart)
              d.setDate(d.getDate() + i)
              newMap[d.toISOString().split('T')[0]] = w
            })
          } else {
            // Fallback: API returned a single weather object — only apply to today
            const today = new Date().toISOString().split('T')[0]
            newMap[today] = body as WeatherData
          }
        }
      } catch {
        // Weather is non-critical
      }

      setWeatherMap(newMap)
    }

    fetchWeather()
  }, [weekStart])

  // Check weather alerts for the current week
  useEffect(() => {
    if (!weekStart || !data) return
    setWeatherAlertLoading(true)
    async function checkAlerts() {
      try {
        const allAtRisk: Array<{
          jobId: string; jobNumber: string; customerName: string; crewName: string;
          city: string; address: string; weather: { rain: number; wind: number; description: string }
        }> = []
        // Check each day of the week
        for (let i = 0; i < 7; i++) {
          const d = new Date(weekStart)
          d.setDate(d.getDate() + i)
          const dateStr = d.toISOString().split('T')[0]
          const result = await checkWeatherAndAlert(dateStr)
          allAtRisk.push(...result.atRisk)
        }
        // Deduplicate by jobId
        const seen = new Set<string>()
        const unique = allAtRisk.filter((j) => {
          if (seen.has(j.jobId)) return false
          seen.add(j.jobId)
          return true
        })
        setWeatherAlerts(unique.length > 0 ? { atRisk: unique, safe: [], totalJobs: unique.length } : null)
      } catch {
        // Weather alerts are non-critical
        setWeatherAlerts(null)
      } finally {
        setWeatherAlertLoading(false)
      }
    }
    checkAlerts()
  }, [weekStart, data])

  // Fetch today's dispatch summary whenever data reloads
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    getDailyDispatchSummary(today)
      .then(setDispatch)
      .catch(() => setDispatch(null))
  }, [data]) // re-fetch when schedule data changes

  const handleExportDispatch = () => {
    if (!dispatch) return
    const active = dispatch.crews.filter((c) => c.totalJobs > 0 && !c.isUnavailable)
    const totalJobs = active.reduce((sum, c) => sum + c.totalJobs, 0)
    const exportData = {
      date: dispatch.date,
      summary: `${active.length} crews active, ${totalJobs} jobs scheduled, ${dispatch.unassignedJobs} unassigned`,
      crews: active.map((c) => ({
        crew: c.crewName,
        jobs: c.jobs.map((j) => ({
          jobNumber: j.jobNumber,
          customer: j.customerName,
          address: `${j.address}${j.city ? ', ' + j.city : ''}`,
        })),
      })),
    }
    console.log('[RoofCRM] Daily Dispatch Export:', JSON.stringify(exportData, null, 2))
    alert('Dispatch exported to console. PDF/email export coming soon.')
  }

  const getDateForDay = (dayOffset: number): string => {
    const dateObj = new Date(weekStart)
    dateObj.setDate(dateObj.getDate() + dayOffset)
    return dateObj.toISOString().split('T')[0]
  }

  // Returns jobs that span this cell (start date + duration covers this day)
  const getJobsForCrewDay = (crewId: string, dayOffset: number) => {
    const date = getDateForDay(dayOffset)
    const assignments: JobAssignment[] = data?.assignments?.[crewId] || []
    return assignments.filter((a) => {
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
    const assignments: JobAssignment[] = data?.assignments?.[crewId] || []
    return assignments.some((a) => {
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
      // The action now returns { success, dayOffWarning } so we can surface
      // a Days Off overlap without blocking the assignment. The job IS
      // assigned either way — the warning is just a heads-up that the
      // target date falls inside a Days Off block from the Days Off
      // Google Calendar (synced nightly by /api/cron/daily).
      const result = await assignJobToCrewMultiDay(
        assignModal.jobId,
        assignModal.crewId,
        assignModal.date,
        assignDuration,
      )
      await loadData(weekStart)
      setAssignModal(null)
      setError(null)
      if (result.dayOffWarning) {
        // Native alert is appropriate here: it's a one-off "are you sure"
        // moment where we want an explicit acknowledgment from Mario and
        // don't need persistent UI state. The assignment has already
        // committed — this is purely notification.
        window.alert(
          `Assigned — but heads up: this date overlaps "${result.dayOffWarning}" on the Days Off calendar.`,
        )
      }
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
                  onClick={() => setAssignDuration(Math.min(14, assignDuration + 1))}
                  style={{ width: '32px', height: '32px', borderRadius: '4px', border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '16px' }}
                >
                  +
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>max 14</span>
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

      {/* Weather Alert Banner */}
      {weatherAlerts && weatherAlerts.atRisk.length > 0 && (
        <div
          style={{
            marginBottom: '16px',
            border: '1px solid rgba(245,158,11,0.4)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {/* Collapsed banner */}
          <button
            onClick={() => setWeatherAlertExpanded(!weatherAlertExpanded)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              backgroundColor: 'rgba(245,158,11,0.08)',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', flex: 1 }}>
              {weatherAlerts.atRisk.length} job{weatherAlerts.atRisk.length !== 1 ? 's' : ''} at weather risk this week
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: weatherAlertExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* Expanded detail panel */}
          {weatherAlertExpanded && (
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-surface)' }}>
              {/* Action message */}
              {weatherActionMsg && (
                <div
                  style={{
                    marginBottom: '12px',
                    padding: '8px 12px',
                    backgroundColor: 'rgba(34,197,94,0.1)',
                    border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#22c55e',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {weatherActionMsg}
                  <button
                    onClick={() => setWeatherActionMsg(null)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
                  >
                    x
                  </button>
                </div>
              )}

              {/* Bulk action buttons */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Reschedule All */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    disabled={!rescheduleDate || rescheduling}
                    onClick={async () => {
                      if (!rescheduleDate) return
                      setRescheduling(true)
                      try {
                        // Reschedule at-risk jobs for each day of the week
                        let totalRescheduled = 0
                        for (let i = 0; i < 7; i++) {
                          const d = new Date(weekStart)
                          d.setDate(d.getDate() + i)
                          const dateStr = d.toISOString().split('T')[0]
                          try {
                            const result = await autoRescheduleRainyJobs(dateStr, rescheduleDate)
                            totalRescheduled += result.rescheduled
                          } catch {
                            // Some days may have no at-risk jobs
                          }
                        }
                        setWeatherActionMsg(`${totalRescheduled} job${totalRescheduled !== 1 ? 's' : ''} rescheduled to ${new Date(rescheduleDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`)
                        setRescheduleDate('')
                        await loadData(weekStart)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Reschedule failed')
                      } finally {
                        setRescheduling(false)
                      }
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: rescheduleDate ? '#f59e0b' : 'var(--bg-secondary)',
                      color: rescheduleDate ? '#000' : 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: rescheduleDate && !rescheduling ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: rescheduling ? 0.6 : 1,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {rescheduling ? 'Rescheduling...' : 'Reschedule All'}
                  </button>
                </div>

                {/* Alert Crews */}
                <button
                  disabled={alertingSMS}
                  onClick={async () => {
                    setAlertingSMS(true)
                    try {
                      let totalSent = 0
                      let totalSkipped = 0
                      for (let i = 0; i < 7; i++) {
                        const d = new Date(weekStart)
                        d.setDate(d.getDate() + i)
                        const dateStr = d.toISOString().split('T')[0]
                        try {
                          const result = await sendWeatherAlertToCrews(dateStr)
                          totalSent += result.sent
                          totalSkipped += result.skipped
                        } catch {
                          // Skip days with no at-risk jobs
                        }
                      }
                      setWeatherActionMsg(`SMS sent to ${totalSent} crew member${totalSent !== 1 ? 's' : ''}${totalSkipped > 0 ? ` (${totalSkipped} skipped)` : ''}`)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Failed to send alerts')
                    } finally {
                      setAlertingSMS(false)
                    }
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: alertingSMS ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: alertingSMS ? 0.6 : 1,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {alertingSMS ? 'Sending...' : 'Alert Crews via SMS'}
                </button>
              </div>

              {/* Per-job list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {weatherAlerts.atRisk.map((job) => (
                  <div
                    key={job.jobId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '6px',
                      borderLeft: '3px solid #f59e0b',
                    }}
                  >
                    {/* Job info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {job.jobNumber} - {job.customerName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {job.crewName} | {job.city}
                      </div>
                    </div>

                    {/* Weather info */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                      {job.weather.rain > 50 && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#ef4444',
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1px', marginRight: '3px' }}>
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                          </svg>
                          {job.weather.rain}% rain
                        </span>
                      )}
                      {job.weather.wind > 25 && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#ef4444',
                            backgroundColor: 'rgba(239,68,68,0.12)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-1px', marginRight: '3px' }}>
                            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" />
                          </svg>
                          {job.weather.wind}mph
                        </span>
                      )}
                    </div>

                    {/* Per-job reschedule */}
                    {perJobRescheduleId === job.jobId ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                        <input
                          type="date"
                          value={perJobDate}
                          onChange={(e) => setPerJobDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                            fontSize: '11px',
                            width: '130px',
                          }}
                        />
                        <button
                          disabled={!perJobDate}
                          onClick={async () => {
                            if (!perJobDate) return
                            try {
                              const result = await rescheduleSingleJob(job.jobId, perJobDate)
                              setWeatherActionMsg(`${result.jobNumber} rescheduled`)
                              setPerJobRescheduleId(null)
                              setPerJobDate('')
                              await loadData(weekStart)
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Reschedule failed')
                            }
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: perJobDate ? '#f59e0b' : 'var(--bg-secondary)',
                            color: perJobDate ? '#000' : 'var(--text-muted)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: perJobDate ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Move
                        </button>
                        <button
                          onClick={() => { setPerJobRescheduleId(null); setPerJobDate('') }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: 'transparent',
                            color: 'var(--text-muted)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPerJobRescheduleId(job.jobId); setPerJobDate('') }}
                        title="Reschedule this job"
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: 'transparent',
                          color: 'var(--text-secondary)',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        Reschedule
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's Dispatch Panel */}
      {dispatch && (() => {
        const activeCrews = dispatch.crews.filter((c) => c.totalJobs > 0 && !c.isUnavailable)
        const unavailableCrews = dispatch.crews.filter((c) => c.isUnavailable)
        const totalJobs = activeCrews.reduce((sum, c) => sum + c.totalJobs, 0)

        return (
          <div
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            {/* Summary text */}
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: '6px' }}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              Today:
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, marginLeft: '6px' }}>
                {activeCrews.length} crew{activeCrews.length !== 1 ? 's' : ''} active
              </span>
              <span style={{ margin: '0 6px', color: 'var(--border-subtle)' }}>|</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {totalJobs} job{totalJobs !== 1 ? 's' : ''} scheduled
              </span>
              {dispatch.unassignedJobs > 0 && (
                <>
                  <span style={{ margin: '0 6px', color: 'var(--border-subtle)' }}>|</span>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                    {dispatch.unassignedJobs} unassigned
                  </span>
                </>
              )}
            </div>

            {/* Crew badges */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
              {activeCrews.map((crew) => (
                <div
                  key={crew.crewId}
                  title={crew.jobs.map((j) => `${j.jobNumber} - ${j.customerName}`).join('\n')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--accent-dim)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {crew.crewName}
                  <span style={{ marginLeft: '4px', opacity: 0.7 }}>{crew.totalJobs}</span>
                </div>
              ))}
              {unavailableCrews.map((crew) => (
                <div
                  key={crew.crewId}
                  title={`${crew.crewName} — unavailable today`}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ef4444',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {crew.crewName}
                  <span style={{ marginLeft: '4px', opacity: 0.7 }}>OFF</span>
                </div>
              ))}
            </div>

            {/* Export button */}
            <button
              onClick={handleExportDispatch}
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Dispatch
            </button>
          </div>
        )
      })()}

      {/* Unassigned jobs — draggable */}
      {(data?.unassignedJobs?.length ?? 0) > 0 && (
        <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            UNASSIGNED JOBS ({data!.unassignedJobs.length}) — drag to schedule
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {data!.unassignedJobs.map((job: UnassignedJob) => (
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
            {data?.crew.map((member: CrewMember) => (
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
                          {jobs.map((job: JobAssignment) => {
                            const isStartDay = job.date === date
                            const isMultiDay = (job.durationDays || 1) > 1
                            return (
                              <div
                                key={job.jobId + date}
                                onDoubleClick={() => isStartDay && window.confirm('Remove crew assignment?') ? handleUnassignJob(job.jobId) : undefined}
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
        <div><span style={{ color: '#f59e0b' }}>Amber banner</span> = jobs at weather risk (click to expand)</div>
      </div>
    </div>
  )
}
