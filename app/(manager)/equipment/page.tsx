import { getEquipment } from '@/lib/actions/equipment'
import EquipmentManager from '@/components/manager/equipment-manager'

export default async function EquipmentPage() {
  const equipment = await getEquipment()

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
      <h1
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '24px',
          fontWeight: 900,
          color: 'var(--text-primary)',
          margin: 0,
          letterSpacing: '-0.02em',
        }}
      >
        Equipment
      </h1>

      <EquipmentManager initialEquipment={equipment} />
    </div>
  )
}
