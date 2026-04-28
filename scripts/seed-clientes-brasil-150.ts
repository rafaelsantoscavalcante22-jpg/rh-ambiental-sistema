/**
 * Insere 100 clientes Ativos e 50 Inativos (150 no total), distribuídos por todas as UFs.
 *
 * Uso:
 *   npx tsx scripts/seed-clientes-brasil-150.ts
 *
 * Requer: VITE_SUPABASE_URL (ou SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Nomes começam com "Seed Brasil" para facilitar identificação ou limpeza manual.
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

/** 27 UFs (ordem alfabética da sigla) + capital para cidade */
const UF_CAPITAL: { uf: string; cidade: string }[] = [
  { uf: 'AC', cidade: 'Rio Branco' },
  { uf: 'AL', cidade: 'Maceió' },
  { uf: 'AM', cidade: 'Manaus' },
  { uf: 'AP', cidade: 'Macapá' },
  { uf: 'BA', cidade: 'Salvador' },
  { uf: 'CE', cidade: 'Fortaleza' },
  { uf: 'DF', cidade: 'Brasília' },
  { uf: 'ES', cidade: 'Vitória' },
  { uf: 'GO', cidade: 'Goiânia' },
  { uf: 'MA', cidade: 'São Luís' },
  { uf: 'MG', cidade: 'Belo Horizonte' },
  { uf: 'MS', cidade: 'Campo Grande' },
  { uf: 'MT', cidade: 'Cuiabá' },
  { uf: 'PA', cidade: 'Belém' },
  { uf: 'PB', cidade: 'João Pessoa' },
  { uf: 'PE', cidade: 'Recife' },
  { uf: 'PI', cidade: 'Teresina' },
  { uf: 'PR', cidade: 'Curitiba' },
  { uf: 'RJ', cidade: 'Rio de Janeiro' },
  { uf: 'RN', cidade: 'Natal' },
  { uf: 'RO', cidade: 'Porto Velho' },
  { uf: 'RR', cidade: 'Boa Vista' },
  { uf: 'RS', cidade: 'Porto Alegre' },
  { uf: 'SC', cidade: 'Florianópolis' },
  { uf: 'SE', cidade: 'Aracaju' },
  { uf: 'SP', cidade: 'São Paulo' },
  { uf: 'TO', cidade: 'Palmas' },
]

const TOTAL = 150
const ATIVOS = 100
const PREFIXO_NOME = 'Seed Brasil'

function cnpjUnico(seq: number): string {
  const base = 90_000_000_000_000 + seq
  return String(base).padStart(14, '0')
}

function montarLinhas() {
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < TOTAL; i++) {
    const { uf, cidade } = UF_CAPITAL[i % UF_CAPITAL.length]
    const n = i + 1
    const status = i < ATIVOS ? 'Ativo' : 'Inativo'
    const nome = `${PREFIXO_NOME} ${String(n).padStart(3, '0')} — ${cidade}/${uf}`
    const razao = `${PREFIXO_NOME} ${String(n).padStart(3, '0')} LTDA`
    const cnpj = cnpjUnico(n)
    const cep = `${String(10000 + (n % 90000)).padStart(5, '0')}-${String(n % 1000).padStart(3, '0')}`
    const rua = `Rua Exemplo ${n}`
    const enderecoLinha = `${rua}, ${100 + (n % 900)}, ${bairroPorUf(uf)} — ${cidade}/${uf}, CEP ${cep}`

    rows.push({
      nome,
      razao_social: razao,
      cnpj,
      cep,
      rua,
      numero: String(100 + (n % 900)),
      complemento: n % 5 === 0 ? 'Sala 01' : null,
      bairro: bairroPorUf(uf),
      cidade,
      estado: uf,
      endereco_coleta: enderecoLinha,
      endereco_faturamento: enderecoLinha,
      email_nf: `nf.seed.${n}@exemplo-seed.invalid`,
      responsavel_nome: `Responsável Seed ${n}`,
      telefone: `(11) 9${String(1000 + (n % 9000)).padStart(4, '0')}-${String(1000 + (n % 9000)).padStart(4, '0')}`,
      email: `cliente.seed.${n}@exemplo-seed.invalid`,
      tipo_residuo: 'Resíduos classe II — não perigosos',
      classificacao: 'Classe II',
      unidade_medida: 'kg',
      frequencia_coleta: 'Semanal',
      licenca_numero: `LIC-SEED-${String(n).padStart(4, '0')}`,
      validade: '2030-12-31',
      status,
    })
  }
  return rows
}

function bairroPorUf(uf: string): string {
  const map: Record<string, string> = {
    AC: 'Centro',
    AL: 'Ponta Verde',
    AM: 'Adrianópolis',
    AP: 'Central',
    BA: 'Caminho das Árvores',
    CE: 'Aldeota',
    DF: 'Asa Sul',
    ES: 'Praia do Canto',
    GO: 'Setor Bueno',
    MA: 'Calhau',
    MG: 'Savassi',
    MS: 'Centro',
    MT: 'Boa Esperança',
    PA: 'Umarizal',
    PB: 'Tambaú',
    PE: 'Boa Viagem',
    PI: 'Ininga',
    PR: 'Batel',
    RJ: 'Botafogo',
    RN: 'Lagoa Nova',
    RO: 'Ouro Preto',
    RR: 'Centro',
    RS: 'Moinhos de Vento',
    SC: 'Centro',
    SE: 'Jardins',
    SP: 'Pinheiros',
    TO: 'Plano Diretor Sul',
  }
  return map[uf] ?? 'Centro'
}

carregarEnvArquivo()

async function main() {
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
    console.error(
      'Use o JWT service_role (eyJ...) em Project Settings → API, não sb_secret.'
    )
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const linhas = montarLinhas()

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
    console.log(`Inseridos ${inseridos}/${linhas.length}…`)
  }

  console.log(
    `Concluído: ${ATIVOS} Ativos + ${TOTAL - ATIVOS} Inativos em ${UF_CAPITAL.length} UFs (round-robin).`
  )
}

main()
