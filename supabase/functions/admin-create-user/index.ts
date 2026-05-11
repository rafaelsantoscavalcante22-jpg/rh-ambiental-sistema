import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handleCorsOptions } from "../_shared/cors.ts";
import { perfilPodeCriarOuExcluirUsuarios } from "../_shared/cargoPermissoes.ts";

type CreateUserBody = {
  nome?: string;
  email?: string;
  senha?: string;
  cargo?: string;
};

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req),
  });
}

Deno.serve(async (req: Request) => {
  const corsEarly = handleCorsOptions(req);
  if (corsEarly) return corsEarly;

  if (req.method !== "POST") {
    return jsonResponse(req, 405, {
      error: "Método não permitido.",
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(req,500, {
        error: "Variáveis do Supabase não encontradas.",
      });
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(req,401, {
        error: "Token de autorização não enviado.",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return jsonResponse(req,401, {
        error: "Token inválido.",
      });
    }

    let body: CreateUserBody;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(req,400, {
        error: "Body inválido. Envie JSON válido.",
      });
    }

    const nome = String(body?.nome || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const senha = String(body?.senha || "").trim();
    const cargo = String(body?.cargo || "").trim();

    if (!nome) {
      return jsonResponse(req,400, { error: "Nome é obrigatório." });
    }

    if (!email) {
      return jsonResponse(req,400, { error: "E-mail é obrigatório." });
    }

    if (!senha) {
      return jsonResponse(req,400, { error: "Senha é obrigatória." });
    }

    if (senha.length < 6) {
      return jsonResponse(req,400, {
        error: "A senha precisa ter pelo menos 6 caracteres.",
      });
    }

    if (!cargo) {
      return jsonResponse(req,400, { error: "Cargo é obrigatório." });
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
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

    if (!perfilPodeCriarOuExcluirUsuarios(perfilAdmin.cargo)) {
      return jsonResponse(req,403, {
        error: "Apenas administradores ou desenvolvedores podem criar usuários.",
      });
    }

    const { data: usuarioExistenteAuth } = await admin.auth.admin.listUsers();

    const jaExisteNoAuth = usuarioExistenteAuth.users.some(
      (user) => String(user.email || "").toLowerCase() === email
    );

    if (jaExisteNoAuth) {
      return jsonResponse(req,400, {
        error: "Já existe um usuário com este e-mail no Auth.",
      });
    }

    const { data: usuarioExistenteTabela, error: buscaTabelaError } = await admin
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (buscaTabelaError) {
      return jsonResponse(req,500, {
        error: "Erro ao validar e-mail na tabela usuarios.",
        details: buscaTabelaError.message,
      });
    }

    if (usuarioExistenteTabela) {
      return jsonResponse(req,400, {
        error: "Já existe um usuário com este e-mail na tabela usuarios.",
      });
    }

    const { data: authCriado, error: createAuthError } =
      await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome,
          cargo,
        },
        app_metadata: {
          cargo,
        },
      });

    if (createAuthError || !authCriado?.user) {
      return jsonResponse(req,400, {
        error: "Erro ao criar usuário no Auth.",
        details: createAuthError?.message || null,
      });
    }

    const novoUsuarioId = authCriado.user.id;

    const { error: insertError } = await admin.from("usuarios").insert({
      id: novoUsuarioId,
      nome,
      email,
      cargo,
      status: "ativo",
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(novoUsuarioId);

      return jsonResponse(req,400, {
        error: "Usuário criado no Auth, mas falhou ao salvar na tabela usuarios.",
        details: insertError.message,
      });
    }

    return jsonResponse(req,200, {
      success: true,
      message: "Usuário criado com sucesso.",
      usuario: {
        id: novoUsuarioId,
        nome,
        email,
        cargo,
        status: "ativo",
      },
    });
  } catch (error) {
    return jsonResponse(req,500, {
      error: "Erro interno na Edge Function.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});