import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useChatFloat } from '../contexts/ChatFloatContext'

/**
 * Rota legada `/chat`: abre o painel flutuante e redireciona para a página inicial.
 * Links com `?u=` abrem conversa com o utilizador indicado.
 */
export default function Chat() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { openChat, openChatWithUser } = useChatFloat()
  const feito = useRef(false)

  useEffect(() => {
    if (feito.current) return
    feito.current = true
    const u = searchParams.get('u')
    if (u?.trim()) openChatWithUser(u.trim())
    else openChat()
    navigate('/bem-vindo', { replace: true })
  }, [navigate, openChat, openChatWithUser, searchParams])

  return null
}
