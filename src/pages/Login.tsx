import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

type ModoLogin = "senha" | "codigo";
type EtapaCodigo = "solicitar" | "verificar";

export default function Login() {
  const [modo, setModo] = useState<ModoLogin>("senha");
  const [etapaCodigo, setEtapaCodigo] = useState<EtapaCodigo>("solicitar");

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  function limparMensagens() {
    setErro("");
    setSucesso("");
  }

  function alternarModo(novoModo: ModoLogin) {
    setModo(novoModo);
    setEtapaCodigo("solicitar");
    setSenha("");
    setCodigo("");
    limparMensagens();
  }

  async function handleLoginSenha(e: FormEvent) {
    e.preventDefault();
    limparMensagens();
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

  async function handleEnviarCodigo(e: FormEvent) {
    e.preventDefault();
    limparMensagens();
    setCarregando(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setErro(error.message);
        return;
      }

      setSucesso("Código enviado para o seu e-mail.");
      setEtapaCodigo("verificar");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCarregando(false);
    }
  }

  async function handleVerificarCodigo(e: FormEvent) {
    e.preventDefault();
    limparMensagens();
    setCarregando(true);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: codigo.trim(),
        type: "email",
      });

      if (error) {
        setErro(error.message);
        return;
      }

      if (!data.session) {
        setErro("Não foi possível criar a sessão após validar o código.");
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
              objectFit: "contain",
            }}
          />
        </div>

        <h1
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 28,
            lineHeight: 1.1,
            fontWeight: 800,
            color: "#0b1736",
          }}
        >
          Login
        </h1>

        <p
          style={{
            margin: "10px 0 24px 0",
            textAlign: "center",
            fontSize: 15,
            color: "#6b7a99",
          }}
        >
          Acesse o sistema da RG Ambiental
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 18,
          }}
        >
          <button
            type="button"
            onClick={() => alternarModo("senha")}
            style={{
              height: 38,
              borderRadius: 12,
              border: modo === "senha" ? "none" : "1px solid #cbd5e1",
              background: modo === "senha" ? "#1fad49" : "#ffffff",
              color: modo === "senha" ? "#ffffff" : "#0b1736",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entrar com senha
          </button>

          <button
            type="button"
            onClick={() => alternarModo("codigo")}
            style={{
              height: 38,
              borderRadius: 12,
              border: modo === "codigo" ? "none" : "1px solid #cbd5e1",
              background: modo === "codigo" ? "#1fad49" : "#ffffff",
              color: modo === "codigo" ? "#ffffff" : "#0b1736",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entrar com código
          </button>
        </div>

        {modo === "senha" ? (
          <form onSubmit={handleLoginSenha}>
            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="email"
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
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  fontSize: 15,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="senha"
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
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  fontSize: 15,
                  outline: "none",
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
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  fontSize: 14,
                }}
              >
                {erro}
              </div>
            ) : null}

            {sucesso ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#f0fdf4",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  fontSize: 14,
                }}
              >
                {sucesso}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={carregando}
              style={{
                width: "100%",
                height: 42,
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
        ) : etapaCodigo === "solicitar" ? (
          <form onSubmit={handleEnviarCodigo}>
            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="email-codigo"
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
                id="email-codigo"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  fontSize: 15,
                  outline: "none",
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
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  fontSize: 14,
                }}
              >
                {erro}
              </div>
            ) : null}

            {sucesso ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#f0fdf4",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  fontSize: 14,
                }}
              >
                {sucesso}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={carregando}
              style={{
                width: "100%",
                height: 42,
                border: "none",
                borderRadius: 12,
                background: "#1fad49",
                color: "#ffffff",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {carregando ? "Enviando código..." : "Enviar código"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerificarCodigo}>
            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="email-verificacao"
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
                id="email-verificacao"
                type="email"
                value={email}
                readOnly
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  fontSize: 15,
                  outline: "none",
                  background: "#f8fafc",
                }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label
                htmlFor="codigo"
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#0b1736",
                }}
              >
                Código
              </label>

              <input
                id="codigo"
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Digite o código enviado"
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  fontSize: 15,
                  outline: "none",
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
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  fontSize: 14,
                }}
              >
                {erro}
              </div>
            ) : null}

            {sucesso ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#f0fdf4",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  fontSize: 14,
                }}
              >
                {sucesso}
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="submit"
                disabled={carregando}
                style={{
                  width: "100%",
                  height: 42,
                  border: "none",
                  borderRadius: 12,
                  background: "#1fad49",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {carregando ? "Validando código..." : "Validar código"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setEtapaCodigo("solicitar");
                  setCodigo("");
                  limparMensagens();
                }}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0b1736",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Voltar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}