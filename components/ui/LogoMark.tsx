'use client'

interface LogoMarkProps {
  size?: number
  variant?: 'white' | 'black' | 'silhouette'
  className?: string
}

export function LogoMark({ size = 36, variant = 'white', className = '' }: LogoMarkProps) {
  const strokeColor = variant === 'black' ? '#000000' : '#FFFFFF'
  const opacity = variant === 'silhouette' ? 0.15 : 1
  const variantClass = variant === 'black' ? 'logo-mark-black' : variant === 'silhouette' ? 'logo-mark-silhouette' : 'logo-mark'

  return (
    <span className={`${variantClass} ${className}`} style={{ opacity }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <g stroke={strokeColor} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 30v40M5 50h20" />
          <path d="M50 10v80M30 50h40" />
          <path d="M85 30v40M75 50h20" />
        </g>
      </svg>
    </span>
  )
}
