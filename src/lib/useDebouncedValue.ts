import { useEffect, useState } from 'react'

/**
 * Valor atualizado após `delayMs` sem mudanças — útil para busca e filtros sem martelar o Supabase.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(t)
  }, [value, delayMs])

  return debounced
}
