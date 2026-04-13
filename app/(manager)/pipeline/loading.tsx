import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function PipelineLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)', padding: '24px' }}>
      <Skeleton width="150px" height="28px" />
      <div style={{ display: 'flex', gap: '16px', marginTop: '24px', overflowX: 'auto' }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{ minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton width="100%" height="32px" />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ))}
      </div>
    </div>
  )
}
