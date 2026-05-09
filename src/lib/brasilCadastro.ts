/** Validações e máscaras para cadastros brasileiros (CPF, CNH, placa, RENAVAM). */

export function apenasDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function formatarCPFDigitacao(input: string): string {
  const d = apenasDigitos(input).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function validarCPF(cpf: string): boolean {
  const s = apenasDigitos(cpf);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(s[i]!, 10) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(s[9]!, 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(s[i]!, 10) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(s[10]!, 10);
}

export function formatarCpfParaArmazenar(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  if (d.length !== 11) return "";
  return formatarCPFDigitacao(d);
}

/** CNH (numeração atual): até 11 dígitos. */
export function formatarCnhDigitacao(input: string): string {
  return apenasDigitos(input).slice(0, 11);
}

export function validarCnhNumeroBasica(cnh: string): boolean {
  const s = apenasDigitos(cnh);
  if (s.length !== 11) return false;
  return !/^(\d)\1{10}$/.test(s);
}

/**
 * Placa para armazenamento: maiúsculas, sem espaço nem hífen (7 caracteres).
 * Aceita padrão antigo (LLLNNNN) ou Mercosul (LLLNLNN).
 */
export function placaParaBanco(valor: string): string {
  return valor.toUpperCase().replace(/\s+/g, "").replace(/-/g, "").slice(0, 7);
}

/** Durante a digitação: maiúsculas, sem espaços; permite um hífen (até 8 caracteres). */
export function formatarPlacaDigitacao(valor: string): string {
  return valor.toUpperCase().replace(/\s+/g, "").slice(0, 8);
}

export function validarPlacaBr(valor: string): boolean {
  const p = placaParaBanco(valor);
  if (p.length !== 7) return false;
  if (/^[A-Z]{3}[0-9]{4}$/.test(p)) return true;
  if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(p)) return true;
  return false;
}

export function formatarRenavamDigitacao(input: string): string {
  return apenasDigitos(input).slice(0, 11);
}

/** RENAVAM: 9 a 11 dígitos (variação entre estados / histórico). */
export function validarRenavamBasico(renavam: string): boolean {
  const s = apenasDigitos(renavam);
  return s.length >= 9 && s.length <= 11;
}
