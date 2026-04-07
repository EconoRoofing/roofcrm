import Link from 'next/link'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    href: string
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="mb-4 text-[var(--text-muted)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[var(--text-muted)] max-w-xs mb-6">
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}
