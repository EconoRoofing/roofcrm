import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { getToolboxTalks } from '@/lib/actions/safety'
import { ToolboxTalkConductor } from '@/components/safety/toolbox-talk-conductor'

export default async function CrewSafetyTalksPage() {
  const user = await getUser()
  const supabase = await createClient()

  const [talks, crewResult] = await Promise.all([
    getToolboxTalks(),
    supabase.from('users').select('id, name, avatar_url').eq('role', 'crew').order('name'),
  ])

  const crewMembers = (crewResult.data ?? []) as { id: string; name: string; avatar_url: string | null }[]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        minHeight: '100%',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Safety Talks
        </h1>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)',
            marginTop: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          OSHA-compliant toolbox talks
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px' }}>
        <ToolboxTalkConductor
          talks={talks}
          crewMembers={crewMembers}
          jobId={undefined}
        />
      </div>
    </div>
  )
}
