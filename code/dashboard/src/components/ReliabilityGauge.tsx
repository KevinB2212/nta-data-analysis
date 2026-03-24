// circular gauge that shows on-time % for a route
// green = 85%+, amber = 70-84%, red = below 70%
// uses SVG - the trick is strokeDashoffset to animate the arc
interface ReliabilityGaugeProps {
  percentage: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export default function ReliabilityGauge({
  percentage: rawPercentage,
  size = 'md',
  showLabel = true,
}: ReliabilityGaugeProps) {
  const percentage = rawPercentage !== null
    ? Math.min(100, Math.max(0, Math.round(rawPercentage)))
    : null

  const sizes = {
    sm: { outer: 60, stroke: 6, fontSize: 'text-xs' },
    md: { outer: 100, stroke: 8, fontSize: 'text-xl' },
    lg: { outer: 140, stroke: 10, fontSize: 'text-3xl' },
  }

  const { outer, stroke, fontSize } = sizes[size]
  // SVG circle maths - circumference of the ring, then how much to fill
  const radius = (outer - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = percentage !== null ? (percentage / 100) * circumference : 0
  const offset = circumference - progress

  const getColor = (value: number | null) => {
    if (value === null) return { stroke: '#94a3b8', text: 'text-slate-400' }
    if (value >= 85) return { stroke: '#22c55e', text: 'text-emerald-500' }
    if (value >= 70) return { stroke: '#f59e0b', text: 'text-amber-500' }
    return { stroke: '#ef4444', text: 'text-red-500' }
  }

  const color = getColor(percentage)

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: outer, height: outer }}>
        <svg
          className="transform -rotate-90"
          width={outer}
          height={outer}
          role="img"
          aria-label={percentage !== null ? `${percentage}% on-time reliability` : 'No reliability data available'}
        >
          <circle
            cx={outer / 2}
            cy={outer / 2}
            r={radius}
            fill="none"
            className="stroke-slate-200 dark:stroke-slate-700"
            strokeWidth={stroke}
          />
          <circle
            cx={outer / 2}
            cy={outer / 2}
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-bold ${fontSize} ${color.text}`}>
            {percentage !== null ? `${percentage}%` : '—'}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {percentage !== null ? 'On-time' : 'No data'}
        </span>
      )}
    </div>
  )
}
