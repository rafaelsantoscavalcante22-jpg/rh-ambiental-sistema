import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

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
        background: "#020b2d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          background: "#ffffff",
          borderRadius: 20,
          padding: "28px 28px 26px",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.22)",
        }}
      >
        {/* LOGO */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <img
            src="/logo-rg.png"
            alt="RG Ambiental"
            style={{
              width: 185,
              maxWidth: "100%",
              height: "auto",
            }}
          />
        </div>

        {/* TÍTULO */}
        <h1
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 26,
            fontWeight: 800,
            color: "#0b1736",
          }}
        >
          Login
        </h1>

        <p
          className="page-header__lead"
          style={{
            margin: "8px 0 22px",
            textAlign: "center",
          }}
        >
          Entre com o e-mail corporativo para acessar o painel.
        </p>

        {/* FORM */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 15,
                fontWeight: 700,
                color: "#0b1736",
              }}
            >
              E-mail
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Digite seu e-mail"
              style={{
                width: "100%",
                height: 42,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                padding: "0 14px",
                fontSize: 15,
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontSize: 15,
                fontWeight: 700,
                color: "#0b1736",
              }}
            >
              Senha
            </label>

            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite sua senha"
              style={{
                width: "100%",
                height: 42,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                padding: "0 14px",
                fontSize: 15,
                outline: "none",
              }}
            />
          </div>

          {/* ERRO */}
          {erro && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                fontSize: 14,
              }}
            >
              {erro}
            </div>
          )}

          {/* BOTÃO */}
          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              height: 44,
              border: "none",
              borderRadius: 12,
              background: "#1fad49",
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