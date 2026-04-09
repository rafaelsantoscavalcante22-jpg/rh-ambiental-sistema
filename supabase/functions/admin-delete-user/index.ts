import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type Body = {
  id?: string;
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
    return jsonResponse(405, { error: "Método não permitido." });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(500, { error: "Variáveis do Supabase não encontradas." });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Token de autorização não enviado." });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return jsonResponse(401, { error: "Token inválido." });
    }

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Body inválido. Envie JSON válido." });
    }

    const id = String(body?.id || "").trim();
    if (!id) {
      return jsonResponse(400, { error: "ID do usuário é obrigatório." });
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
      return jsonResponse(401, {
        error: "Usuário não autenticado.",
        details: userError?.message || null,
      });
    }

    if (id === usuarioLogado.id) {
      return jsonResponse(400, {
        error: "Não é possível excluir a própria conta.",
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
        error: "Apenas administradores podem excluir usuários.",
      });
    }

    const { data: alvo, error: alvoError } = await admin
      .from("usuarios")
      .select("id, cargo")
      .eq("id", id)
      .single();

    if (alvoError || !alvo) {
      return jsonResponse(404, {
        error: "Usuário não encontrado.",
        details: alvoError?.message || null,
      });
    }

    if (alvo.cargo === "Administrador") {
      const { count, error: countError } = await admin
        .from("usuarios")
        .select("*", { count: "exact", head: true })
        .eq("cargo", "Administrador");

      if (!countError && count !== null && count <= 1) {
        return jsonResponse(400, {
          error: "Não é possível excluir o único administrador do sistema.",
        });
      }
    }

    const { error: delTable } = await admin.from("usuarios").delete().eq("id", id);
    if (delTable) {
      return jsonResponse(400, {
        error: "Não foi possível remover o registro na tabela usuarios.",
        details: delTable.message,
      });
    }

    const { error: delAuth } = await admin.auth.admin.deleteUser(id);
    if (delAuth) {
      return jsonResponse(400, {
        error: "Registro removido da base, mas falhou ao excluir no Auth.",
        details: delAuth.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      message: "Usuário excluído com sucesso.",
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro interno na Edge Function.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
