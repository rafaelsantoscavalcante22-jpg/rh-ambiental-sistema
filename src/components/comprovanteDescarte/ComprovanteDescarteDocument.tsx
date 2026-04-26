import type { ComprovanteDescarteRow } from '../../lib/comprovantesDescarteTypes'
import {
  STATUS_COMPROVANTE_LABEL,
  formatarPesoExibicao,
} from '../../lib/comprovantesDescarteUtils'
import { BRAND_LOGO_MARK } from '../../lib/brandLogo'

function DocField({ label, value }: { label: string; value: string }) {
  return (
    <div className="cd-doc-field">
      <span className="cd-doc-field__label">{label}</span>
      <span className="cd-doc-field__value">{value || '—'}</span>
    </div>
  )
}

function AssinaturaBloco({
  titulo,
  nome,
  data,
}: {
  titulo: string
  nome: string
  data: string
}) {
  return (
    <div className="cd-doc-assinatura">
      <div className="cd-doc-assinatura__titulo">{titulo}</div>
      <div className="cd-doc-assinatura__linha" />
      <div className="cd-doc-assinatura__meta">
        <span>{nome || '—'}</span>
        <span>{data || '—'}</span>
      </div>
    </div>
  )
}

function formatarDataBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

function formatarDataHoraBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export type ComprovanteDescarteDocumentProps = {
  row: ComprovanteDescarteRow
  emitidoEm?: Date
  mostrarStatus?: boolean
}

export function ComprovanteDescarteDocument({
  row,
  emitidoEm = new Date(),
  mostrarStatus = true,
}: ComprovanteDescarteDocumentProps) {
  const codigo = (row.codigo_remessa ?? '').trim() || '—'
  const extras = row.fotos_extras ?? []

  return (
    <div className="cd-doc" data-comprovante-document>
      <header className="cd-doc__header">
        <div className="cd-doc__header-shell">
          <div className="cd-doc__header-top">
            <div className="cd-doc__brand-cluster">
              <img
                src={BRAND_LOGO_MARK}
                alt=""
                className="cd-doc__logo cd-doc__logo--marca"
                loading="eager"
                decoding="async"
              />
              <div className="cd-doc__brand-copy">
                <p className="cd-doc__brand-tagline">Gestão Ambiental de Resíduos</p>
              </div>
            </div>
            <aside className="cd-doc__tracking-panel" aria-label="Identificação da remessa">
              <div className="cd-doc__tracking-barcode cd-doc__tracking-barcode--prime" aria-hidden>
                <div className="cd-doc__barcode-inner" />
              </div>
              <div className="cd-doc__tracking-codigo">
                <span className="cd-doc__remessa-label">Código da remessa:</span>
                <span className="cd-doc__remessa-valor">{codigo}</span>
              </div>
            </aside>
          </div>
          <div className="cd-doc__header-docline">
            <h1 className="cd-doc__titulo-principal">COMPROVANTE DE DESCARTE</h1>
            {mostrarStatus ? (
              <div className="cd-doc__status-wrap">
                <span className="cd-doc__status-pill">
                  {STATUS_COMPROVANTE_LABEL[row.status_documento]}
                  {row.faturamento_liberado ? ' · Liberado p/ faturamento' : ''}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="cd-doc__secao">
        <h2 className="cd-doc__secao-titulo">1. DESCRIÇÃO DOS RESÍDUOS</h2>
        <div className="cd-doc__grid cd-doc__grid--2">
          <DocField label="Data da remessa" value={formatarDataBr(row.data_remessa)} />
          <DocField label="CADRI" value={row.cadri ?? ''} />
          <DocField label="Tipo e origem do efluente" value={row.tipo_efluente ?? ''} />
          <DocField label="Linha de tratamento" value={row.linha_tratamento ?? ''} />
          <DocField label="Número MTR" value={row.numero_mtr ?? ''} />
          <DocField label="Volume" value={row.volume ?? ''} />
          <DocField label="Acondicionamento" value={row.acondicionamento ?? ''} />
        </div>
      </section>

      <section className="cd-doc__secao cd-doc__secao--duo">
        <div className="cd-doc__secao-main cd-doc__secao-main--duo">
          <h2 className="cd-doc__secao-titulo">2. GERADOR</h2>
          <div className="cd-doc__grid cd-doc__grid--1">
            <DocField label="Razão social" value={row.gerador_razao_social ?? ''} />
            <DocField label="Nome fantasia" value={row.gerador_nome_fantasia ?? ''} />
            <DocField label="Endereço" value={row.gerador_endereco ?? ''} />
            <DocField label="Responsável" value={row.gerador_responsavel ?? ''} />
            <DocField label="Telefone" value={row.gerador_telefone ?? ''} />
            <DocField label="Contrato" value={row.gerador_contrato ?? ''} />
          </div>
        </div>
        <aside className="cd-doc__aside-assinatura" aria-label="Assinatura gerador">
          <AssinaturaBloco
            titulo="Assinatura do responsável (gerador)"
            nome={row.gerador_responsavel ?? ''}
            data={formatarDataBr(row.data_remessa)}
          />
        </aside>
      </section>

      <section className="cd-doc__secao cd-doc__secao--duo">
        <div className="cd-doc__secao-main cd-doc__secao-main--duo">
          <h2 className="cd-doc__secao-titulo">3. TRANSPORTADOR</h2>
          <div className="cd-doc__grid cd-doc__grid--2">
            <DocField label="Razão social" value={row.transportador_razao_social ?? ''} />
            <DocField label="Telefone" value={row.transportador_telefone ?? ''} />
            <DocField label="Placa" value={row.placa ?? ''} />
            <DocField label="Motorista" value={row.motorista_nome ?? ''} />
            <DocField label="CNH" value={row.motorista_cnh ?? ''} />
          </div>
        </div>
        <aside className="cd-doc__aside-assinatura" aria-label="Assinatura transportador">
          <AssinaturaBloco
            titulo="Responsável pelo transporte"
            nome={row.transportador_responsavel_assinatura_nome ?? ''}
            data={formatarDataBr(row.transportador_responsavel_assinatura_data)}
          />
        </aside>
      </section>

      <section className="cd-doc__secao cd-doc__secao--duo">
        <div className="cd-doc__secao-main cd-doc__secao-main--duo">
          <h2 className="cd-doc__secao-titulo">4. DESTINATÁRIO</h2>
          <div className="cd-doc__grid cd-doc__grid--1">
            <DocField label="Razão social" value={row.destinatario_razao_social ?? ''} />
            <DocField label="Endereço" value={row.destinatario_endereco ?? ''} />
            <DocField label="Telefone" value={row.destinatario_telefone ?? ''} />
          </div>
        </div>
        <aside className="cd-doc__aside-assinatura" aria-label="Assinatura destinatário">
          <AssinaturaBloco
            titulo="Assinatura do responsável (destinatário)"
            nome={row.destinatario_responsavel_assinatura_nome ?? ''}
            data={formatarDataBr(row.destinatario_responsavel_assinatura_data)}
          />
        </aside>
      </section>

      <section className="cd-doc__secao">
        <h2 className="cd-doc__secao-titulo">5. PESAGEM — ENTRADA E SAÍDA</h2>
        <div className="cd-doc-pesagem">
          <div className="cd-doc-pesagem__col">
            <div className="cd-doc-pesagem__titulo">Entrada</div>
            <DocField label="Peso (kg)" value={formatarPesoExibicao(row.peso_entrada)} />
            <DocField label="Data/hora" value={formatarDataHoraBr(row.data_entrada)} />
          </div>
          <div className="cd-doc-pesagem__col">
            <div className="cd-doc-pesagem__titulo">Saída</div>
            <DocField label="Peso (kg)" value={formatarPesoExibicao(row.peso_saida)} />
            <DocField label="Data/hora" value={formatarDataHoraBr(row.data_saida)} />
          </div>
        </div>
        <div className="cd-doc-peso-liquido">
          <span className="cd-doc-peso-liquido__label">PESO LÍQUIDO</span>
          <span className="cd-doc-peso-liquido__valor">
            {formatarPesoExibicao(row.peso_liquido)} kg
          </span>
        </div>
      </section>

      <section className="cd-doc__secao cd-doc__secao--evidencias">
        <h2 className="cd-doc__secao-titulo">6. EVIDÊNCIAS FOTOGRÁFICAS</h2>
        <p className="cd-doc-evidencias-lead">
          Imagens da pesagem e da operação (balança / veículo). Inclua sempre entrada e saída quando
          existirem.
        </p>
        <div className="cd-doc-evidencias-grid">
          <figure className="cd-doc-foto cd-doc-foto--evidencia">
            <div className="cd-doc-foto__evidencia-label">Entrada — pesagem</div>
            {row.foto_entrada_url ? (
              <div className="cd-doc-foto__frame">
                <img
                  src={row.foto_entrada_url}
                  alt="Evidência entrada"
                  loading="eager"
                  decoding="async"
                />
              </div>
            ) : (
              <div className="cd-doc-foto__frame cd-doc-foto__frame--empty">Sem imagem</div>
            )}
            <figcaption>{row.foto_entrada_nome_arquivo ?? '—'}</figcaption>
          </figure>
          <figure className="cd-doc-foto cd-doc-foto--evidencia">
            <div className="cd-doc-foto__evidencia-label">Saída — pesagem</div>
            {row.foto_saida_url ? (
              <div className="cd-doc-foto__frame">
                <img
                  src={row.foto_saida_url}
                  alt="Evidência saída"
                  loading="eager"
                  decoding="async"
                />
              </div>
            ) : (
              <div className="cd-doc-foto__frame cd-doc-foto__frame--empty">Sem imagem</div>
            )}
            <figcaption>{row.foto_saida_nome_arquivo ?? '—'}</figcaption>
          </figure>
          {extras.map((ex, i) => (
            <figure key={`${ex.url}-${i}`} className="cd-doc-foto cd-doc-foto--evidencia">
              <div className="cd-doc-foto__evidencia-label">Complementar {i + 1}</div>
              <div className="cd-doc-foto__frame">
                <img src={ex.url} alt="" loading="eager" decoding="async" />
              </div>
              <figcaption>{ex.nome_arquivo}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {row.observacoes?.trim() ? (
        <section className="cd-doc__secao">
          <h2 className="cd-doc__secao-titulo">OBSERVAÇÕES</h2>
          <p className="cd-doc-obs">{row.observacoes.trim()}</p>
        </section>
      ) : null}

      <footer className="cd-doc__footer">
        <p>
          Comprovante emitido automaticamente pelo sistema RG Ambiental —{' '}
          {new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }).format(emitidoEm)}
        </p>
        <p className="cd-doc__footer-id">Identificador interno: {row.id}</p>
      </footer>
    </div>
  )
}
