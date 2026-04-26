import type { ChangeEvent } from 'react'

export type ComprovanteFotoSlotProps = {
  titulo: string
  subtitulo?: string
  url: string | null
  nomeArquivo: string | null
  conferida: boolean
  observacaoConferencia: string
  disabled?: boolean
  onPick: (file: File) => void
  onRemove: () => void
  onToggleConferida: (v: boolean) => void
  onObservacaoConferencia: (v: string) => void
}

export function ComprovanteFotoSlot({
  titulo,
  subtitulo,
  url,
  nomeArquivo,
  conferida,
  observacaoConferencia,
  disabled,
  onPick,
  onRemove,
  onToggleConferida,
  onObservacaoConferencia,
}: ComprovanteFotoSlotProps) {
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onPick(f)
  }

  return (
    <div className="cd-foto-slot">
      <div className="cd-foto-slot__head">
        <div>
          <div className="cd-foto-slot__titulo">{titulo}</div>
          {subtitulo ? <div className="cd-foto-slot__sub">{subtitulo}</div> : null}
        </div>
        {conferida ? <span className="cd-foto-slot__badge">Conferido</span> : null}
      </div>
      <div className="cd-foto-slot__body">
        {url ? (
          <div className="cd-foto-slot__preview-wrap">
            <img src={url} alt="" className="cd-foto-slot__preview" />
          </div>
        ) : (
          <div className="cd-foto-slot__empty">Nenhuma imagem</div>
        )}
        <div className="cd-foto-slot__actions no-print">
          <label className="cd-btn cd-btn--secondary">
            {url ? 'Substituir' : 'Enviar foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="cd-visually-hidden"
              disabled={disabled}
              onChange={onChange}
            />
          </label>
          {url ? (
            <button
              type="button"
              className="cd-btn cd-btn--ghost"
              disabled={disabled}
              onClick={onRemove}
            >
              Remover
            </button>
          ) : null}
        </div>
        {nomeArquivo ? (
          <div className="cd-foto-slot__nome">
            <span className="cd-foto-slot__nome-label">Ficheiro</span> {nomeArquivo}
          </div>
        ) : null}
        <label className="cd-check no-print">
          <input
            type="checkbox"
            checked={conferida}
            disabled={disabled}
            onChange={(e) => onToggleConferida(e.target.checked)}
          />
          <span>Marcar como conferido manualmente</span>
        </label>
        <textarea
          className="cd-input cd-input--area no-print"
          rows={2}
          placeholder="Observações da conferência (opcional)"
          value={observacaoConferencia}
          disabled={disabled}
          onChange={(e) => onObservacaoConferencia(e.target.value)}
        />
      </div>
    </div>
  )
}
