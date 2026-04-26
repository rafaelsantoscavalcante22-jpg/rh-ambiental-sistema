import { useId } from 'react'

/** Logótipo RG CHAT — alinhado à marca Rg (itálico). */
export function RgChatLogo({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '')
  const gradId = `rgchat-glow-${uid}`

  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="40" y1="14" x2="40" y2="66" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="33" fill={`url(#${gradId})`} />
      <circle cx="40" cy="40" r="36" stroke="rgba(255,255,255,0.42)" strokeWidth="1.25" />
      <text
        x="40"
        y="44"
        textAnchor="middle"
        fill="#fff"
        style={{
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: '22px',
          fontStyle: 'italic',
          fontWeight: 800,
          letterSpacing: '-0.06em',
        }}
      >
        Rg
      </text>
      <text
        x="40"
        y="58"
        textAnchor="middle"
        fill="rgba(255,255,255,0.92)"
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.16em',
        }}
      >
        CHAT
      </text>
    </svg>
  )
}
