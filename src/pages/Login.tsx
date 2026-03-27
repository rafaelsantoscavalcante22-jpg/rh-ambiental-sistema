import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        setErro(error.message);
        return;
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#020617",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 20,
          padding: 32,
          boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
        }}
      >
        <h1
          style={{
            marginTop: 0,
            marginBottom: 8,
            textAlign: "center",
            color: "#0f172a",
            fontSize: 36,
            fontWeight: 800,
          }}
        >
          Login
        </h1>

        <p
          style={{
            textAlign: "center",
            color: "#64748b",
            marginTop: 0,
            marginBottom: 24,
          }}
        >
          Acesse o sistema da RG Ambiental
        </p>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                height: 46,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                padding: "0 14px",
                boxSizing: "border-box",
                fontSize: 15,
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              style={{
                width: "100%",
                height: 46,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                padding: "0 14px",
                boxSizing: "border-box",
                fontSize: 15,
              }}
            />
          </div>

          {erro ? (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                fontSize: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {erro}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              height: 48,
              border: "none",
              borderRadius: 12,
              background: "#16a34a",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}