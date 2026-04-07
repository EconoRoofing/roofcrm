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
    theme_color: '#00e676',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
