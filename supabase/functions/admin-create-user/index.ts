import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type CreateUserBody = {
  nome?: string;
  email?: string;
  senha?: string;
  cargo?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, {
      error: "Método não permitido.",
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, {
        error: "Variáveis do Supabase não encontradas.",
      });
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, {
        error: "Token de autorização não enviado.",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return jsonResponse(401, {
        error: "Token inválido.",
      });
    }

    let body: CreateUserBody;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, {
        error: "Body inválido. Envie JSON válido.",
      });
    }

    const nome = String(body?.nome || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const senha = String(body?.senha || "").trim();
    const cargo = String(body?.cargo || "").trim();

    if (!nome) {
      return jsonResponse(400, { error: "Nome é obrigatório." });
    }

    if (!email) {
      return jsonResponse(400, { error: "E-mail é obrigatório." });
    }

    if (!senha) {
      return jsonResponse(400, { error: "Senha é obrigatória." });
    }

    if (senha.length < 6) {
      return jsonResponse(400, {
        error: "A senha precisa ter pelo menos 6 caracteres.",
      });
    }

    if (!cargo) {
      return jsonResponse(400, { error: "Cargo é obrigatório." });
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
      return jsonResponse(401, {
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
      return jsonResponse(403, {
        error: "Não foi possível validar o perfil do usuário logado.",
        details: perfilError?.message || null,
      });
    }

    if (perfilAdmin.cargo !== "Administrador") {
      return jsonResponse(403, {
        error: "Apenas administradores podem criar usuários.",
      });
    }

    const { data: usuarioExistenteAuth } = await admin.auth.admin.listUsers();

    const jaExisteNoAuth = usuarioExistenteAuth.users.some(
      (user) => String(user.email || "").toLowerCase() === email
    );

    if (jaExisteNoAuth) {
      return jsonResponse(400, {
        error: "Já existe um usuário com este e-mail no Auth.",
      });
    }

    const { data: usuarioExistenteTabela, error: buscaTabelaError } = await admin
      .from("usuarios")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (buscaTabelaError) {
      return jsonResponse(500, {
        error: "Erro ao validar e-mail na tabela usuarios.",
        details: buscaTabelaError.message,
      });
    }

    if (usuarioExistenteTabela) {
      return jsonResponse(400, {
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
      return jsonResponse(400, {
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

      return jsonResponse(400, {
        error: "Usuário criado no Auth, mas falhou ao salvar na tabela usuarios.",
        details: insertError.message,
      });
    }

    return jsonResponse(200, {
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
    return jsonResponse(500, {
      error: "Erro interno na Edge Function.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});