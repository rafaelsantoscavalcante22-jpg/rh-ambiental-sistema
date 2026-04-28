import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Elemento root não encontrado em index.html');
}

ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);