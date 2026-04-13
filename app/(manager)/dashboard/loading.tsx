import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)', padding: '24px' }}>
      <Skeleton width="180px" height="28px" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
        {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
