// Shared SVG icon components used across the app.
// All icons accept { size?: number, className?: string } and use currentColor.

interface IconProps {
  size?: number
  className?: string
}

export function PhoneIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M3 3C3 2.4 3.5 2 4 2H6.5L8 5.5L6.5 7C6.5 7 7.2 9 9 10.8C10.8 12.6 13 13.5 13 13.5L14.5 12L18 13.5V16C18 16.5 17.6 17 17 17C9.5 17 1 8.5 1 1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function AlertIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M9 2L1.5 15H16.5L9 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13" r="0.8" fill="currentColor" />
    </svg>
  )
}

export function ClockIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 5.5V9L11.5 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function PhotosIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 13L5.5 9.5C6 9 6.8 9 7.3 9.5L10 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 11L11.5 9.5C12 9 12.8 9 13.3 9.5L16 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function MapIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M2 4L7 2L11 4L16 2V14L11 16L7 14L2 16V4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M7 2V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M11 4V16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function BellIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M9 2C9 2 5 4 5 9V13H13V9C13 4 9 2 9 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 13H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7.5 13C7.5 14.4 8.2 15 9 15C9.8 15 10.5 14.4 10.5 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M6 4L10 8L6 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GearIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 1.5V3M9 15v1.5M1.5 9H3m12 0h1.5M3.7 3.7l1.1 1.1m8.5 8.5 1.1 1.1M14.3 3.7l-1.1 1.1M4.8 13.2l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MessageIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M2 3C2 2.4 2.4 2 3 2H15C15.6 2 16 2.4 16 3V11C16 11.6 15.6 12 15 12H10L7 16V12H3C2.4 12 2 11.6 2 11V3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MapPinIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M9 1C6.2 1 4 3.2 4 6C4 9.5 9 17 9 17C9 17 14 9.5 14 6C14 3.2 11.8 1 9 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="6" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
