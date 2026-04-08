import { getUser } from '@/lib/auth'
import { getCommandCenterData } from '@/lib/actions/command-center'
import { CommandCenter } from '@/components/manager/command-center'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const [data] = await Promise.all([
    getCommandCenterData(),
  ])

  const managerName = (user as { name?: string })?.name ?? (user as { email?: string })?.email?.split('@')[0] ?? 'Manager'

  return <CommandCenter data={data} managerName={managerName} />
}
