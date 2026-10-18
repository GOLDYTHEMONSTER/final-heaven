import Image from 'next/image'

interface LogoMarkProps {
  /** Rendered height in px. Width follows the mark's aspect ratio. */
  size?: number
  variant?: 'white' | 'black'
  className?: string
  priority?: boolean
}

// Trimmed brand mark (public/brand), 589 x 667.
const RATIO = 589 / 667

export function LogoMark({ size = 32, variant = 'white', className = '', priority = false }: LogoMarkProps) {
  return (
    <Image
      src={variant === 'black' ? '/brand/logo-black.png' : '/brand/logo-white.png'}
      alt=""
      aria-hidden="true"
      width={Math.round(size * RATIO)}
      height={size}
      priority={priority}
      className={`select-none ${className}`}
      draggable={false}
    />
  )
}
