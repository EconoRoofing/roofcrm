import { getUser, getUserRole } from '@/lib/auth'
import { getJobsByDate } from '@/lib/actions/jobs'
import { PhotosGrid } from '@/components/crew/photos-grid'
import type { Job, UserRole } from '@/lib/types/database'

type JobWithCompany = Job & {
  company: { id: string; name: string; color: string } | null
}

export default async function PhotosPage() {
  const user = await getUser()

  if (!user) {
    return (
      <div
        style={{
          padding: '48px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-muted)',
          }}
        >
          Not signed in
        </span>
      </div>
    )
  }

  const role = (await getUserRole(user.id)) ?? 'crew'
  const todayString = new Date().toISOString().split('T')[0]
  const jobs = await getJobsByDate(todayString, user.id, role as UserRole)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        paddingTop: '24px',
        paddingBottom: '8px',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '0 16px 20px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Photos
        </h1>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Today&apos;s job photos
        </span>
      </div>

      <PhotosGrid jobs={jobs as JobWithCompany[]} />
    </div>
  )
}
