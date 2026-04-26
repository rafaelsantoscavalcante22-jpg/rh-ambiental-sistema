import { createContext, useContext, type ReactNode } from 'react'

export type UsuarioPerfilApp = {
  id: string
  nome: string
  email: string
  cargo: string
  status: string
  foto_url?: string | null
  paginas_permitidas?: string[] | null
}

export type PerfilUsuarioContextValue = {
  usuario: UsuarioPerfilApp | null
  carregandoUsuario: boolean
}

const PerfilUsuarioContext = createContext<PerfilUsuarioContextValue | null>(null)

export function PerfilUsuarioProvider({
  value,
  children,
}: {
  value: PerfilUsuarioContextValue
  children: ReactNode
}) {
  return <PerfilUsuarioContext.Provider value={value}>{children}</PerfilUsuarioContext.Provider>
}

export function usePerfilUsuario(): PerfilUsuarioContextValue {
  const v = useContext(PerfilUsuarioContext)
  if (!v) {
    throw new Error('usePerfilUsuario: PerfilUsuarioProvider em falta na árvore.')
  }
  return v
}
