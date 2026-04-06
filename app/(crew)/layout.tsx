import CrewBottomNav from './_components/crew-bottom-nav'

export default function CrewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        backgroundColor: 'var(--bg-deep)',
      }}
    >
      {/* Full-screen content area — no top nav */}
      <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>

      {/* Bottom navigation bar */}
      <CrewBottomNav />
    </div>
  )
}
