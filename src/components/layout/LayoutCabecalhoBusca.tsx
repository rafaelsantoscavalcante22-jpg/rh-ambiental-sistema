import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BUSCA_GLOBAL_MIN_CHARS,
  buscarGlobalSistema,
  type ResultadoBuscaGlobal,
} from '../../lib/buscaGlobalSistema'
import type { UsuarioComPaginas } from '../../lib/paginasSistema'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

const ETIQUETA_TIPO: Record<ResultadoBuscaGlobal['tipo'], string> = {
  cliente: 'Cliente',
  mtr: 'MTR',
  ticket: 'Pesagem',
}

type Props = {
  usuario: UsuarioComPaginas | null
}

export function LayoutCabecalhoBusca({ usuario }: Props) {
  const navigate = useNavigate()
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)

  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ResultadoBuscaGlobal[]>([])
  const [carregando, setCarregando] = useState(false)
  const [painelAberto, setPainelAberto] = useState(false)

  const textoDebounced = useDebouncedValue(texto.trim(), 360)

  useEffect(() => {
    function fecharAoClicarFora(ev: MouseEvent) {
      const el = wrapRef.current
      if (!el?.contains(ev.target as Node)) setPainelAberto(false)
    }
    document.addEventListener('mousedown', fecharAoClicarFora)
    return () => document.removeEventListener('mousedown', fecharAoClicarFora)
  }, [])

  useEffect(() => {
    if (!usuario) {
      setResultados([])
      setCarregando(false)
      return
    }
    if (textoDebounced.length < BUSCA_GLOBAL_MIN_CHARS) {
      setResultados([])
      setCarregando(false)
      return
    }

    let cancelado = false
    setCarregando(true)
    void (async () => {
      try {
        const r = await buscarGlobalSistema(usuario, textoDebounced)
        if (!cancelado) setResultados(r)
      } catch {
        if (!cancelado) setResultados([])
      } finally {
        if (!cancelado) setCarregando(false)
      }
    })()

    return () => {
      cancelado = true
    }
  }, [usuario, textoDebounced])

  const focoComTexto = painelAberto && texto.trim().length > 0
  const minCharsOk = texto.trim().length >= BUSCA_GLOBAL_MIN_CHARS
  const mostrarAjudaCurta = focoComTexto && !minCharsOk
  /** Painel principal: já há termo com tamanho mínimo (após foco). */
  const mostrarResultadosPainel = focoComTexto && minCharsOk

  function aoEscolher(r: ResultadoBuscaGlobal) {
    navigate(r.to)
    setTexto('')
    setResultados([])
    setPainelAberto(false)
  }

  return (
    <div className="layout-header-search">
      <div className="layout-search-wrap" ref={wrapRef}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"
          />
        </svg>
        <input
          type="search"
          className="layout-search-input"
          placeholder="Cliente, número MTR ou ticket..."
          aria-label="Buscar no sistema"
          aria-autocomplete="list"
          aria-controls={mostrarAjudaCurta || mostrarResultadosPainel ? listId : undefined}
          aria-expanded={mostrarAjudaCurta || mostrarResultadosPainel}
          autoComplete="off"
          value={texto}
          disabled={!usuario}
          title={!usuario ? 'A aguardar o perfil…' : undefined}
          onChange={(e) => setTexto(e.target.value)}
          onFocus={() => setPainelAberto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPainelAberto(false)
          }}
        />

        {(mostrarAjudaCurta || mostrarResultadosPainel) && (
          <div id={listId} className="layout-search-dropdown" role="listbox">
            {mostrarAjudaCurta ? (
              <div className="layout-search-dropdown__hint" role="status">
                Digite pelo menos {BUSCA_GLOBAL_MIN_CHARS} caracteres.
              </div>
            ) : carregando && resultados.length === 0 ? (
              <div className="layout-search-dropdown__hint" role="status">
                A pesquisar…
              </div>
            ) : resultados.length === 0 ? (
              <div className="layout-search-dropdown__hint" role="status">
                Sem resultados para o seu perfil ou para este termo.
              </div>
            ) : (
              <ul className="layout-search-dropdown__list" role="presentation">
                {resultados.map((r) => (
                  <li key={r.key} role="presentation">
                    <button
                      type="button"
                      role="option"
                      className="layout-search-hit"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => aoEscolher(r)}
                    >
                      <span className="layout-search-hit__badge">{ETIQUETA_TIPO[r.tipo]}</span>
                      <span className="layout-search-hit__body">
                        <span className="layout-search-hit__titulo">{r.titulo}</span>
                        <span className="layout-search-hit__sub">{r.subtitulo}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
