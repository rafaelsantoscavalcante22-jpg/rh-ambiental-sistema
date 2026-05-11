import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Seletor de Programação vinculada baseado em calendário.
 *
 * Em vez de uma lista plana (em <select>) com dezenas de opções ordenadas por data,
 * mostramos um pop-over com calendário do mês: cada dia que tem programações é destacado
 * em verde e exibe um badge com o número de programações desse dia. Ao clicar no dia,
 * abrimos abaixo do calendário a lista das programações daquele dia para escolher uma.
 */

export type ProgramacaoCalendarOption = {
  id: string;
  numero?: string | null;
  cliente?: string | null;
  data_programada?: string | null;
};

type Props<P extends ProgramacaoCalendarOption> = {
  value: string | null | undefined;
  options: P[];
  onChange: (id: string) => void | Promise<void>;
  getLabel: (p: P) => string;
  placeholder?: string;
  disabled?: boolean;
  /** id opcional para acessibilidade (associar com <label htmlFor>). */
  id?: string;
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function parseISODate(value: string): Date | null {
  if (!value) return null;
  const clean = value.includes("T") ? value.split("T")[0] : value;
  const parts = clean.split("-").map((x) => Number.parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dataKeyDaProgramacao(p: ProgramacaoCalendarOption): string | null {
  const raw = p.data_programada;
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Aceita `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm:ss...` e `YYYY-MM-DD HH:mm:ss...`
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  if (s.includes("T")) return s.split("T")[0];
  if (s.includes(" ")) return s.split(" ")[0];
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export default function ProgramacaoCalendarPicker<P extends ProgramacaoCalendarOption>(props: Props<P>) {
  const {
    value,
    options,
    onChange,
    getLabel,
    placeholder = "Selecione a data da programação",
    disabled = false,
    id,
  } = props;

  const [open, setOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Index das programações por data ISO (YYYY-MM-DD), com a lista ordenada por número.
  const optionsByDate = useMemo(() => {
    const map = new Map<string, P[]>();
    for (const p of options) {
      const key = dataKeyDaProgramacao(p);
      if (!key) continue;
      const list = map.get(key);
      if (list) {
        list.push(p);
      } else {
        map.set(key, [p]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        String(a.numero ?? "").localeCompare(String(b.numero ?? ""), "pt-BR", { numeric: true })
      );
    }
    return map;
  }, [options]);

  const selectedOption = useMemo(() => {
    if (!value) return null;
    return options.find((p) => p.id === value) ?? null;
  }, [value, options]);

  // Sincroniza o cursor do mês quando o valor externo muda (ex.: ao editar uma MTR existente).
  useEffect(() => {
    if (!selectedOption) {
      setSelectedDate(null);
      return;
    }
    const key = dataKeyDaProgramacao(selectedOption);
    if (!key) return;
    const d = parseISODate(key);
    if (!d) return;
    setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(key);
  }, [selectedOption]);

  // Ao abrir sem seleção, posiciona o calendário no mês da próxima programação disponível
  // (a partir de hoje) para evitar abrir num mês vazio quando todas as programações estão noutro mês.
  const autoFocusedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      autoFocusedRef.current = false;
      return;
    }
    if (autoFocusedRef.current) return;
    if (selectedOption) return;
    const datas = Array.from(optionsByDate.keys()).sort();
    if (datas.length === 0) return;
    const hojeIso = toISODate(new Date());
    const futura = datas.find((d) => d >= hojeIso) ?? datas[datas.length - 1];
    const d = parseISODate(futura);
    if (d) {
      setMonthCursor(new Date(d.getFullYear(), d.getMonth(), 1));
      autoFocusedRef.current = true;
    }
  }, [open, optionsByDate, selectedOption]);

  // Fecha o pop-over ao clicar fora ou pressionar Esc.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Grade de 6 semanas para o mês atual.
  const grid = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const firstWeekday = first.getDay();
    const start = new Date(year, month, 1 - firstWeekday);
    const cells: Array<{ date: Date; iso: string; isCurrentMonth: boolean; isToday: boolean }> = [];
    const todayIso = toISODate(new Date());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = toISODate(d);
      cells.push({
        date: d,
        iso,
        isCurrentMonth: d.getMonth() === month,
        isToday: iso === todayIso,
      });
    }
    return cells;
  }, [monthCursor]);

  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthCursor);
  const programacoesDoDia = selectedDate ? optionsByDate.get(selectedDate) ?? [] : [];

  function prevMonth() {
    setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  }
  function goToToday() {
    const today = new Date();
    setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(toISODate(today));
  }
  function clearSelection() {
    setSelectedDate(null);
    void onChange("");
  }
  function pickProgramacao(p: P) {
    setOpen(false);
    void onChange(p.id);
  }

  return (
    <div ref={wrapperRef} style={wrapperStyle}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={triggerButtonStyle(open, disabled)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span style={triggerLabelStyle(selectedOption == null)}>
          {selectedOption ? getLabel(selectedOption) : placeholder}
        </span>
        <span aria-hidden="true" style={triggerIconStyle}>
          📅
        </span>
      </button>

      {open && (
        <div style={popoverStyle} role="dialog" aria-label="Selecionar programação por data">
          <div style={popoverHeaderStyle}>
            <button
              type="button"
              onClick={prevMonth}
              style={navBtnStyle}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <div style={monthLabelStyle}>{monthLabel}</div>
            <button
              type="button"
              onClick={nextMonth}
              style={navBtnStyle}
              aria-label="Próximo mês"
            >
              ›
            </button>
          </div>

          <div style={weekdayRowStyle}>
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} style={weekdayCellStyle}>
                {w}
              </div>
            ))}
          </div>

          <div style={gridStyle}>
            {grid.map((cell) => {
              const list = optionsByDate.get(cell.iso);
              const has = !!list && list.length > 0;
              const count = list?.length ?? 0;
              const isSelected = selectedDate === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={!has}
                  onClick={() => setSelectedDate(cell.iso)}
                  style={dayCellStyle({
                    isCurrentMonth: cell.isCurrentMonth,
                    isToday: cell.isToday,
                    isSelected,
                    hasProgramacoes: has,
                  })}
                  title={has ? `${count} programação(ões) neste dia` : "Sem programações neste dia"}
                  aria-label={
                    has
                      ? `Dia ${cell.date.getDate()}, ${count} programação(ões)`
                      : `Dia ${cell.date.getDate()}, sem programações`
                  }
                  aria-pressed={isSelected}
                >
                  <span style={dayNumberStyle}>{cell.date.getDate()}</span>
                  {has && <span style={badgeStyle(isSelected)}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div style={footerRowStyle}>
            <button type="button" onClick={goToToday} style={ghostBtnStyle}>
              Hoje
            </button>
            {selectedOption && (
              <button type="button" onClick={clearSelection} style={ghostBtnDangerStyle}>
                Limpar seleção
              </button>
            )}
          </div>

          {selectedDate && (
            <div style={listSectionStyle}>
              <div style={listSectionLabelStyle}>
                {programacoesDoDia.length === 0
                  ? "Nenhuma programação neste dia."
                  : `${programacoesDoDia.length} programação(ões) em ${selectedDate
                      .split("-")
                      .reverse()
                      .join("/")}:`}
              </div>
              <div style={listScrollerStyle}>
                {programacoesDoDia.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProgramacao(p)}
                    style={listItemStyle(p.id === value)}
                  >
                    {getLabel(p)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = { position: "relative", width: "100%" };

function triggerButtonStyle(open: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: 40,
    padding: "0 12px",
    gap: 10,
    background: disabled ? "#f1f5f9" : "#ffffff",
    border: `1px solid ${open ? "#16a34a" : "#cbd5e1"}`,
    borderRadius: 10,
    fontSize: 14,
    color: "#0f172a",
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: open ? "0 0 0 3px rgba(22, 163, 74, 0.18)" : "none",
    boxSizing: "border-box",
  };
}

function triggerLabelStyle(empty: boolean): React.CSSProperties {
  return {
    flex: 1,
    textAlign: "left",
    color: empty ? "#94a3b8" : "#0f172a",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

const triggerIconStyle: React.CSSProperties = { fontSize: 14 };

const popoverStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  zIndex: 1000,
  width: "min(380px, calc(100vw - 24px))",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)",
  padding: 14,
};

const popoverHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
  gap: 8,
};

const navBtnStyle: React.CSSProperties = {
  background: "#f1f5f9",
  border: "none",
  borderRadius: 8,
  width: 32,
  height: 32,
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a",
  cursor: "pointer",
};

const monthLabelStyle: React.CSSProperties = {
  fontWeight: 800,
  color: "#0f172a",
  textTransform: "capitalize",
  fontSize: 14,
};

const weekdayRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4,
  marginBottom: 4,
};

const weekdayCellStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#64748b",
  textAlign: "center",
  padding: "4px 0",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4,
};

function dayCellStyle(o: {
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hasProgramacoes: boolean;
}): React.CSSProperties {
  let bg = "#ffffff";
  let color = o.isCurrentMonth ? "#0f172a" : "#cbd5e1";
  let border = "1px solid transparent";
  if (o.hasProgramacoes) {
    bg = "#f0fdf4";
    color = "#15803d";
    border = "1px solid #bbf7d0";
  }
  if (o.isToday) {
    border = "1px solid #16a34a";
  }
  if (o.isSelected) {
    bg = "#16a34a";
    color = "#ffffff";
    border = "1px solid #15803d";
  }
  return {
    position: "relative",
    height: 40,
    borderRadius: 8,
    background: bg,
    color,
    border,
    fontSize: 13,
    fontWeight: 600,
    cursor: o.hasProgramacoes ? "pointer" : "default",
    opacity: !o.isCurrentMonth && !o.hasProgramacoes ? 0.5 : 1,
    padding: 0,
  };
}

const dayNumberStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  height: "100%",
};

function badgeStyle(isSelected: boolean): React.CSSProperties {
  return {
    position: "absolute",
    top: 2,
    right: 4,
    fontSize: 10,
    fontWeight: 700,
    background: isSelected ? "#ffffff" : "#0f172a",
    color: isSelected ? "#15803d" : "#ffffff",
    borderRadius: 999,
    padding: "0 5px",
    minWidth: 16,
    height: 16,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
  };
}

const footerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 10,
};

const ghostBtnStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#0f172a",
  cursor: "pointer",
};

const ghostBtnDangerStyle: React.CSSProperties = {
  ...ghostBtnStyle,
  color: "#b91c1c",
  border: "1px solid #fecaca",
};

const listSectionStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: "1px solid #e2e8f0",
};

const listSectionLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  marginBottom: 8,
};

const listScrollerStyle: React.CSSProperties = {
  maxHeight: 180,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

function listItemStyle(isSelected: boolean): React.CSSProperties {
  return {
    textAlign: "left",
    padding: "8px 10px",
    border: `1px solid ${isSelected ? "#16a34a" : "#e2e8f0"}`,
    borderRadius: 8,
    background: isSelected ? "#f0fdf4" : "#ffffff",
    color: "#0f172a",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}
