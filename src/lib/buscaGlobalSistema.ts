import { supabase } from './supabase'
import { sanitizeIlikePattern } from './sanitizeIlike'
import {
  cargoPodeAcessarRotaMenu,
  usuarioPodeAcessarRota,
  type UsuarioComPaginas,
} from './paginasSistema'

export type ResultadoBuscaGlobal = {
  key: string
  tipo: 'cliente' | 'mtr' | 'ticket'
  titulo: string
  subtitulo: string
  to: string
}

const MIN_CHARS = 2
const LIMIT_EACH = 8

function podePesquisarNaRota(usuario: UsuarioComPaginas, path: string): boolean {
  return usuarioPodeAcessarRota(usuario, path) && cargoPodeAcessarRotaMenu(usuario.cargo, path)
}

/** Preferir o hub de pesagem; se o perfil só tiver a página de ticket, usa essa rota. */
export function pathDestinoPesagemOuTicket(usuario: UsuarioComPaginas): string | null {
  if (podePesquisarNaRota(usuario, '/controle-massa')) return '/controle-massa'
  if (podePesquisarNaRota(usuario, '/ticket-operacional')) return '/ticket-operacional'
  return null
}

function orFiltroClientesCore(sanitizado: string): string {
  return `nome.ilike.%${sanitizado}%,razao_social.ilike.%${sanitizado}%,cnpj.ilike.%${sanitizado}%,cidade.ilike.%${sanitizado}%`
}

async function buscarClientes(
  sanitizado: string,
  textoOriginal: string
): Promise<ResultadoBuscaGlobal[]> {
  const orFilter = orFiltroClientesCore(sanitizado)
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nome, razao_social, cnpj')
    .or(orFilter)
    .order('nome', { ascending: true })
    .limit(LIMIT_EACH)

  if (error || !data?.length) return []

  const q = encodeURIComponent(textoOriginal.trim())
  return data.map((row) => {
    const nome = (row.nome ?? '').trim()
    const razao = (row.razao_social ?? '').trim()
    const titulo = nome || razao || 'Cliente'
    const partes: string[] = []
    if (razao && razao !== nome) partes.push(razao)
    if (row.cnpj) partes.push(String(row.cnpj))
    return {
      key: `c-${row.id}`,
      tipo: 'cliente' as const,
      titulo,
      subtitulo: partes.length ? partes.join(' · ') : 'Abrir cadastro de clientes',
      to: `/clientes?busca=${q}`,
    }
  })
}

async function buscarMtrs(sanitizado: string): Promise<ResultadoBuscaGlobal[]> {
  const orFilter = `numero.ilike.%${sanitizado}%,cliente.ilike.%${sanitizado}%,gerador.ilike.%${sanitizado}%`
  const { data, error } = await supabase
    .from('mtrs')
    .select('id, numero, cliente')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(LIMIT_EACH)

  if (error || !data?.length) return []

  return data.map((row) => ({
    key: `m-${row.id}`,
    tipo: 'mtr' as const,
    titulo: (row.numero ?? '').trim() || 'MTR',
    subtitulo: (row.cliente ?? '').trim() || 'Abrir MTR',
    to: `/mtr?mtr=${encodeURIComponent(row.id)}`,
  }))
}

async function buscarTicketsEColetas(
  sanitizado: string,
  textoOriginal: string,
  basePath: string
): Promise<ResultadoBuscaGlobal[]> {
  const out: ResultadoBuscaGlobal[] = []
  const vistoColeta = new Set<string>()
  const qTrim = textoOriginal.trim()
  const rotuloDestino =
    basePath === '/ticket-operacional' ? 'Ticket operacional' : 'Pesagem e Ticket'

  const { data: tik, error: eTik } = await supabase
    .from('tickets_operacionais')
    .select('coleta_id, numero')
    .ilike('numero', `%${sanitizado}%`)
    .limit(LIMIT_EACH)

  if (!eTik && tik?.length) {
    for (const row of tik) {
      const cid = row.coleta_id != null ? String(row.coleta_id).trim() : ''
      if (!cid || vistoColeta.has(cid)) continue
      vistoColeta.add(cid)
      const num = (row.numero ?? '').trim()
      out.push({
        key: `t-${cid}`,
        tipo: 'ticket',
        titulo: num ? `Ticket ${num}` : 'Ticket operacional',
        subtitulo: rotuloDestino,
        to: `${basePath}?coleta=${encodeURIComponent(cid)}`,
      })
    }
  }

  const soDigitos = /^[0-9]+$/.test(qTrim)
  if (soDigitos) {
    const n = Number(qTrim)
    if (!Number.isNaN(n)) {
      const { data: colNum, error: eNum } = await supabase
        .from('coletas')
        .select('id, numero_coleta, cliente')
        .eq('numero_coleta', n)
        .limit(LIMIT_EACH)

      if (!eNum && colNum?.length) {
        for (const row of colNum) {
          const cid = String(row.id)
          if (vistoColeta.has(cid)) continue
          vistoColeta.add(cid)
          const nc = row.numero_coleta != null ? String(row.numero_coleta) : ''
          out.push({
            key: `co-${cid}`,
            tipo: 'ticket',
            titulo: nc ? `Coleta nº ${nc}` : 'Coleta',
            subtitulo: (row.cliente ?? '').trim() || rotuloDestino,
            to: `${basePath}?coleta=${encodeURIComponent(cid)}`,
          })
        }
      }
    }
  }

  const { data: colCli, error: eCli } = await supabase
    .from('coletas')
    .select('id, numero_coleta, cliente')
    .ilike('cliente', `%${sanitizado}%`)
    .order('id', { ascending: false })
    .limit(Math.max(1, LIMIT_EACH - out.length))

  if (!eCli && colCli?.length) {
    for (const row of colCli) {
      const cid = String(row.id)
      if (vistoColeta.has(cid)) continue
      vistoColeta.add(cid)
      const nc = row.numero_coleta != null ? String(row.numero_coleta) : ''
      out.push({
        key: `cc-${cid}`,
        tipo: 'ticket',
        titulo: nc ? `Coleta nº ${nc}` : 'Coleta',
        subtitulo: (row.cliente ?? '').trim() || rotuloDestino,
        to: `${basePath}?coleta=${encodeURIComponent(cid)}`,
      })
    }
  }

  return out.slice(0, LIMIT_EACH)
}

/**
 * Pesquisa unificada: clientes, MTR e tickets/coletas.
 * Filtra por página com as mesmas regras do menu (`usuarioPodeAcessarRota` + `cargoPodeAcessarRotaMenu`).
 */
export async function buscarGlobalSistema(
  usuario: UsuarioComPaginas,
  textoBruto: string
): Promise<ResultadoBuscaGlobal[]> {
  const q = textoBruto.trim()
  if (q.length < MIN_CHARS) return []

  const sanitizado = sanitizeIlikePattern(q)
  const blocos: ResultadoBuscaGlobal[][] = []

  if (podePesquisarNaRota(usuario, '/clientes')) {
    blocos.push(await buscarClientes(sanitizado, q))
  }
  if (podePesquisarNaRota(usuario, '/mtr')) {
    blocos.push(await buscarMtrs(sanitizado))
  }
  const pathPesagem = pathDestinoPesagemOuTicket(usuario)
  if (pathPesagem) {
    blocos.push(await buscarTicketsEColetas(sanitizado, q, pathPesagem))
  }

  const ordemTipo = { cliente: 0, mtr: 1, ticket: 2 }
  return blocos
    .flat()
    .sort((a, b) => ordemTipo[a.tipo] - ordemTipo[b.tipo] || a.titulo.localeCompare(b.titulo, 'pt-BR'))
}

export const BUSCA_GLOBAL_MIN_CHARS = MIN_CHARS
