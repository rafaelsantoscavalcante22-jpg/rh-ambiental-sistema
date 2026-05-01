import { useCallback, useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { OFFICIAL_SITE_ORIGIN } from '../../lib/officialSiteUrl'

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

type HelpKind = 'ios' | 'browser'

/**
 * PWA: atualização, botão fixo para instalar (produção) e diálogo de ajuda quando o browser não expõe prompt nativo.
 */
export function PwaPremiumShell() {
  const {
    needRefresh: [needRefreshFlag],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  })

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [helpOpen, setHelpOpen] = useState<HelpKind | null>(null)

  const showInstallEntry = import.meta.env.PROD && !isStandalone()

  useEffect(() => {
    if (!showInstallEntry) return
    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [showInstallEntry])

  useEffect(() => {
    if (!helpOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen])

  const runInstall = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }, [deferred])

  const onInstallClick = useCallback(() => {
    if (deferred) {
      void runInstall()
      return
    }
    if (isIOS()) {
      setHelpOpen('ios')
      return
    }
    setHelpOpen('browser')
  }, [deferred, runInstall])

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

      {showInstallEntry ? (
        <button
          type="button"
          className="pwa-install-fab"
          onClick={onInstallClick}
          title={`Adiciona RG Ambiental ao dispositivo como aplicativo (via navegador). Acesso oficial: ${OFFICIAL_SITE_ORIGIN}`}
          aria-label="Baixar ou instalar RG Ambiental no dispositivo"
        >
          <span className="pwa-install-fab__icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </span>
          <span className="pwa-install-fab__label">Baixar aplicativo</span>
        </button>
      ) : null}

      {helpOpen ? (
        <div className="pwa-install-help" role="dialog" aria-modal="true" aria-labelledby="pwa-install-help-title">
          <button
            type="button"
            className="pwa-install-help__backdrop"
            aria-label="Fechar"
            onClick={() => setHelpOpen(null)}
          />
          <div className="pwa-install-help__panel">
            <h2 id="pwa-install-help-title" className="pwa-install-help__title">
              {helpOpen === 'ios' ? 'Adicionar à tela inicial' : 'Instalar no computador'}
            </h2>
            {helpOpen === 'ios' ? (
              <p className="pwa-install-help__text">
                No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
              </p>
            ) : (
              <>
                <p className="pwa-install-help__text">
                  No <strong>Chrome</strong> ou <strong>Edge</strong>, procure o ícone de instalação na barra de endereços (por exemplo ⊕ ou monitor com seta) ou abra o menu{' '}
                  <strong>⋮</strong> e escolha <strong>Instalar RG Ambiental</strong> / <strong>Instalar como aplicativo</strong>.
                </p>
                <p className="pwa-install-help__note">
                  Não é feito download de um ficheiro instalável (.exe): o navegador cria um atalho que abre o sistema como aplicativo.
                </p>
              </>
            )}
            <button type="button" className="pwa-install-help__close" onClick={() => setHelpOpen(null)}>
              Entendi
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
