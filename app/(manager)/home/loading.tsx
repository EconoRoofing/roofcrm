import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function HomeLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton width="200px" height="28px" />
          <Skeleton width="80px" height="20px" />
        </div>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
        {/* Content */}
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
