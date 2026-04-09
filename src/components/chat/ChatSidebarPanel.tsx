import { ChatAvatar } from './ChatAvatar'
import type { ChatConversaLista, ChatUsuarioLista } from '../../types/chat'
import { formatarHoraCurta, formatarPreviewLista } from '../../lib/chat'

type Props = {
  meuId: string
  tab: 'conversas' | 'pessoas'
  onTab: (t: 'conversas' | 'pessoas') => void
  busca: string
  onBusca: (v: string) => void
  conversas: ChatConversaLista[]
  usuariosFiltrados: ChatUsuarioLista[]
  /** Total carregado (após abrir «Pessoas» ou carga inicial). */
  totalUsuariosAtivos: number
  usuariosPorId: Map<string, ChatUsuarioLista>
  onlineIds: Set<string>
  conversaSelecionadaId: string | null
  onSelectConversa: (id: string) => void
  onStartComUsuario: (userId: string) => void
  carregandoLista: boolean
}

export function ChatSidebarPanel({
  meuId,
  tab,
  onTab,
  busca,
  onBusca,
  conversas,
  usuariosFiltrados,
  totalUsuariosAtivos,
  usuariosPorId,
  onlineIds,
  conversaSelecionadaId,
  onSelectConversa,
  onStartComUsuario,
  carregandoLista,
}: Props) {
  return (
    <aside className="chat-interno-sidebar" aria-label="Conversas e contactos">
      <div className="chat-interno-sidebar__tabs">
        <button
          type="button"
          className={tab === 'conversas' ? 'chat-interno-tab chat-interno-tab--on' : 'chat-interno-tab'}
          onClick={() => onTab('conversas')}
        >
          Conversas
        </button>
        <button
          type="button"
          className={tab === 'pessoas' ? 'chat-interno-tab chat-interno-tab--on' : 'chat-interno-tab'}
          onClick={() => onTab('pessoas')}
        >
          Pessoas
        </button>
      </div>

      <div className="chat-interno-sidebar__search">
        <input
          type="search"
          className="chat-interno-input"
          placeholder={tab === 'conversas' ? 'Filtrar por nome…' : 'Buscar por nome, e-mail ou cargo…'}
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          aria-label={tab === 'conversas' ? 'Filtrar conversas' : 'Buscar utilizador'}
        />
        {tab === 'pessoas' && !carregandoLista && totalUsuariosAtivos > 0 ? (
          <p className="chat-interno-sidebar__hint">
            {totalUsuariosAtivos} utilizador{totalUsuariosAtivos === 1 ? '' : 'es'} ativo
            {totalUsuariosAtivos === 1 ? '' : 's'} · toque para abrir a conversa
          </p>
        ) : null}
      </div>

      <div className="chat-interno-sidebar__list">
        {carregandoLista ? (
          <div className="chat-interno-muted">
            {tab === 'pessoas' ? 'A carregar utilizadores ativos…' : 'A carregar…'}
          </div>
        ) : tab === 'conversas' ? (
          conversas.length === 0 ? (
            <div className="chat-interno-muted">Nenhuma conversa ainda. Abra um contacto em «Pessoas».</div>
          ) : (
            conversas.map((c) => {
              const u = usuariosPorId.get(c.outro_id)
              const nome = u?.nome || u?.email || 'Utilizador'
              const preview = formatarPreviewLista(c.ultima_preview, c.ultima_remetente_id, meuId)
              const on = onlineIds.has(c.outro_id)
              const active = conversaSelecionadaId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  className={
                    active ? 'chat-interno-row chat-interno-row--active' : 'chat-interno-row'
                  }
                  onClick={() => onSelectConversa(c.id)}
                >
                  <ChatAvatar nome={nome} fotoUrl={u?.foto_url} size={44} />
                  <div className="chat-interno-row__body">
                    <div className="chat-interno-row__top">
                      <span className="chat-interno-row__nome">{nome}</span>
                      <span className="chat-interno-row__hora">{formatarHoraCurta(c.ultima_em)}</span>
                    </div>
                    <div className="chat-interno-row__bottom">
                      <span className="chat-interno-row__preview">{preview}</span>
                      {c.unread > 0 ? (
                        <span className="chat-interno-badge">{c.unread > 99 ? '99+' : c.unread}</span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={on ? 'chat-interno-dot chat-interno-dot--on' : 'chat-interno-dot'}
                    title={on ? 'Online' : 'Offline'}
                    aria-hidden
                  />
                </button>
              )
            })
          )
        ) : usuariosFiltrados.length === 0 ? (
          <div className="chat-interno-muted">
            {totalUsuariosAtivos === 0
              ? 'Não há outros utilizadores ativos no sistema.'
              : busca.trim()
                ? 'Nenhum resultado para esta busca.'
                : 'Nenhum utilizador na lista.'}
          </div>
        ) : (
          usuariosFiltrados.map((u) => {
            const on = onlineIds.has(u.id)
            const rotulo = (u.nome || '').trim() || u.email || 'Utilizador'
            return (
              <button
                key={u.id}
                type="button"
                className="chat-interno-row"
                onClick={() => onStartComUsuario(u.id)}
              >
                <ChatAvatar nome={rotulo} fotoUrl={u.foto_url} size={44} />
                <div className="chat-interno-row__body">
                  <div className="chat-interno-row__top">
                    <span className="chat-interno-row__nome">{rotulo}</span>
                    <span className="chat-interno-row__cargo">{u.cargo || '—'}</span>
                  </div>
                  <div className="chat-interno-row__email">{u.email || '—'}</div>
                </div>
                <span
                  className={on ? 'chat-interno-dot chat-interno-dot--on' : 'chat-interno-dot'}
                  title={on ? 'Online' : 'Offline'}
                  aria-hidden
                />
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}
