import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function JobLoading() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)', padding: '24px' }}>
      <Skeleton width="250px" height="28px" />
      <Skeleton width="180px" height="16px" className="mt-2" />
      <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
