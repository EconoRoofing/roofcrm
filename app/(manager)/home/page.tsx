import { getCommandCenterData } from '@/lib/actions/command-center'
import { CommandCenter } from '@/components/manager/command-center'

export const dynamic = 'force-dynamic'

/**
 * Performance pass R5-#1: previously this page rendered a client component
 * that did `useEffect(() => getCommandCenterData())` on mount. That added a
 * full waterfall (parse JS → hydrate → RSC action → paint) before LCP. On a
 * 4G iPhone that's +600–1200ms vs. server-rendering the fetch.
 *
 * Now an async server component. The `await` blocks SSR, loading.tsx shows
 * the skeleton, and the client receives the fully-rendered command center
 * on first paint. `CommandCenter` is still a 'use client' component for
 * interactivity, but it receives data as props instead of fetching itself.
 */
export default async function HomePage() {
  const data = await getCommandCenterData()
  return <CommandCenter data={data} managerName="Manager" />
}
