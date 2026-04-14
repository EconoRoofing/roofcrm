import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser, getUserRole } from '@/lib/auth'
import { getJob } from '@/lib/actions/jobs'
import { createClient } from '@/lib/supabase/server'
import { JobForm } from '@/components/job-form'
import { ChevronLeftNavIcon } from '@/components/icons'
import type { Company, User, UserRole } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditJobPage({ params }: PageProps) {
  const { id } = await params

  const user = await getUser()
  if (!user) redirect('/login')

  const role = (await getUserRole(user.id)) as UserRole | null
  if (!role) redirect('/login')

  // Only managers and sales can edit jobs
  if (role === 'crew') notFound()

  const [job, supabase] = await Promise.all([getJob(id), createClient()])

  if (!job) notFound()

  // Fetch companies
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, color, logo_url, address, phone, license_number')
    .order('name', { ascending: true })

  // Fetch sales users for manager rep assignment
  let salesUsers: User[] = []
  if (role === 'owner' || role === 'office_manager') {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'sales')
      .order('name', { ascending: true })
    salesUsers = (data as User[]) ?? []
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-deep)',
        paddingTop: '16px',
        paddingBottom: '48px',
      }}
    >
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '0 16px' }}>
        {/* Back link */}
        <div style={{ marginBottom: '16px', paddingTop: '8px' }}>
          <Link
            href={`/jobs/${id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}
          >
            <ChevronLeftNavIcon />
            Back to Job
          </Link>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.3px',
            }}
          >
            Edit Job
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {job.job_number} &middot; {job.customer_name}
          </p>
        </div>

        <JobForm
          companies={(companies as Company[]) ?? []}
          currentUserRole={role}
          currentUserId={user.id}
          salesUsers={salesUsers}
          existingJob={job}
        />
      </div>
    </main>
  )
}
