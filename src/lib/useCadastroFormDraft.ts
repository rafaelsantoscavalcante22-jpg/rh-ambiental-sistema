import { useEffect, useRef } from "react";

export function limparSessionDraftKey(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

type DraftEnvelope<T> = { v: 1; open: true; data: T };

/**
 * Grava rascunho em sessionStorage enquanto `open` é true (ex.: painel de cadastro aberto).
 * Na montagem, restaura se a aba tiver sido recarregada ou descartada pelo navegador.
 */
export function useCadastroFormDraft<T extends object>(opts: {
  storageKey: string;
  open: boolean;
  data: T;
  onRestore: (data: T) => void;
}) {
  const { storageKey, open, data, onRestore } = opts;
  const restoredRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftEnvelope<T>;
      if (parsed.v !== 1 || parsed.open !== true || parsed.data == null) return;
      onRestoreRef.current(parsed.data);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    try {
      const env: DraftEnvelope<T> = { v: 1, open: true, data };
      sessionStorage.setItem(storageKey, JSON.stringify(env));
    } catch {
      /* ignore */
    }
  }, [storageKey, open, data]);
}
