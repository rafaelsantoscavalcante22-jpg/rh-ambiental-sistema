/** Texto padrão usado nos blocos informativos do modelo MTR (alinhado ao manifesto físico de referência). */
export const MTR_TEXTO_VIDE_FICHA = 'VIDE FICHA DE EMERGÊNCIA'

/** Rodapé com distribuição das vias do manifesto. */
export const MTR_RODAPE_VIAS =
  '1ª via UNIDADE DESTINATÁRIA · 2ª via TRANSPORTADOR · 3ª via GERADOR · 4ª via ÓRGÃO DE CONTROLE AMBIENTAL · 5ª via CONTROLE DO GERADOR'

/** Exibe célula sem traço "—": vazio vira espaço fino para manter altura da linha na impressão. */
export function mtrTextoCelula(val: string | null | undefined): string {
  const t = String(val ?? '').trim()
  return t.length > 0 ? t : '\u00A0'
}
