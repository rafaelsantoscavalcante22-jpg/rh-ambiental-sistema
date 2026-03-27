import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Usuario = {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  status: string;
  created_at: string | null;
};

type FormState = {
  nome: string;
  email: string;
  senha: string;
  cargo: string;
};

const CARGOS = [
  "Administrador",
  "Operacional",
  "Financeiro",
  "Visualizador",
];

function formatarData(data: string | null) {
  if (!data) return "-";

  const d = new Date(data);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR");
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingCriacao, setLoadingCriacao] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [form, setForm] = useState<FormState>({
    nome: "",
    email: "",
    senha: "",
    cargo: "Financeiro",
  });

  const totalUsuarios = useMemo(() => usuarios.length, [usuarios]);

  const totalAtivos = useMemo(() => {
    return usuarios.filter(
      (u) => String(u.status).toLowerCase() === "ativo"
    ).length;
  }, [usuarios]);

  async function carregarUsuarios() {
    try {
      setLoadingLista(true);
      setErro("");

      const { data, error } = await supabase
        .from("usuarios")
        .select("id, nome, email, cargo, status, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setUsuarios((data || []) as Usuario[]);
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : "Erro ao carregar usuários."
      );
    } finally {
      setLoadingLista(false);
    }
  }

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function extrairErroDaEdgeFunction(error: unknown) {
    if (error instanceof FunctionsHttpError) {
      try {
        const response = error.context;
        const payload = await response.json();

        if (payload?.error) return String(payload.error);
        if (payload?.details) return String(payload.details);
        if (payload?.message) return String(payload.message);

        return `Edge Function retornou HTTP ${response.status}.`;
      } catch {
        return "A Edge Function retornou erro, mas não foi possível ler a resposta.";
      }
    }

    if (error instanceof FunctionsRelayError) {
      return `Erro de relay da Edge Function: ${error.message}`;
    }

    if (error instanceof FunctionsFetchError) {
      return `Erro de conexão ao chamar a Edge Function: ${error.message}`;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Erro desconhecido ao criar usuário.";
  }

  async function criarUsuario(e: FormEvent) {
    e.preventDefault();

    setErro("");
    setSucesso("");

    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();
    const senha = form.senha.trim();
    const cargo = form.cargo.trim();

    if (!nome) {
      setErro("Informe o nome.");
      return;
    }

    if (!email) {
      setErro("Informe o e-mail.");
      return;
    }

    if (!senha) {
      setErro("Informe a senha.");
      return;
    }

    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setLoadingCriacao(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      const { data, error } = await supabase.functions.invoke(
        "admin-create-user",
        {
          body: {
            nome,
            email,
            senha,
            cargo,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(String(data.error));
      }

      setSucesso(data?.message || "Usuário criado com sucesso.");

      setForm({
        nome: "",
        email: "",
        senha: "",
        cargo: "Financeiro",
      });

      await carregarUsuarios();
    } catch (err) {
      const mensagem = await extrairErroDaEdgeFunction(err);
      setErro(mensagem);
    } finally {
      setLoadingCriacao(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 40,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Usuários
          </h1>
          <p
            style={{
              marginTop: 8,
              color: "#64748b",
              fontSize: 18,
            }}
          >
            Gerencie usuários, cargos e acesso ao sistema RG Ambiental.
          </p>
        </div>

        <button
          onClick={carregarUsuarios}
          disabled={loadingLista}
          style={{
            border: "none",
            background: "#ffffff",
            color: "#0f172a",
            padding: "10px 16px",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)",
          }}
        >
          {loadingLista ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(180px, 260px))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 20,
            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ color: "#64748b", fontSize: 14, marginBottom: 10 }}>
            Total de usuários
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, color: "#0f172a" }}>
            {totalUsuarios}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 18,
            padding: 20,
            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ color: "#64748b", fontSize: 14, marginBottom: 10 }}>
            Usuários ativos
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, color: "#0f172a" }}>
            {totalAtivos}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "340px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 20,
            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: 20,
              fontSize: 20,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Criar usuário
          </h2>

          <form onSubmit={criarUsuario}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 8,
                }}
              >
                Nome
              </label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid #dbe2ea",
                  padding: "0 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f8fafc",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 8,
                }}
              >
                E-mail
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid #dbe2ea",
                  padding: "0 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f8fafc",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 8,
                }}
              >
                Senha
              </label>
              <input
                type="password"
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid #dbe2ea",
                  padding: "0 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f8fafc",
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 8,
                }}
              >
                Cargo
              </label>
              <select
                value={form.cargo}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 12,
                  border: "1px solid #dbe2ea",
                  padding: "0 14px",
                  fontSize: 15,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f8fafc",
                }}
              >
                {CARGOS.map((cargo) => (
                  <option key={cargo} value={cargo}>
                    {cargo}
                  </option>
                ))}
              </select>
            </div>

            {!!erro && (
              <div
                style={{
                  marginBottom: 14,
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
            )}

            {!!sucesso && (
              <div
                style={{
                  marginBottom: 14,
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
            )}

            <button
              type="submit"
              disabled={loadingCriacao}
              style={{
                width: "100%",
                height: 48,
                border: "none",
                borderRadius: 12,
                background: "#22c55e",
                color: "#052e16",
                fontWeight: 800,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              {loadingCriacao ? "Criando usuário..." : "Criar usuário"}
            </button>
          </form>
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: 20,
            padding: 20,
            boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
            overflowX: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Lista de usuários
            </h2>

            <div style={{ color: "#64748b", fontSize: 14 }}>
              {usuarios.length} usuário(s)
            </div>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 760,
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 10px",
                    color: "#64748b",
                    fontSize: 14,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Nome
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 10px",
                    color: "#64748b",
                    fontSize: 14,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  E-mail
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 10px",
                    color: "#64748b",
                    fontSize: 14,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Cargo
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 10px",
                    color: "#64748b",
                    fontSize: 14,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "12px 10px",
                    color: "#64748b",
                    fontSize: 14,
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Criado em
                </th>
              </tr>
            </thead>

            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td
                    style={{
                      padding: "14px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {usuario.nome}
                  </td>
                  <td
                    style={{
                      padding: "14px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      color: "#1e293b",
                    }}
                  >
                    {usuario.email}
                  </td>
                  <td
                    style={{
                      padding: "14px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      color: "#1e293b",
                    }}
                  >
                    {usuario.cargo}
                  </td>
                  <td
                    style={{
                      padding: "14px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      color: "#1e293b",
                    }}
                  >
                    {usuario.status}
                  </td>
                  <td
                    style={{
                      padding: "14px 10px",
                      borderBottom: "1px solid #f1f5f9",
                      color: "#1e293b",
                    }}
                  >
                    {formatarData(usuario.created_at)}
                  </td>
                </tr>
              ))}

              {!loadingLista && usuarios.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "18px 10px",
                      color: "#64748b",
                    }}
                  >
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}