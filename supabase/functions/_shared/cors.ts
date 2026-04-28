/**
 * CORS restrito a origens conhecidas (evita `Access-Control-Allow-Origin: *` com credenciais/invoke).
 * Em produção com domínio próprio, defina o secret `EDGE_FUNCTION_ALLOWED_ORIGINS` (lista separada por vírgulas).
 */
const DEFAULT_ORIGINS = [
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "https://rh-ambiental-sistema.vercel.app",
] as const;

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get("EDGE_FUNCTION_ALLOWED_ORIGINS") || "").trim();
  if (!raw) return [...DEFAULT_ORIGINS];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let cachedAllow: Set<string> | null = null;

function allowSet(): Set<string> {
  if (!cachedAllow) {
    cachedAllow = new Set(parseAllowedOrigins());
  }
  return cachedAllow;
}

export function resolveAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  return allowSet().has(origin) ? origin : null;
}

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = resolveAllowedOrigin(req);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

/** Responde a preflight ou `null` se não for OPTIONS. */
export function handleCorsOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  if (!resolveAllowedOrigin(req)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response("ok", { headers: corsHeadersFor(req) });
}
