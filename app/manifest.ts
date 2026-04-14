import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RoofCRM',
    short_name: 'RoofCRM',
    description: 'Roofing business management for DeHart, Econo, and Nushake',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    background_color: '#08090d',
    // Audit R4-#21: was '#00e676' (accent green), which mismatched the
    // `<meta name="theme-color">` in app/layout.tsx ('#08090d'). iOS
    // honors the meta tag while Android/Chrome PWAs read the manifest,
    // so installed iOS and Android users saw different status-bar
    // colors on the same app. The dark value matches the top of the
    // app (dark background) — the green accent belongs on buttons and
    // active states, not the browser chrome. Consolidated on dark.
    theme_color: '#08090d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
