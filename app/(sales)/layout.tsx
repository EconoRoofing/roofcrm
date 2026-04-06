import SalesBottomNav from './_components/sales-bottom-nav'

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Full-screen content area */}
      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>

      {/* Bottom navigation bar */}
      <SalesBottomNav />
    </div>
  )
}
