/**
 * Insere 10 motoristas e 20 caminhões fictícios para demonstração.
 *
 * Uso:
 *   npx tsx scripts/seed-motoristas-caminhoes.ts
 *
 * Requer: VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Caminhões: upsert por placa (pode reexecutar sem duplicar placas).
 * Motoristas: insert simples (reexecutar cria linhas extras com os mesmos nomes).
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

carregarEnvArquivo()

const MOTORISTAS = [
  {
    nome: 'Carlos Eduardo Silva',
    cnh_numero: '04589234109',
    cnh_categoria: 'E',
    cnh_validade: '2028-03-14',
  },
  {
    nome: 'Mariana Costa Oliveira',
    cnh_numero: '03876543210',
    cnh_categoria: 'E',
    cnh_validade: '2027-11-22',
  },
  {
    nome: 'Roberto Almeida Santos',
    cnh_numero: '05123456789',
    cnh_categoria: 'E',
    cnh_validade: '2029-01-08',
  },
  {
    nome: 'Fernanda Lima Rocha',
    cnh_numero: '02987654321',
    cnh_categoria: 'E',
    cnh_validade: '2026-07-30',
  },
  {
    nome: 'Paulo Henrique Ferreira',
    cnh_numero: '06234567890',
    cnh_categoria: 'E',
    cnh_validade: '2028-09-05',
  },
  {
    nome: 'Juliana Martins Souza',
    cnh_numero: '01456789012',
    cnh_categoria: 'E',
    cnh_validade: '2027-04-18',
  },
  {
    nome: 'André Luiz Pereira',
    cnh_numero: '07345678901',
    cnh_categoria: 'E',
    cnh_validade: '2029-06-12',
  },
  {
    nome: 'Camila Rodrigues Dias',
    cnh_numero: '08890123456',
    cnh_categoria: 'E',
    cnh_validade: '2028-12-01',
  },
  {
    nome: 'Ricardo Gomes Nascimento',
    cnh_numero: '09111222334',
    cnh_categoria: 'E',
    cnh_validade: '2027-08-25',
  },
  {
    nome: 'Patrícia Vieira Barbosa',
    cnh_numero: '05678901234',
    cnh_categoria: 'E',
    cnh_validade: '2026-10-10',
  },
] as const

const CAMINHOES = [
  {
    placa: 'RGA1A01',
    modelo: 'Mercedes-Benz Actros 2651',
    tipo: 'Cavalo truck',
    rodizio: 'Segunda',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGA2B02',
    modelo: 'Volvo FH 540',
    tipo: 'Cavalo truck',
    rodizio: 'Terça',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGA3C03',
    modelo: 'Scania R 500',
    tipo: 'Cavalo truck',
    rodizio: 'Quarta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGA4D04',
    modelo: 'Iveco Hi-Way 600',
    tipo: 'Cavalo truck',
    rodizio: 'Quinta',
    status_disponibilidade: 'Em manutenção',
  },
  {
    placa: 'RGA5E05',
    modelo: 'Mercedes-Benz Atego 2426',
    tipo: 'Truck baú',
    rodizio: 'Sexta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGB1F06',
    modelo: 'Volkswagen Constellation 24.280',
    tipo: 'Truck baú',
    rodizio: 'Segunda',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGB2G07',
    modelo: 'Ford Cargo 2429',
    tipo: 'Truck baú',
    rodizio: 'Terça',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGB3H08',
    modelo: 'Mercedes-Benz Axor 2533',
    tipo: 'Basculante',
    rodizio: 'Quarta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGB4J09',
    modelo: 'Volvo VM 270',
    tipo: 'Basculante',
    rodizio: 'Quinta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGB5K10',
    modelo: 'Scania P 360',
    tipo: 'Poliguindaste / roll-on',
    rodizio: 'Sexta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGC1L11',
    modelo: 'Mercedes-Benz Accelo 1016',
    tipo: 'VUC / 3/4',
    rodizio: 'Segunda',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGC2M12',
    modelo: 'Iveco Daily 70C17',
    tipo: 'VUC baú',
    rodizio: 'Terça',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGC3N13',
    modelo: 'Ford Cargo 1319',
    tipo: 'Toco baú',
    rodizio: 'Quarta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGC4P14',
    modelo: 'Volkswagen Delivery 11.180',
    tipo: 'Toco baú',
    rodizio: 'Quinta',
    status_disponibilidade: 'Em manutenção',
  },
  {
    placa: 'RGC5R15',
    modelo: 'Mercedes-Benz Arocs 4145',
    tipo: 'Bitrem / rodotrem',
    rodizio: 'Sexta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGD1S16',
    modelo: 'Scania G 410',
    tipo: 'Carreta graneleira',
    rodizio: 'Segunda',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGD2T17',
    modelo: 'Volvo FH 460',
    tipo: 'Carreta sider',
    rodizio: 'Terça',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGD3U18',
    modelo: 'Mercedes-Benz Actros 2044',
    tipo: 'Cavalo + tanque',
    rodizio: 'Quarta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGD4V19',
    modelo: 'Iveco Tector 240E28',
    tipo: 'Truck tanque',
    rodizio: 'Quinta',
    status_disponibilidade: 'Disponível',
  },
  {
    placa: 'RGD5W20',
    modelo: 'Scania R 450',
    tipo: 'Cavalo truck',
    rodizio: 'Sexta',
    status_disponibilidade: 'Disponível',
  },
] as const

async function main() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
  const keyRaw =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  const key = keyRaw ? normalizarChaveSupabase(keyRaw) : ''

  if (!url || !key) {
    console.error(
      'Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY (recomendado).'
    )
    process.exit(1)
  }

  if (key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) {
    console.error(
      'Use o JWT anon ou service_role (eyJ...) do Supabase - Project Settings - API.'
    )
    process.exit(1)
  }

  const supabase = createClient(url, key)

  const { data: motoristasOk, error: errMotoristas } = await supabase
    .from('motoristas')
    .insert([...MOTORISTAS])
    .select('id')

  if (errMotoristas) {
    console.error('Erro ao inserir motoristas:', errMotoristas.message)
    process.exit(1)
  }

  const { data: caminhoesOk, error: errCaminhoes } = await supabase
    .from('caminhoes')
    .upsert([...CAMINHOES], { onConflict: 'placa' })
    .select('id')

  if (errCaminhoes) {
    console.error('Erro ao inserir/atualizar caminhões:', errCaminhoes.message)
    process.exit(1)
  }

  console.log(
    `OK: ${motoristasOk?.length ?? 0} motoristas inseridos; ${caminhoesOk?.length ?? 0} caminhões (upsert por placa).`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
