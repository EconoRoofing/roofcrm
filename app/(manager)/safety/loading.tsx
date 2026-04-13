import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function SafetyLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)', padding: '24px' }}>
      <Skeleton width="120px" height="28px" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginTop: '24px' }}>
        {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
      <div style={{ marginTop: '24px' }}><SkeletonCard /></div>
    </div>
  )
}
