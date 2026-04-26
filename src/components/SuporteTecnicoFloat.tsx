import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useChatFloat } from '../contexts/ChatFloatContext'
import { chatEnviarPedidoSuporteTecnico, deveOcultarBalaoSuporteTecnico } from '../lib/chat'

export type SuporteTecnicoFloatProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Para `aria-controls` no botão da sidebar (mesmo `id` do diálogo). */
  panelId: string
}

export default function SuporteTecnicoFloat({ open, onOpenChange, panelId }: SuporteTecnicoFloatProps) {
  const { openChat, openChatWithUser } = useChatFloat()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucessoId, setSucessoId] = useState<string | null>(null)
  const [contaSuporte, setContaSuporte] = useState(false)
  const abertoAnterior = useRef(false)

  useEffect(() => {
    if (open && !abertoAnterior.current) {
      setErro('')
      setSucessoId(null)
      setTexto('')
    }
    abertoAnterior.current = open
  }, [open])

  useEffect(() => {
    let cancel = false

    function aplicar(user: { id: string; email?: string | null } | null) {
      if (cancel || !user?.id) {
        setContaSuporte(false)
        return
      }
      setContaSuporte(deveOcultarBalaoSuporteTecnico(user.id, user.email))
    }

    void supabase.auth.getUser().then(({ data: { user } }) => {
      aplicar(user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      aplicar(session?.user ?? null)
    })

    return () => {
      cancel = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const fecharPainel = useCallback(() => {
    onOpenChange(false)
    setErro('')
  }, [onOpenChange])

  const enviar = useCallback(async () => {
    setEnviando(true)
    setErro('')
    setSucessoId(null)
    try {
      const { suporteUserId } = await chatEnviarPedidoSuporteTecnico(texto)
      setTexto('')
      setSucessoId(suporteUserId)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar.')
    } finally {
      setEnviando(false)
    }
  }, [texto])

  const abrirNoChat = useCallback(() => {
    if (!sucessoId) return
    openChatWithUser(sucessoId)
    onOpenChange(false)
    setSucessoId(null)
  }, [openChatWithUser, sucessoId, onOpenChange])

  const painel = (
    <div className="suporte-float-root">
      {open ? (
        <>
          <div
            className="suporte-float-backdrop"
            aria-hidden
            onClick={() => !enviando && fecharPainel()}
          />
          <div className="suporte-float-panel-wrap">
            <section
              id={panelId}
              className="suporte-float-panel"
              role="dialog"
              aria-labelledby={`${panelId}-titulo`}
              aria-modal="true"
            >
              <div className="suporte-float-panel__head">
                <h2 id={`${panelId}-titulo`} className="suporte-float-panel__title">
                  Suporte técnico
                </h2>
                <p className="suporte-float-panel__lead">
                  {contaSuporte
                    ? 'Esta sessão é a conta de suporte. Os pedidos dos colegas chegam-lhe pelo Chat Interno.'
                    : 'Descreva o problema. A mensagem é enviada ao chat interno do suporte.'}
                </p>
              </div>

              {contaSuporte ? (
                <div className="suporte-float-actions suporte-float-actions--solo">
                  <button
                    type="button"
                    className="suporte-float-btn suporte-float-btn--primary"
                    onClick={() => {
                      fecharPainel()
                      openChat()
                    }}
                  >
                    Abrir Chat Interno
                  </button>
                  <button type="button" className="suporte-float-btn suporte-float-btn--ghost" onClick={fecharPainel}>
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  {erro ? (
                    <div className="suporte-float-alert" role="alert">
                      {erro}
                    </div>
                  ) : null}

                  {sucessoId ? (
                    <div className="suporte-float-ok">
                      <p>Pedido enviado. Pode continuar a conversa no Chat Interno.</p>
                      <div className="suporte-float-ok__actions">
                        <button type="button" className="suporte-float-btn suporte-float-btn--primary" onClick={abrirNoChat}>
                          Abrir conversa
                        </button>
                        <button
                          type="button"
                          className="suporte-float-btn suporte-float-btn--ghost"
                          onClick={() => {
                            setSucessoId(null)
                            fecharPainel()
                          }}
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label htmlFor={`${panelId}-msg`} className="suporte-float-label">
                        O que está a acontecer?
                      </label>
                      <textarea
                        ref={textareaRef}
                        id={`${panelId}-msg`}
                        className="suporte-float-textarea"
                        rows={5}
                        placeholder="Ex.: não consigo gravar a coleta, erro ao anexar ficheiro…"
                        value={texto}
                        disabled={enviando}
                        onChange={(e) => setTexto(e.target.value)}
                      />

                      <div className="suporte-float-actions">
                        <button
                          type="button"
                          className="suporte-float-btn suporte-float-btn--ghost"
                          disabled={enviando}
                          onClick={fecharPainel}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="suporte-float-btn suporte-float-btn--primary"
                          disabled={enviando || !texto.trim()}
                          onClick={() => void enviar()}
                        >
                          {enviando ? 'A enviar…' : 'Enviar'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal(painel, document.body)
}
