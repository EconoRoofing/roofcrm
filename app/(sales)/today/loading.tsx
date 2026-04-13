import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function TodayLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)', padding: '16px' }}>
      <Skeleton width="140px" height="24px" />
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
