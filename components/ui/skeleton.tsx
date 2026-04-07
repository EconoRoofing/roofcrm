'use client'

interface SkeletonProps {
  width?: string
  height?: string
  className?: string
}

export function Skeleton({ width, height, className = '' }: SkeletonProps) {
  return (
    <div
      className={`rounded ${className}`}
      style={{
        width: width ?? '100%',
        height: height ?? '16px',
        background: 'linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-card) 50%, var(--bg-elevated) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite linear',
      }}
    />
  )
}

export function SkeletonCard() {
  return (
    <Skeleton
      className="rounded-[var(--radius-lg)] w-full"
      height="120px"
    />
  )
}

export function SkeletonRow() {
  return (
    <Skeleton
      className="rounded w-full"
      height="48px"
    />
  )
}
