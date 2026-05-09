import React from "react";
import ReactDOM from "react-dom/client";
import { FaltaConfiguracaoSupabase } from "./FaltaConfiguracaoSupabase";
/** Folha completa (inclui `.welcome-nexus`, PWA, etc.) — alinhada ao deploy Vercel. */
import "./index-NEXUS.css";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message:
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao renderizar a aplicação.",
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error("Erro capturado pelo ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.message;
      const pareceChunkDeploy =
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Loading chunk \d+ failed/i.test(msg);
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
            padding: 24,
            fontFamily: "Arial, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              background: "#ffffff",
              border: "1px solid #fecaca",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            }}
          >
            <h1 style={{ marginTop: 0, color: "#991b1b" }}>
              Erro ao iniciar o sistema
            </h1>

            <p style={{ color: "#334155" }}>
              O sistema encontrou um erro durante a renderização.
            </p>

            {pareceChunkDeploy ? (
              <p style={{ color: "#334155", marginBottom: 16 }}>
                Isto costuma acontecer após uma atualização: o navegador ainda
                tentava carregar ficheiros antigos. Recarregue a página para
                obter a versão nova.
              </p>
            ) : null}

            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#fff5f5",
                border: "1px solid #fecaca",
                borderRadius: 12,
                padding: 16,
                color: "#991b1b",
                margin: 0,
              }}
            >
              {msg}
            </pre>

            {pareceChunkDeploy ? (
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem("rg-chunk-reload-once");
                  } catch {
                    /* ignore */
                  }
                  window.location.reload();
                }}
                style={{
                  marginTop: 20,
                  padding: "12px 20px",
                  borderRadius: 10,
                  border: "none",
                  background: "#0f766e",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 15,
                }}
              >
                Recarregar página
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  console.error("Erro global:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Promise rejeitada sem tratamento:", event.reason);
});

/**
 * Em localhost (dev ou `vite preview`), SW/caches de builds antigos fazem ver UI desactualizada.
 * Em preview `import.meta.env.DEV` é false — por isso não basta limpar só em dev.
 */
const hostname =
  typeof window !== "undefined" ? window.location.hostname : "";
const isLocalMachine =
  hostname === "localhost" || hostname === "127.0.0.1";

if (import.meta.env.DEV || isLocalMachine) {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) void r.unregister();
    });
  }
  if ("caches" in window) {
    void caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    );
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Elemento root não encontrado em index.html');
}

const root = ReactDOM.createRoot(rootElement);
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** Valores do `.env.example` ainda não substituídos — tratar como não configurado. */
function supabaseEnvPareceSoExemplo(url: string, anon: string): boolean {
  if (!url || !anon) return true;
  if (/SEU_PROJETO/i.test(url)) return true;
  if (/sua_chave_anon/i.test(anon) || /^sua_chave/i.test(anon)) return true;
  return false;
}

if (!supabaseUrl || !supabaseAnon || supabaseEnvPareceSoExemplo(supabaseUrl, supabaseAnon)) {
  root.render(<FaltaConfiguracaoSupabase />);
} else {
  void import("./App-NEXUS")
    .then(({ default: App }) => {
      root.render(
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      );
    })
    .catch((reason: unknown) => {
      console.error("Falha ao carregar a aplicação:", reason);
      const msg =
        reason instanceof Error ? reason.message : String(reason ?? "Erro desconhecido");
      root.render(
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#fef2f2",
          }}
        >
          <div style={{ maxWidth: 520, color: "#991b1b" }}>
            <h1 style={{ marginTop: 0 }}>Não foi possível carregar o módulo principal</h1>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#fff",
                padding: 16,
                borderRadius: 12,
                border: "1px solid #fecaca",
              }}
            >
              {msg}
            </pre>
          </div>
        </div>
      );
    });
}