/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Variáveis expostas ao cliente (prefixo VITE_). Documentadas em `.env.example`. */
interface ImportMetaEnv {
  /** Opcional: origem pública (por defeito use OFFICIAL_SITE_ORIGIN em src/lib/officialSiteUrl.ts). */
  readonly VITE_APP_ORIGIN?: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPORTE_USER_ID?: string
  readonly VITE_SUPORTE_EMAIL?: string
  readonly VITE_PAGINAS_BYPASS_EMAILS?: string
  readonly VITE_FATURAMENTO_RESUMO_DESDE_DIAS?: string
  /** Injetado em build (vite.config) a partir de `package.json`. */
  readonly VITE_APP_VERSION: string
  /** Carimbo do build; igual a `public/version.json` → `builtAt` (deteção de novo deploy). */
  readonly VITE_APP_BUILD_STAMP: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Evento de instalação PWA (Chromium). */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}
