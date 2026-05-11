import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handleCorsOptions } from "../_shared/cors.ts";

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
  "/representantes-rg",
  "/caminhoes",
  "/programacao",
  "/mtr",
  "/controle-massa",
  "/comprovantes-descarte",
  "/checklist-transporte",
  "/conferencia-transporte",
  "/ticket-operacional",
  "/aprovacao",
  "/faturamento",
  "/faturamento/regras-preco",
  "/envio-nf",
  "/financeiro",
  "/financeiro/contas-receber",
  "/financeiro/contas-pagar",
  "/pos-venda",
  "/usuarios",
  "/chat",
]);

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req),
  });
}

type Body = {
  userId?: string;
  /** null = remover restrição (só cargo); array não vazio = whitelist */
  paginas?: string[] | null;
};

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

    const userId = String(body?.userId || "").trim();
    const paginasRaw = body?.paginas;

    if (!userId) {
      return jsonResponse(req,400, { error: "userId é obrigatório." });
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
      return jsonResponse(req,401, {
        error: "Usuário não autenticado.",
        details: userError?.message || null,
      });
    }

    const emailLogado = usuarioLogado.email.trim().toLowerCase();
    if (!EMAILS_PODE_DEFINIR_PAGINAS.has(emailLogado)) {
      return jsonResponse(req,403, {
        error: "Apenas contas autorizadas podem definir o acesso por páginas.",
      });
    }

    let valor: string[] | null;
    if (paginasRaw === null || paginasRaw === undefined) {
      valor = null;
    } else if (!Array.isArray(paginasRaw)) {
      return jsonResponse(req,400, { error: "paginas deve ser um array de rotas ou null." });
    } else {
      const limpo = [...new Set(
        paginasRaw.map((p) => String(p).trim()).filter(Boolean),
      )];
      for (const p of limpo) {
        if (!ROTAS_VALIDAS.has(p)) {
          return jsonResponse(req,400, {
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
      return jsonResponse(req,404, {
        error: "Utilizador não encontrado.",
        details: alvoErr?.message || null,
      });
    }

    const { error: upErr } = await admin
      .from("usuarios")
      .update({ paginas_permitidas: valor })
      .eq("id", userId);

    if (upErr) {
      return jsonResponse(req,400, {
        error: "Falha ao guardar permissões de páginas.",
        details: upErr.message,
      });
    }

    return jsonResponse(req,200, {
      success: true,
      message: valor === null
        ? "Restrição por páginas removida (vale o cargo)."
        : "Permissões de páginas atualizadas.",
      paginas_permitidas: valor,
    });
  } catch (error) {
    return jsonResponse(req,500, {
      error: "Erro interno na Edge Function.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
