import { CrewScheduler } from '@/components/manager/crew-scheduler'

export const metadata = {
  title: 'Crew Schedule - RoofCRM',
}

export default function SchedulePage() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-deep)' }}>
      <CrewScheduler />
    </div>
  )
}
