/** Evita ecrã em branco: `supabase.ts` rebenta no import se `.env` não existir. */
export function FaltaConfiguracaoSupabase() {
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
            No Supabase: <strong>Project Settings → API</strong>, copie a <strong>Project URL</strong>{" "}
            para <code>VITE_SUPABASE_URL</code> e a chave <strong>anon</strong> / <strong>public</strong>{" "}
            para <code>VITE_SUPABASE_ANON_KEY</code> (substitua <code>SEU_PROJETO</code> e o texto de
            exemplo da chave).
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
