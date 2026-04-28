/**
 * Limpeza completa de clientes + seed de dados fictícios.
 *
 * 1) Remove dados operacionais que referenciam clientes (mesma ordem que reset-coletas-operacao).
 * 2) Apaga TODAS as linhas de public.clientes.
 * 3) Insere 200 clientes: 150 Ativos + 50 Inativos.
 *    Geografia: 190 em SP (municípios variados) + 10 em MG e RJ (5 + 5).
 *    (Pedido original 140 em SP + 10 fora soma 150; os 50 inativos extra ficam em SP → 190 SP + 10 fora.)
 *
 * Uso:
 *   npx tsx scripts/reset-clientes-e-seed-demo-200.ts --yes
 *   npm run reset:clientes-e-seed-200
 *
 * Requer: VITE_SUPABASE_URL (ou SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

function carregarEnvArquivo() {
  const p = resolve(process.cwd(), '.env')
  if (!existsSync(p)) return
  const raw = readFileSync(p, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (v.startsWith('<') && v.endsWith('>') && v.length > 2) {
      v = v.slice(1, -1).trim()
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function normalizarChaveSupabase(key: string): string {
  let k = key.trim()
  if (k.startsWith('<') && k.endsWith('>') && k.length > 2) {
    k = k.slice(1, -1).trim()
  }
  return k
}

const TOTAL = 200
const ATIVOS = 150
const N_SP = 190
const PREFIXO = 'Cliente Demo'

const CIDADES_SP = [
  'São Paulo',
  'Campinas',
  'Santos',
  'Ribeirão Preto',
  'Sorocaba',
  'São José dos Campos',
  'Osasco',
  'Santo André',
  'Mauá',
  'Diadema',
  'Guarulhos',
  'São Bernardo do Campo',
  'Mogi das Cruzes',
  'Piracicaba',
  'Bauru',
  'Jundiaí',
  'Franca',
  'Barueri',
  'Taubaté',
  'Limeira',
  'Suzano',
  'Taboão da Serra',
  'Embu das Artes',
  'Marília',
  'Presidente Prudente',
  'Araçatuba',
  'Hortolândia',
  'Americana',
  'Indaiatuba',
  'Catanduva',
  'Rio Claro',
  'Itapevi',
  'Cotia',
  'Itaquaquecetuba',
  'Praia Grande',
  'São Vicente',
  'Bragança Paulista',
  'Araraquara',
  'Jacareí',
  'Registro',
] as const

const BAIRROS_SP = [
  'Centro',
  'Jardins',
  'Vila Mariana',
  'Pinheiros',
  'Tatuapé',
  'Mooca',
  'Santana',
  'Lapa',
  'Butantã',
  'Ipiranga',
] as const

/** 5 MG + 5 RJ */
const FORA_SP: { uf: string; cidade: string; ddd: string }[] = [
  { uf: 'MG', cidade: 'Belo Horizonte', ddd: '31' },
  { uf: 'MG', cidade: 'Uberlândia', ddd: '34' },
  { uf: 'MG', cidade: 'Contagem', ddd: '31' },
  { uf: 'MG', cidade: 'Juiz de Fora', ddd: '32' },
  { uf: 'MG', cidade: 'Betim', ddd: '31' },
  { uf: 'RJ', cidade: 'Rio de Janeiro', ddd: '21' },
  { uf: 'RJ', cidade: 'Niterói', ddd: '21' },
  { uf: 'RJ', cidade: 'Duque de Caxias', ddd: '21' },
  { uf: 'RJ', cidade: 'Nova Iguaçu', ddd: '21' },
  { uf: 'RJ', cidade: 'Campos dos Goytacazes', ddd: '22' },
]

const RESIDUO_PERFIL = [
  {
    tipo: 'Resíduos classe II — não perigosos',
    classificacao: 'Classe II',
    unidade_medida: 'kg',
    frequencia_coleta: 'Semanal',
  },
  {
    tipo: 'Resíduos de embalagens em geral',
    classificacao: 'Classe II',
    unidade_medida: 'kg',
    frequencia_coleta: 'Quinzenal',
  },
  {
    tipo: 'Papel e papelão',
    classificacao: 'Classe II',
    unidade_medida: 'kg',
    frequencia_coleta: 'Semanal',
  },
  {
    tipo: 'Plásticos',
    classificacao: 'Classe II',
    unidade_medida: 'kg',
    frequencia_coleta: 'Mensal',
  },
  {
    tipo: 'Vidro',
    classificacao: 'Classe II',
    unidade_medida: 'kg',
    frequencia_coleta: 'Quinzenal',
  },
] as const

const DDDS_SP = ['11', '12', '13', '14', '15', '16', '17', '18', '19']

function cnpjUnico(seq: number): string {
  const base = 88_000_000_000_000 + seq
  return String(base).padStart(14, '0')
}

function telefone(ddd: string, n: number): string {
  const p1 = String(7400 + (n % 2600)).padStart(4, '0')
  const p2 = String(1000 + (n % 9000)).padStart(4, '0')
  return `(${ddd}) 9${p1}-${p2}`
}

function cepParaUf(uf: string, n: number): string {
  const prefix: Record<string, string> = {
    SP: '01',
    MG: '30',
    RJ: '20',
  }
  const pre = prefix[uf] ?? '01'
  const mid = String((n * 17) % 900).padStart(3, '0')
  const suf = String(n % 1000).padStart(3, '0')
  return `${pre}${mid}-${suf}`
}

function montarLinha(
  i: number,
  opts: { uf: string; cidade: string; ddd: string; status: string }
): Record<string, unknown> {
  const n = i + 1
  const { uf, cidade, ddd, status } = opts
  const perfil = RESIDUO_PERFIL[i % RESIDUO_PERFIL.length]
  const bairro =
    uf === 'SP'
      ? BAIRROS_SP[i % BAIRROS_SP.length]
      : uf === 'MG'
        ? ['Savassi', 'Funcionários', 'Centro', 'Pampulha', 'Barreiro'][i % 5]
        : ['Botafogo', 'Tijuca', 'Centro', 'Ipanema', 'Copacabana'][i % 5]

  const nome = `${PREFIXO} ${String(n).padStart(3, '0')} — ${cidade}/${uf}`
  const razao = `${PREFIXO} ${String(n).padStart(3, '0')} LTDA`
  const cnpj = cnpjUnico(n)
  const cep = cepParaUf(uf, n)
  const rua = `Rua ${uf === 'SP' ? 'dos Ipês' : 'das Palmeiras'} ${n}`
  const numero = String(100 + (n % 920))
  const enderecoLinha = `${rua}, ${numero}, ${bairro} — ${cidade}/${uf}, CEP ${cep}`

  return {
    nome,
    razao_social: razao,
    cnpj,
    cep,
    rua,
    numero,
    complemento: n % 7 === 0 ? `Bloco ${(n % 3) + 1}` : null,
    bairro,
    cidade,
    estado: uf,
    endereco_coleta: `Coleta: ${enderecoLinha}`,
    endereco_faturamento: `Faturamento: ${enderecoLinha}`,
    email_nf: `nf.demo.${n}@mail-seed.invalid`,
    responsavel_nome: `Responsável ${n} — ${cidade}`,
    telefone: telefone(ddd, n),
    email: `contato.demo.${n}@mail-seed.invalid`,
    tipo_residuo: perfil.tipo,
    classificacao: perfil.classificacao,
    unidade_medida: perfil.unidade_medida,
    frequencia_coleta: perfil.frequencia_coleta,
    licenca_numero: `LIC-DEMO-${String(n).padStart(4, '0')}`,
    validade: '2031-06-30',
    status,
  }
}

function montarTodasLinhas(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []

  for (let k = 0; k < N_SP; k++) {
    const cidade = CIDADES_SP[k % CIDADES_SP.length]
    const ddd = DDDS_SP[k % DDDS_SP.length]
    const status = k < ATIVOS ? 'Ativo' : 'Inativo'
    rows.push(montarLinha(k, { uf: 'SP', cidade, ddd, status }))
  }

  for (let j = 0; j < FORA_SP.length; j++) {
    const slot = N_SP + j
    const { uf, cidade, ddd } = FORA_SP[j]
    const status = slot < ATIVOS ? 'Ativo' : 'Inativo'
    rows.push(montarLinha(slot, { uf, cidade, ddd, status }))
  }

  if (rows.length !== TOTAL) {
    throw new Error(`Bug: esperado ${TOTAL} linhas, obtido ${rows.length}`)
  }

  return rows
}

async function deleteAllRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
  idColumn = 'id'
) {
  for (;;) {
    const { data, error } = await supabase.from(table).select(idColumn).limit(400)
    if (error) {
      console.error(`Erro ao listar ${table}:`, error.message)
      throw error
    }
    const rows = data as { id?: string }[]
    if (!rows?.length) break
    const ids = rows.map((r) => r[idColumn as keyof typeof r]).filter(Boolean) as string[]
    const { error: delErr } = await supabase.from(table).delete().in(idColumn, ids)
    if (delErr) {
      console.error(`Erro ao apagar ${table}:`, delErr.message)
      throw delErr
    }
    console.log(`  … ${table}: −${ids.length} (lote)`)
  }
}

carregarEnvArquivo()

async function main() {
  const yes = process.argv.includes('--yes') || process.argv.includes('-y')
  if (!yes) {
    console.error('Confirme com: npx tsx scripts/reset-clientes-e-seed-demo-200.ts --yes')
    process.exit(1)
  }

  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const keyRaw = process.env.SUPABASE_SERVICE_ROLE_KEY
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : ''

  if (!url || !key) {
    console.error(
      'Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env'
    )
    process.exit(1)
  }

  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    console.error('Use o JWT service_role (eyJ...) em Project Settings → API.')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  console.log('1) Limpar dados operacionais (programações, coletas, …)…\n')

  const { error: errNull } = await supabase
    .from('programacoes')
    .update({ coleta_id: null })
    .not('coleta_id', 'is', null)
  if (errNull) {
    console.warn('Aviso ao limpar coleta_id em programações:', errNull.message)
  }

  const tabelasFluxoColeta = [
    'controle_massa',
    'checklist_transporte',
    'conferencia_transporte',
    'tickets_operacionais',
    'conferencia_operacional',
    'aprovacoes_diretoria',
    'faturamento_registros',
    'financeiro_documentos',
    'nf_envios_log',
    'financeiro_auditoria',
  ] as const

  for (const t of tabelasFluxoColeta) {
    try {
      await deleteAllRows(supabase, t)
    } catch {
      console.log(`  (${t}: ignorar se não existir)`)
    }
  }

  await deleteAllRows(supabase, 'coletas')
  await deleteAllRows(supabase, 'mtrs')
  await deleteAllRows(supabase, 'programacoes')

  console.log('\n2) Apagar todos os clientes…\n')
  await deleteAllRows(supabase, 'clientes')

  console.log('\n3) Inserir 200 clientes (150 Ativos, 50 Inativos)…\n')
  const linhas = montarTodasLinhas()
  const chunk = 50
  let inseridos = 0
  for (let o = 0; o < linhas.length; o += chunk) {
    const slice = linhas.slice(o, o + chunk)
    const { error } = await supabase.from('clientes').insert(slice)
    if (error) {
      console.error('Erro ao inserir clientes:', error.message, error.details, error.hint)
      process.exit(1)
    }
    inseridos += slice.length
    console.log(`  … inseridos ${inseridos}/${linhas.length}`)
  }

  console.log(
    `\nConcluído: ${ATIVOS} Ativos + ${TOTAL - ATIVOS} Inativos; ${N_SP} em SP + ${FORA_SP.length} em MG/RJ.`
  )
  console.log('Atualize a página /clientes no localhost (mesmo projeto Supabase do .env).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
