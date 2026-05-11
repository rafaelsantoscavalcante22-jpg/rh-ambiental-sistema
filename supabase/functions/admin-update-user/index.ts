import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handleCorsOptions } from "../_shared/cors.ts";
import { perfilPodeEditarUsuarios } from "../_shared/cargoPermissoes.ts";

type Body = {
  id?: string;
  nome?: string;
  cargo?: string;
  status?: string;
  email?: string;
  novaSenha?: string;
};

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req),
  });
}

const STATUS_VALIDOS = ["ativo", "inativo", "bloqueado"];

Deno.serve(async (req: Request) => {
  const corsEarly = handleCorsOptions(req);
  if (corsEarly) return corsEarly;

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Método não permitido." });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(req,500, { error: "Variáveis do Supabase não encontradas." });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(req,401, { error: "Token de autorização não enviado." });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return jsonResponse(req,401, { error: "Token inválido." });
    }

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req,400, { error: "Body inválido. Envie JSON válido." });
    }

    const id = String(body?.id || "").trim();
    const nome = String(body?.nome || "").trim();
    const cargo = String(body?.cargo || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();
    const emailNovo = body?.email !== undefined
      ? String(body.email).trim().toLowerCase()
      : undefined;
    const novaSenha = body?.novaSenha !== undefined
      ? String(body.novaSenha).trim()
      : undefined;

    if (!id) {
      return jsonResponse(req,400, { error: "ID do usuário é obrigatório." });
    }
    if (!nome) {
      return jsonResponse(req,400, { error: "Nome é obrigatório." });
    }
    if (!cargo) {
      return jsonResponse(req,400, { error: "Cargo é obrigatório." });
    }
    if (!STATUS_VALIDOS.includes(status)) {
      return jsonResponse(req,400, {
        error: "Status inválido. Use: ativo, inativo ou bloqueado.",
      });
    }

    if (novaSenha !== undefined && novaSenha.length > 0 && novaSenha.length < 6) {
      return jsonResponse(req,400, {
        error: "A nova senha precisa ter pelo menos 6 caracteres.",
      });
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: usuarioLogado },
      error: userError,
    } = await client.auth.getUser();

    if (userError || !usuarioLogado) {
      return jsonResponse(req,401, {
        error: "Usuário não autenticado.",
        details: userError?.message || null,
      });
    }

    const { data: perfilAdmin, error: perfilError } = await admin
      .from("usuarios")
      .select("id, cargo")
      .eq("id", usuarioLogado.id)
      .single();

    if (perfilError || !perfilAdmin) {
      return jsonResponse(req,403, {
        error: "Não foi possível validar o perfil do usuário logado.",
        details: perfilError?.message || null,
      });
    }

    if (!perfilPodeEditarUsuarios(perfilAdmin.cargo)) {
      return jsonResponse(req, 403, {
        error: "Sem permissão para editar utilizadores (Administrador, Desenvolvedor, Diretoria ou Financeiro).",
      });
    }

    const { data: alvo, error: alvoError } = await admin
      .from("usuarios")
      .select("id, email, cargo")
      .eq("id", id)
      .single();

    if (alvoError || !alvo) {
      return jsonResponse(req,404, {
        error: "Usuário não encontrado.",
        details: alvoError?.message || null,
      });
    }

    const emailFinal = emailNovo !== undefined ? emailNovo : String(alvo.email || "");

    if (emailNovo !== undefined && emailFinal) {
      const { data: outro } = await admin
        .from("usuarios")
        .select("id")
        .eq("email", emailFinal)
        .neq("id", id)
        .maybeSingle();

      if (outro) {
        return jsonResponse(req,400, {
          error: "Já existe outro usuário com este e-mail.",
        });
      }
    }

    const updatesAuth: {
      email?: string;
      password?: string;
      user_metadata?: Record<string, string>;
      app_metadata?: Record<string, string>;
    } = {
      user_metadata: { nome, cargo },
      app_metadata: { cargo },
    };

    if (emailNovo !== undefined && emailFinal) {
      updatesAuth.email = emailFinal;
    }

    if (novaSenha !== undefined && novaSenha.length > 0) {
      updatesAuth.password = novaSenha;
    }

    const { error: authErr } = await admin.auth.admin.updateUserById(id, updatesAuth);

    if (authErr) {
      return jsonResponse(req,400, {
        error: "Erro ao atualizar o usuário no Auth.",
        details: authErr.message,
      });
    }

    const { error: tableErr } = await admin
      .from("usuarios")
      .update({
        nome,
        cargo,
        status,
        ...(emailNovo !== undefined && emailFinal ? { email: emailFinal } : {}),
      })
      .eq("id", id);

    if (tableErr) {
      return jsonResponse(req,400, {
        error: "Auth atualizado, mas falhou ao salvar na tabela usuarios.",
        details: tableErr.message,
      });
    }

    return jsonResponse(req,200, {
      success: true,
      message: "Usuário atualizado com sucesso.",
    });
  } catch (error) {
    return jsonResponse(req,500, {
      error: "Erro interno na Edge Function.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
