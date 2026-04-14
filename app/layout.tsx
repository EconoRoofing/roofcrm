import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeProvider } from '@/components/theme-provider'
import { ToastProvider } from '@/components/ui/toast'
import { OfflineBanner } from '@/components/ui/offline-banner'
import { SwRegister } from '@/components/ui/sw-register'
import './globals.css'

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700', '800', '900'],
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'RoofCRM',
  description: 'Roofing sales operations platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="RoofCRM" />
        <meta name="theme-color" content="#08090d" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png?v=2" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png?v=2" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png?v=2" />
        <link rel="icon" type="image/png" href="/icons/icon-192.png?v=2" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <SwRegister />
        <OfflineBanner />
        <ToastProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ToastProvider>
        {/* Audit R2-#29: zero-config Vercel observability. Privacy-friendly,
            no cookie banner, no env vars. Speed Insights tracks Core Web
            Vitals per route which is invaluable for the iPhone-heavy crew
            users where latency hits matter most. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
