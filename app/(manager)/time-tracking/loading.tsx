import { Skeleton, SkeletonCard } from '@/components/ui/skeleton'

export default function TimeTrackingLoading() {
  return (
    <div
      style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      <Skeleton width="200px" height="28px" />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}
