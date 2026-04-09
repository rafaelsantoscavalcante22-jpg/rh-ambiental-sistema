import { useState, type CSSProperties } from 'react'

type Props = {
  nome: string
  fotoUrl?: string | null
  size?: number
  className?: string
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  if (p.length >= 2) return `${p[0][0]}${p[1][0]}`.toUpperCase()
  return (p[0] || 'RG').slice(0, 2).toUpperCase()
}

export function ChatAvatar({ nome, fotoUrl, size = 40, className }: Props) {
  const [falhou, setFalhou] = useState(false)

  const s: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    border: '1px solid var(--border-color, #e2e8f0)',
    background: 'linear-gradient(145deg, #ecfdf5, #d1fae5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.32,
    fontWeight: 800,
    color: '#0f766e',
  }

  if (fotoUrl && !falhou) {
    return (
      <img
        src={fotoUrl}
        alt=""
        className={className}
        style={s}
        loading="lazy"
        onError={() => setFalhou(true)}
      />
    )
  }

  return (
    <span
      className={className ? `chat-interno-avatar-fallback ${className}` : 'chat-interno-avatar-fallback'}
      style={s}
    >
      {iniciais(nome)}
    </span>
  )
}
