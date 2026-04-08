'use client'

import { useEffect, useState } from 'react'
import { getCrewAvailability, assignJobToCrew, unassignJobFromCrew } from '@/lib/actions/scheduling'

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CrewScheduler() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState<string>('')
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Initialize with current week start (Monday)
  useEffect(() => {
    const today = new Date()
    const day = today.getDay() || 7
    const diff = today.getDate() - day + 1
    const monday = new Date(today.setDate(diff))
    setWeekStart(monday.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    if (!weekStart) return

    async function loadData() {
      try {
        setLoading(true)
        const result = await getCrewAvailability(weekStart)
        setData(result)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load schedule')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [weekStart])

  const handleAssignJob = async (jobId: string, crewId: string, dayOffset: number) => {
    try {
      const dateObj = new Date(weekStart)
      dateObj.setDate(dateObj.getDate() + dayOffset)
      const dateStr = dateObj.toISOString().split('T')[0]

      await assignJobToCrew(jobId, crewId, dateStr)

      // Reload data
      const result = await getCrewAvailability(weekStart)
      setData(result)
      setSelectedJob(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed')
    }
  }

  const handleUnassignJob = async (jobId: string) => {
    try {
      await unassignJobFromCrew(jobId)
      const result = await getCrewAvailability(weekStart)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unassignment failed')
    }
  }

  const getDateForDay = (dayOffset: number) => {
    const dateObj = new Date(weekStart)
    dateObj.setDate(dateObj.getDate() + dayOffset)
    return dateObj.toISOString().split('T')[0]
  }

  const getJobsForCrewDay = (crewId: string, dayOffset: number) => {
    const date = getDateForDay(dayOffset)
    const assignments = data?.assignments.get(crewId) || []
    return assignments.filter((a: any) => a.date === date)
  }

  if (!weekStart) return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading...</div>

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading schedule...</div>
  }

  if (error) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-danger)', backgroundColor: 'var(--bg-danger-dim)', borderRadius: '8px' }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header with navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Crew Schedule
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => {
              const newDate = new Date(weekStart)
              newDate.setDate(newDate.getDate() - 7)
              setWeekStart(newDate.toISOString().split('T')[0])
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
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
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Next Week
          </button>
        </div>
      </div>

      {/* Unassigned jobs panel */}
      {data?.unassignedJobs.length > 0 && (
        <div
          style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
          }}
        >
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>
            UNASSIGNED JOBS ({data.unassignedJobs.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {data.unassignedJobs.map((job: any) => (
              <button
                key={job.id}
                onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid ' + (selectedJob === job.id ? 'var(--accent)' : 'var(--border-subtle)'),
                  backgroundColor: selectedJob === job.id ? 'var(--accent-dim)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {job.job_number} - {job.customer_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Weekly grid */}
      <div
        style={{
          overflowX: 'auto',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: '900px',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <th
                style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  width: '120px',
                  borderRight: '1px solid var(--border-subtle)',
                }}
              >
                CREW MEMBER
              </th>
              {DAYS_OF_WEEK.map((day, idx) => (
                <th
                  key={day}
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    borderRight: idx < 6 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <div>{day}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(weekStart).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    }).split(' ')[0]}{' '}
                    {parseInt(new Date(weekStart).toLocaleDateString('en-US', { day: 'numeric' })) + idx}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.crew.map((member: any) => (
              <tr
                key={member.id}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {/* Crew name */}
                <td
                  style={{
                    padding: '12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    borderRight: '1px solid var(--border-subtle)',
                    maxWidth: '120px',
                    wordBreak: 'break-word',
                  }}
                >
                  {member.name}
                </td>

                {/* Day cells */}
                {DAYS_OF_WEEK.map((_, dayOffset) => {
                  const jobs = getJobsForCrewDay(member.id, dayOffset)
                  const isEmpty = jobs.length === 0
                  const isSelectable = selectedJob !== null

                  return (
                    <td
                      key={dayOffset}
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        borderRight: dayOffset < 6 ? '1px solid var(--border-subtle)' : 'none',
                        minHeight: '80px',
                        verticalAlign: 'top',
                        backgroundColor: isSelectable && isEmpty ? 'var(--bg-secondary)' : 'transparent',
                      }}
                      onClick={() => {
                        if (isSelectable && isEmpty) {
                          handleAssignJob(selectedJob, member.id, dayOffset)
                        }
                      }}
                    >
                      {isEmpty ? (
                        <div
                          style={{
                            fontSize: '11px',
                            color: isSelectable ? 'var(--accent)' : 'var(--text-muted)',
                            cursor: isSelectable ? 'pointer' : 'default',
                            padding: '4px',
                          }}
                        >
                          {isSelectable ? 'Click to assign' : 'Available'}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {jobs.map((job: any) => (
                            <div
                              key={job.jobId}
                              onClick={(e) => {
                                e.stopPropagation()
                              }}
                              style={{
                                padding: '6px',
                                backgroundColor: 'var(--accent-dim)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent)'
                                (e.currentTarget as HTMLDivElement).style.color = 'var(--bg-deep)'
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent-dim)'
                                (e.currentTarget as HTMLDivElement).style.color = 'var(--text-primary)'
                              }}
                              title={`${job.jobNumber}\n${job.customerName}\nDouble-click to unassign`}
                              onDoubleClick={() => handleUnassignJob(job.jobId)}
                            >
                              {job.jobNumber}
                            </div>
                          ))}
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
      <div
        style={{
          marginTop: '24px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div>
          <span style={{ display: 'inline-block', color: 'var(--text-muted)', marginRight: '8px' }}>Note:</span>
          Click unassigned job to select, then click an empty cell to assign
        </div>
        <div>
          <span style={{ display: 'inline-block', color: 'var(--text-muted)', marginRight: '8px' }}>Tip:</span>
          Double-click a job to remove it from schedule
        </div>
      </div>
    </div>
  )
}
