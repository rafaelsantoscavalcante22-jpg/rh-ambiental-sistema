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

      setSucesso("Código enviado para o seu email.");
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

  function alternarModo(novoModo: ModoLogin) {
    setModo(novoModo);
    setEtapaCodigo("solicitar");
    setSenha("");
    setCodigo("");
    limparMensagens();
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
          maxWidth: 430,
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            onClick={() => alternarModo("senha")}
            style={{
              height: 44,
              borderRadius: 12,
              border: modo === "senha" ? "none" : "1px solid #cbd5e1",
              background: modo === "senha" ? "#16a34a" : "#ffffff",
              color: modo === "senha" ? "#ffffff" : "#0f172a",
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
              height: 44,
              borderRadius: 12,
              border: modo === "codigo" ? "none" : "1px solid #cbd5e1",
              background: modo === "codigo" ? "#16a34a" : "#ffffff",
              color: modo === "codigo" ? "#ffffff" : "#0f172a",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Entrar com código
          </button>
        </div>

        {modo === "senha" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLoginSenha(e);
            }}
          >
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
                  whiteSpace: "pre-wrap",
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
        ) : etapaCodigo === "solicitar" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleEnviarCodigo(e);
            }}
          >
            <div style={{ marginBottom: 20 }}>
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
                  whiteSpace: "pre-wrap",
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
              {carregando ? "Enviando código..." : "Enviar código"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerificarCodigo(e);
            }}
          >
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
                readOnly
                style={{
                  width: "100%",
                  height: 46,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  padding: "0 14px",
                  boxSizing: "border-box",
                  fontSize: 15,
                  background: "#f8fafc",
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
                Código recebido por e-mail
              </label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Digite o código"
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
                  whiteSpace: "pre-wrap",
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
                  height: 44,
                  border: "1px solid #cbd5e1",
                  borderRadius: 12,
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: 15,
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