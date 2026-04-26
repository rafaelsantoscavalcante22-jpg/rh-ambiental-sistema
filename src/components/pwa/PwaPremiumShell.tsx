import { useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const LS_IOS = 'rg-pwa-ios-hint-dismissed'
const LS_INSTALL = 'rg-pwa-install-strip-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/**
 * Camada PWA: atualização de versão, instalação (Chrome/Android) e dica discreta para iOS.
 * Montada uma única vez em App — não altera layouts das páginas.
 */
export function PwaPremiumShell() {
  const {
    needRefresh: [needRefreshFlag],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  })

  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem(LS_INSTALL) === '1'
    } catch {
      return false
    }
  })
  const [iosDismissed, setIosDismissed] = useState(() => {
    try {
      return localStorage.getItem(LS_IOS) === '1'
    } catch {
      return false
    }
  })

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const dismissInstall = useCallback(() => {
    setDeferred(null)
    setInstallDismissed(true)
    try {
      localStorage.setItem(LS_INSTALL, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const dismissIos = useCallback(() => {
    setIosDismissed(true)
    try {
      localStorage.setItem(LS_IOS, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const runInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }, [deferred])

  const standalone = isStandalone()
  const showAndroidInstall =
    !standalone && !installDismissed && deferred !== null && !isIOS()
  const showIosHint = isIOS() && !standalone && !iosDismissed

  return (
    <>
      {needRefreshFlag ? (
        <div className="pwa-update-bar" role="status">
          <span className="pwa-update-bar__text">Nova versão disponível</span>
          <button
            type="button"
            className="pwa-update-bar__btn"
            onClick={() => void updateServiceWorker(true)}
          >
            Atualizar
          </button>
        </div>
      ) : null}

      {showAndroidInstall ? (
        <div className="pwa-install-strip" role="region" aria-label="Instalar aplicativo">
          <span className="pwa-install-strip__text">Acesso rápido como aplicativo no seu dispositivo.</span>
          <button type="button" className="pwa-install-strip__primary" onClick={() => void runInstall()}>
            Instalar app
          </button>
          <button type="button" className="pwa-install-strip__dismiss" onClick={dismissInstall} aria-label="Dispensar">
            ×
          </button>
        </div>
      ) : null}

      {showIosHint ? (
        <div className="pwa-ios-hint" role="region" aria-label="Adicionar à tela inicial">
          <span className="pwa-ios-hint__text">
            Para instalar: toque em <strong>Compartilhar</strong> e depois{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </span>
          <button type="button" className="pwa-ios-hint__close" onClick={dismissIos} aria-label="Fechar dica">
            ×
          </button>
        </div>
      ) : null}
    </>
  )
}
