const MARGEM_MAX = 99999.99;

export function parseMargemLucroPercentual(
  raw: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: null };
  const normalized = t.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Margem de lucro inválida. Use um número (ex.: 12,5 ou 12.5)." };
  }
  const rounded = Math.round(n * 100) / 100;
  if (rounded < 0 || rounded > MARGEM_MAX) {
    return {
      ok: false,
      message: `Margem de lucro deve estar entre 0 e ${MARGEM_MAX.toLocaleString("pt-BR")}%.`,
    };
  }
  return { ok: true, value: rounded };
}

export function margemLucroDbParaCampo(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function margemLucroClienteRotuloLista(v: string | number | null | undefined): string {
  const s = margemLucroDbParaCampo(v);
  return s === "" ? "—" : `${s}%`;
}
