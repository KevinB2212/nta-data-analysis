// reusable card component with that frosted glass look
// variant controls opacity: subtle for headers, strong for highlighted sections
import { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  variant?: 'default' | 'subtle' | 'strong'
  hover?: boolean
  onClick?: () => void
}

export default function GlassCard({
  children,
  className = '',
  variant = 'default',
  hover = false,
  onClick,
}: GlassCardProps) {
  const variants = {
    default: 'glass',
    subtle: 'glass-subtle',
    strong: 'glass-strong',
  }

  const baseClasses = variants[variant]
  const hoverClasses = hover ? 'hover-lift cursor-pointer' : ''
  const focusClasses = onClick ? 'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900' : ''

  return (
    <div
      className={`${baseClasses} ${hoverClasses} ${focusClasses} p-6 ${className}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}
