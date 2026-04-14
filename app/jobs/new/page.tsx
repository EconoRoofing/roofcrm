import { redirect } from 'next/navigation'
import { getUser, getUserRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { JobForm } from '@/components/job-form'
import type { Company, User, UserRole } from '@/lib/types/database'

export default async function NewJobPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const role = (await getUserRole(user.id)) as UserRole | null
  if (!role) redirect('/login')

  const supabase = await createClient()

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
      <div
        style={{
          maxWidth: '520px',
          margin: '0 auto',
          padding: '0 16px',
        }}
      >
        <div style={{ marginBottom: '24px', paddingTop: '8px' }}>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.3px',
            }}
          >
            New Lead
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Fill in the details to create a new job lead.
          </p>
        </div>

        <JobForm
          companies={(companies as Company[]) ?? []}
          currentUserRole={role}
          currentUserId={user.id}
          salesUsers={salesUsers}
        />
      </div>
    </main>
  )
}
