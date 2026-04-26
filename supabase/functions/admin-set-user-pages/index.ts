import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

/** Base: alinhado a `src/lib/paginasSistema.ts` (EMAILS_BYPASS_PAGINAS_BASE). */
const EMAILS_PODE_DEFINIR_PAGINAS_BASE = new Set([
  "cavalcantersc07@gmail.com",
  "gestores@rgambiental.com",
]);

function parseEmailsBypassFromSecret(): string[] {
  const raw = (Deno.env.get("PAGINAS_BYPASS_EMAILS") || "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Base + secret opcional `PAGINAS_BYPASS_EMAILS` (vírgula ou ponto e vírgula). */
const EMAILS_PODE_DEFINIR_PAGINAS = (() => {
  const s = new Set(EMAILS_PODE_DEFINIR_PAGINAS_BASE);
  for (const em of parseEmailsBypassFromSecret()) {
    s.add(em);
  }
  return s;
})();

/** Manter em sincronia com `ROTAS_SISTEMA` em `src/lib/paginasSistema.ts`. */
const ROTAS_VALIDAS = new Set([
  "/dashboard",
  "/clientes",
  "/motoristas",
  "/caminhoes",
  "/programacao",
  "/mtr",
  "/controle-massa",
  "/checklist-transporte",
  "/conferencia-transporte",
  "/ticket-operacional",
  "/aprovacao",
  "/faturamento",
  "/faturamento/regras-preco",
  "/envio-nf",
  "/financeiro",
  "/financeiro/contas-receber",
  "/usuarios",
  "/chat",
]);

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

type Body = {
  userId?: string;
  /** null = remover restrição (só cargo); array não vazio = whitelist */
  paginas?: string[] | null;
};

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

    const userId = String(body?.userId || "").trim();
    const paginasRaw = body?.paginas;

    if (!userId) {
      return jsonResponse(400, { error: "userId é obrigatório." });
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: usuarioLogado },
      error: userError,
    } = await client.auth.getUser();

    if (userError || !usuarioLogado?.email) {
      return jsonResponse(401, {
        error: "Usuário não autenticado.",
        details: userError?.message || null,
      });
    }

    const emailLogado = usuarioLogado.email.trim().toLowerCase();
    if (!EMAILS_PODE_DEFINIR_PAGINAS.has(emailLogado)) {
      return jsonResponse(403, {
        error: "Apenas contas autorizadas podem definir o acesso por páginas.",
      });
    }

    let valor: string[] | null;
    if (paginasRaw === null || paginasRaw === undefined) {
      valor = null;
    } else if (!Array.isArray(paginasRaw)) {
      return jsonResponse(400, { error: "paginas deve ser um array de rotas ou null." });
    } else {
      const limpo = [...new Set(
        paginasRaw.map((p) => String(p).trim()).filter(Boolean),
      )];
      for (const p of limpo) {
        if (!ROTAS_VALIDAS.has(p)) {
          return jsonResponse(400, {
            error: `Rota não permitida: ${p}`,
          });
        }
      }
      valor = limpo.length === 0 ? null : limpo;
    }

    const { data: alvo, error: alvoErr } = await admin
      .from("usuarios")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (alvoErr || !alvo) {
      return jsonResponse(404, {
        error: "Utilizador não encontrado.",
        details: alvoErr?.message || null,
      });
    }

    const { error: upErr } = await admin
      .from("usuarios")
      .update({ paginas_permitidas: valor })
      .eq("id", userId);

    if (upErr) {
      return jsonResponse(400, {
        error: "Falha ao guardar permissões de páginas.",
        details: upErr.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      message: valor === null
        ? "Restrição por páginas removida (vale o cargo)."
        : "Permissões de páginas atualizadas.",
      paginas_permitidas: valor,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro interno na Edge Function.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
