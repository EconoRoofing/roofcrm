import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function ScheduleLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)', padding: '24px' }}>
      <Skeleton width="200px" height="28px" />
      <div style={{ marginTop: '24px' }}>
        <SkeletonCard />
        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} height="56px" />)}
        </div>
      </div>
    </div>
  )
}
