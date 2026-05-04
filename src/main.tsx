import React from "react";
import ReactDOM from "react-dom/client";
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

/** Evita ecrã em branco: `supabase.ts` rebenta no import se `.env` não existir. */
function FaltaConfiguracaoSupabase() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1f5f9",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          background: "#fff",
          borderRadius: 16,
          padding: "28px 32px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 12px 40px rgba(15,23,42,0.08)",
        }}
      >
        <h1 style={{ margin: "0 0 12px", fontSize: 22, color: "#0f172a" }}>
          Falta o ficheiro de ambiente
        </h1>
        <p style={{ margin: "0 0 16px", color: "#475569", lineHeight: 1.55 }}>
          O cliente Supabase precisa de{" "}
          <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>
            VITE_SUPABASE_URL
          </code>{" "}
          e{" "}
          <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>
            VITE_SUPABASE_ANON_KEY
          </code>{" "}
          (definidos no <code>.env</code> na raiz do projecto).
        </p>
        <ol style={{ margin: "0 0 20px", paddingLeft: 22, color: "#334155", lineHeight: 1.7 }}>
          <li>
            Copie <code>.env.example</code> para <code>.env</code> na mesma pasta que o{" "}
            <code>package.json</code> (se ainda não existir).
          </li>
          <li>
            No Supabase: <strong>Project Settings → API</strong>, copie a <strong>Project URL</strong> para{" "}
            <code>VITE_SUPABASE_URL</code> e a chave <strong>anon</strong> / <strong>public</strong> para{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> (substitua <code>SEU_PROJETO</code> e o texto de exemplo da chave).
          </li>
          <li>Guarda o ficheiro, reinicia o servidor (<code>npm run dev</code>) e recarrega esta página.</li>
        </ol>
        <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
          Sem isto, a app não arranca — o erro acontecia antes do React e aparecia só um ecrã branco.
        </p>
      </div>
    </div>
  );
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