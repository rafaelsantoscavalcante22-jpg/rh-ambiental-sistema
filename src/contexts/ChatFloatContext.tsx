import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ChatFloatContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  openChat: () => void
  /** Abre o painel e inicia conversa com o utilizador quando o modelo estiver pronto. */
  openChatWithUser: (userId: string) => void
  pendingUserId: string | null
  clearPendingUserId: () => void
}

const ChatFloatContext = createContext<ChatFloatContextValue | null>(null)

export function ChatFloatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)

  const clearPendingUserId = useCallback(() => setPendingUserId(null), [])

  const openChat = useCallback(() => {
    setOpen(true)
  }, [])

  const openChatWithUser = useCallback((userId: string) => {
    setPendingUserId(userId)
    setOpen(true)
  }, [])

  const value = useMemo(
    () => ({
      open,
      setOpen,
      openChat,
      openChatWithUser,
      pendingUserId,
      clearPendingUserId,
    }),
    [open, openChat, openChatWithUser, pendingUserId, clearPendingUserId]
  )

  return <ChatFloatContext.Provider value={value}>{children}</ChatFloatContext.Provider>
}

export function useChatFloat(): ChatFloatContextValue {
  const ctx = useContext(ChatFloatContext)
  if (!ctx) {
    throw new Error('useChatFloat deve ser usado dentro de ChatFloatProvider')
  }
  return ctx
}
