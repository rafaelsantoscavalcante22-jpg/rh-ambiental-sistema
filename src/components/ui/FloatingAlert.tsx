import { useEffect } from 'react'

type FloatingAlertProps = {
  message: string
  variant?: 'error' | 'success'
  onClose?: () => void
}

export function FloatingAlert({ message, variant = 'error', onClose }: FloatingAlertProps) {
  useEffect(() => {
    if (!onClose) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const palette =
    variant === 'success'
      ? {
          bg: '#ecfdf5',
          border: '#6ee7b7',
          text: '#047857',
          shadow: '0 20px 50px rgba(16, 185, 129, 0.22)',
        }
      : {
          bg: '#fef2f2',
          border: '#fecaca',
          text: '#991b1b',
          shadow: '0 18px 48px rgba(185, 28, 28, 0.18)',
        }

  const overlayBg = variant === 'success' ? 'rgba(15, 23, 42, 0.08)' : 'rgba(15, 23, 42, 0.25)'
  const overlayBlur = variant === 'success' ? 'blur(1px)' : 'blur(2px)'

  return (
    <div
      role="presentation"
      onClick={() => onClose?.()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '18px',
        background: overlayBg,
        backdropFilter: overlayBlur,
      }}
    >
      <div
        role="alert"
        aria-live={variant === 'error' ? 'assertive' : 'polite'}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          background: palette.bg,
          color: palette.text,
          border: `2px solid ${palette.border}`,
          borderRadius: variant === 'success' ? '20px' : '14px',
          padding: '16px 18px',
          fontWeight: 800,
          lineHeight: 1.4,
          boxShadow: palette.shadow,
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{message}</div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar alerta"
            style={{
              flex: '0 0 auto',
              border: 'none',
              background: 'transparent',
              color: palette.text,
              fontSize: '18px',
              lineHeight: 1,
              fontWeight: 900,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '10px',
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}
