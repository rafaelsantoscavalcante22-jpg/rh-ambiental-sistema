/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type PresencaAoVivoContextValue = {
  /** IDs de utilizadores com sessão ativa agora. */
  onlineIds: ReadonlySet<string>
  isOnline: (userId: string | null | undefined) => boolean
}

const PresencaAoVivoContext = createContext<PresencaAoVivoContextValue | null>(null)

function onlineIdsFromPresence(ch: RealtimeChannel): ReadonlySet<string> {
  const state = ch.presenceState() as Record<string, unknown>
  return new Set(Object.keys(state))
}

export function PresencaAoVivoProvider({ children }: { children: ReactNode }) {
  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(() => new Set())
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancel = false
    let intervalId: number | null = null

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const myId = user?.id
      if (!myId || cancel) return

      const ch = supabase.channel('rg-presenca-ao-vivo', {
        config: {
          presence: { key: myId },
        },
      })

      const refreshOnline = () => {
        if (cancel) return
        setOnlineIds(onlineIdsFromPresence(ch))
      }

      ch.on('presence', { event: 'sync' }, refreshOnline)
        .on('presence', { event: 'join' }, refreshOnline)
        .on('presence', { event: 'leave' }, refreshOnline)
        .subscribe(async (status) => {
          if (cancel) return
          if (status !== 'SUBSCRIBED') return
          try {
            await ch.track({ at: new Date().toISOString() })
          } finally {
            refreshOnline()
          }
        })

      channelRef.current = ch

      // Mantém a presença “quente” em navegadores que suspendem abas.
      intervalId = window.setInterval(() => {
        void ch.track({ at: new Date().toISOString() })
      }, 25000)
    })()

    return () => {
      cancel = true
      if (intervalId != null) window.clearInterval(intervalId)
      const ch = channelRef.current
      channelRef.current = null
      if (ch) void ch.unsubscribe()
      setOnlineIds(new Set())
    }
  }, [])

  const value = useMemo<PresencaAoVivoContextValue>(() => {
    const isOnline = (userId: string | null | undefined) => {
      if (!userId) return false
      return onlineIds.has(userId)
    }
    return { onlineIds, isOnline }
  }, [onlineIds])

  return <PresencaAoVivoContext.Provider value={value}>{children}</PresencaAoVivoContext.Provider>
}

export function usePresencaAoVivo(): PresencaAoVivoContextValue {
  const ctx = useContext(PresencaAoVivoContext)
  if (!ctx) {
    throw new Error('usePresencaAoVivo deve ser usado dentro de PresencaAoVivoProvider')
  }
  return ctx
}
