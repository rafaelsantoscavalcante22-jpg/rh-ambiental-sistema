import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChatAvatar } from './ChatAvatar'
import { chatUrlAssinadaAnexo } from '../../lib/chat'
import { type PresencaStatus, etiquetaPresenca } from '../../lib/presencaStatus'
import type { ChatMensagem } from '../../types/chat'

type Props = {
  meuId: string
  outroNome: string
  outroFoto: string | null
  presencaOutro: PresencaStatus
  mensagens: ChatMensagem[]
  enviando: boolean
  /** Só administradores: mostra o menu com exclusão de histórico. */
  podeApagarHistorico?: boolean
  apagandoHistorico?: boolean
  onApagarHistorico?: () => void
  onEnviarTexto: (texto: string) => Promise<void>
  onEnviarFicheiro: (f: File, legenda: string) => Promise<void>
}

export function ChatThreadPanel({
  meuId,
  outroNome,
  outroFoto,
  presencaOutro,
  mensagens,
  enviando,
  podeApagarHistorico = false,
  apagandoHistorico = false,
  onApagarHistorico,
  onEnviarTexto,
  onEnviarFicheiro,
}: Props) {
  const [texto, setTexto] = useState('')
  const [menuMaisAberto, setMenuMaisAberto] = useState(false)
  const fRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const menuMaisRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuMaisAberto) return
    const onDown = (e: MouseEvent) => {
      if (menuMaisRef.current && !menuMaisRef.current.contains(e.target as Node)) {
        setMenuMaisAberto(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuMaisAberto])

  useEffect(() => {
    if (!menuMaisAberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuMaisAberto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuMaisAberto])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [mensagens.length])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const t = texto.trim()
    if (!t || enviando) return
    setTexto('')
    try {
      await onEnviarTexto(t)
    } catch {
      setTexto(t)
    }
  }

  return (
    <section className="chat-interno-thread" aria-label="Mensagens">
      <header className="chat-interno-thread__head">
        <div className="chat-interno-thread__head-main">
          <ChatAvatar nome={outroNome} fotoUrl={outroFoto} size={48} />
          <div className="chat-interno-thread__head-text">
            <h2 className="chat-interno-thread__title">{outroNome}</h2>
            <p
              className={
                presencaOutro === 'online'
                  ? 'chat-interno-status chat-interno-status--on'
                  : presencaOutro === 'ausente'
                    ? 'chat-interno-status chat-interno-status--ausente'
                    : 'chat-interno-status chat-interno-status--offline'
              }
            >
              {etiquetaPresenca(presencaOutro)}
            </p>
          </div>
        </div>
        {podeApagarHistorico && onApagarHistorico ? (
          <div className="chat-interno-thread__menu-wrap" ref={menuMaisRef}>
            <button
              type="button"
              className="chat-interno-thread__menu-trigger"
              aria-label="Mais opções da conversa"
              aria-expanded={menuMaisAberto}
              aria-haspopup="menu"
              disabled={apagandoHistorico || enviando}
              onClick={() => setMenuMaisAberto((v) => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="6" r="1.85" />
                <circle cx="12" cy="12" r="1.85" />
                <circle cx="12" cy="18" r="1.85" />
              </svg>
            </button>
            {menuMaisAberto ? (
              <ul className="chat-interno-thread__dropdown" role="menu">
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="chat-interno-thread__dropdown-danger"
                    disabled={apagandoHistorico}
                    onClick={() => {
                      setMenuMaisAberto(false)
                      onApagarHistorico()
                    }}
                  >
                    Excluir histórico da conversa…
                  </button>
                </li>
              </ul>
            ) : null}
          </div>
        ) : null}
      </header>

      <div ref={scrollRef} className="chat-interno-thread__scroll">
        {mensagens.length === 0 ? (
          <div className="chat-interno-muted chat-interno-thread__empty">Sem mensagens. Escreva abaixo.</div>
        ) : (
          mensagens.map((m) => (
            <MensagemBolha key={m.id} m={m} meuId={meuId} />
          ))
        )}
      </div>

      <form className="chat-interno-composer" onSubmit={onSubmit}>
        <input
          ref={fRef}
          type="file"
          className="chat-interno-file"
          aria-label="Anexar ficheiro"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f || enviando) return
            if (f.size > 15 * 1024 * 1024) {
              window.alert('Ficheiro demasiado grande (máx. 15 MB).')
              return
            }
            try {
              await onEnviarFicheiro(f, texto.trim())
              setTexto('')
            } catch (err) {
              console.error(err)
              window.alert('Não foi possível enviar o anexo.')
            }
          }}
        />
        <button
          type="button"
          className="chat-interno-icon-btn"
          title="Anexar"
          aria-label="Anexar ficheiro"
          disabled={enviando}
          onClick={() => fRef.current?.click()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S5 2.79 5 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"
            />
          </svg>
        </button>
        <textarea
          className="chat-interno-textarea"
          rows={1}
          placeholder="Escreva uma mensagem…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void onSubmit(e as unknown as FormEvent)
            }
          }}
          disabled={enviando}
          aria-label="Mensagem"
        />
        <button type="submit" className="chat-interno-send" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
      </form>
    </section>
  )
}

function MensagemBolha({ m, meuId }: { m: ChatMensagem; meuId: string }) {
  const meu = m.remetente_id === meuId
  const [url, setUrl] = useState<string | null>(null)
  const temAnexo = !!(m.anexo_path && m.anexo_nome)

  async function abrir() {
    if (!m.anexo_path) return
    const u = await chatUrlAssinadaAnexo(m.anexo_path)
    setUrl(u)
    if (u) window.open(u, '_blank', 'noopener,noreferrer')
  }

  const hora = new Date(m.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const mostrarTexto = !!(
    m.conteudo &&
    (!temAnexo || m.conteudo.trim() !== 'Anexo enviado')
  )

  return (
    <div className={meu ? 'chat-interno-bubble-wrap chat-interno-bubble-wrap--meu' : 'chat-interno-bubble-wrap'}>
      <div className={meu ? 'chat-interno-bubble chat-interno-bubble--meu' : 'chat-interno-bubble'}>
        {mostrarTexto ? <p className="chat-interno-bubble__text">{m.conteudo}</p> : null}
        {temAnexo ? (
          <button type="button" className="chat-interno-anexo" onClick={() => void abrir()}>
            <span className="chat-interno-anexo__icon" aria-hidden>
              📎
            </span>
            <span className="chat-interno-anexo__nome">{m.anexo_nome}</span>
            {m.anexo_size != null ? (
              <span className="chat-interno-anexo__meta">
                {(m.anexo_size / 1024).toFixed(0)} KB
              </span>
            ) : null}
            {url ? <span className="chat-interno-anexo__hint">Aberto num novo separador</span> : null}
          </button>
        ) : null}
        <time className="chat-interno-bubble__time" dateTime={m.created_at}>
          {hora}
        </time>
      </div>
    </div>
  )
}
