'use client'

import { useEffect, useState } from 'react'
import { getCommandCenterData, type CommandCenterData } from '@/lib/actions/command-center'
import { CommandCenter } from '@/components/manager/command-center'
import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export function HomeClient() {
  const [data, setData] = useState<CommandCenterData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    getCommandCenterData()
      .then(d => { if (mounted) setData(d) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  if (loading || !data) {
    return (
      <div style={{ minHeight: '100dvh', backgroundColor: 'var(--bg-deep)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Skeleton width="200px" height="28px" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return <CommandCenter data={data} managerName="Manager" />
}
