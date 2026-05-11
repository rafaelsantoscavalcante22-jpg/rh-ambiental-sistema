import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation } from "react-router-dom";
import { usePerfilUsuario } from "../contexts/PerfilUsuarioContext";

type Envelope<T> = { v: 1; data: T };

function buildFieldStorageKey(usuarioId: string, pathname: string, scopeKey: string) {
  return `rg-page-field:${usuarioId}:${pathname}:${scopeKey}`;
}

function buildBlobStorageKey(usuarioId: string, pathOrKey: string) {
  return `rg-page-blob:${usuarioId}:${pathOrKey}`;
}

/**
 * Remove o rascunho JSON associado a uma chave (pathname ou `cacheKey` passado ao hook).
 */
export function clearSessionPageBlob(usuarioId: string, pathOrCacheKey: string) {
  try {
    sessionStorage.removeItem(buildBlobStorageKey(usuarioId, pathOrCacheKey));
  } catch {
    /* ignore */
  }
}

/**
 * Estado simples (texto, número, etc.) persistido em sessionStorage por rota e utilizador.
 * Sobrevive a mudanças de ecrã dentro do mesmo separador; limpa-se ao fechar o separador.
 */
export function useSessionPersistedState<T>(
  scopeKey: string,
  initialValue: T,
  options?: { debounceMs?: number }
): [T, Dispatch<SetStateAction<T>>] {
  const { usuario } = usePerfilUsuario();
  const { pathname } = useLocation();
  const uid = usuario?.id;
  const storageKey =
    uid != null && uid !== "" ? buildFieldStorageKey(uid, pathname, scopeKey) : null;
  const debounceMs = options?.debounceMs ?? 400;

  const restoredForKeyRef = useRef<string | null>(null);
  const [state, setState] = useState<T>(initialValue);

  useEffect(() => {
    if (!storageKey) return;
    if (restoredForKeyRef.current === storageKey) return;
    restoredForKeyRef.current = storageKey;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const p = JSON.parse(raw) as Envelope<T>;
      if (p?.v !== 1) return;
      setState(p.data);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (restoredForKeyRef.current !== storageKey) return;
    const id = window.setTimeout(() => {
      try {
        const env: Envelope<T> = { v: 1, data: state };
        sessionStorage.setItem(storageKey, JSON.stringify(env));
      } catch {
        /* ignore */
      }
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [state, storageKey, debounceMs]);

  return [state, setState];
}

export type SessionObjectDraftOptions<T extends object> = {
  /** Objeto a serializar (use `useMemo` estável para evitar gravações em excesso). */
  data: T;
  onRestore: (data: T) => void;
  debounceMs?: number;
  /** Quando false, não grava (útil durante carregamentos que não devem sobrescrever o rascunho). */
  persist?: boolean;
  /**
   * Chave estável para o rascunho (ex.: id do registo). Por omissão usa-se `location.pathname`.
   * Útil quando a rota muda sem perder o mesmo formulário (ex.: /novo → /:id/editar).
   */
  cacheKey?: string;
};

/**
 * Rascunho JSON de um ecrã inteiro (vários campos de formulário / UI).
 * A chave inclui o path atual, por isso `/mtr` e `/mtr/:id` têm rascunhos separados.
 */
export function useSessionObjectDraft<T extends object>(opts: SessionObjectDraftOptions<T>) {
  const { usuario } = usePerfilUsuario();
  const { pathname } = useLocation();
  const pathPart = opts.cacheKey ?? pathname;
  const uid = usuario?.id;
  const storageKey =
    uid != null && uid !== "" ? buildBlobStorageKey(uid, pathPart) : null;
  const debounceMs = opts.debounceMs ?? 450;
  const persist = opts.persist !== false;

  const restoredForKeyRef = useRef<string | null>(null);
  const onRestoreRef = useRef(opts.onRestore);
  useEffect(() => {
    onRestoreRef.current = opts.onRestore;
  }, [opts.onRestore]);

  useEffect(() => {
    if (!storageKey) return;
    if (restoredForKeyRef.current === storageKey) return;
    restoredForKeyRef.current = storageKey;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const p = JSON.parse(raw) as Envelope<T>;
      if (p?.v !== 1 || p.data == null || typeof p.data !== "object") return;
      onRestoreRef.current(p.data as T);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !persist) return;
    if (restoredForKeyRef.current !== storageKey) return;
    const id = window.setTimeout(() => {
      try {
        const env: Envelope<T> = { v: 1, data: opts.data };
        sessionStorage.setItem(storageKey, JSON.stringify(env));
      } catch {
        /* ignore */
      }
    }, debounceMs);
    return () => window.clearTimeout(id);
  }, [opts.data, storageKey, debounceMs, persist]);
}
