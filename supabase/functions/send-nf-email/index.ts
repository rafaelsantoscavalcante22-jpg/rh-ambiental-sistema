import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { corsHeadersFor, handleCorsOptions } from "../_shared/cors.ts";

type Destinatario = {
  cliente_id: string;
  nome: string;
  email: string;
};

type ProvedorEnvio = "gmail" | "resend";

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeadersFor(req),
  });
}

function normalizarCargo(s: string | null | undefined): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Espelha cargoPodeMutarFaturamentoFluxo (src/lib/workflowPermissions). */
function podeEnviarNf(cargo: string | null | undefined): boolean {
  const c = normalizarCargo(cargo);
  if (c.includes("visualizador")) return false;
  if (!c) return false;
  if (c.includes("administrador")) return true;
  return (
    c.includes("faturamento") ||
    c.includes("financeiro") ||
    c.includes("diretoria")
  );
}

function montarHtmlCorpo(nome: string, observacaoUser: string): string {
  return `
<p>Olá${nome ? `, ${nome}` : ""},</p>
<p>Esta mensagem refere-se ao envio de documentação / nota fiscal da <strong>RG Ambiental</strong>.</p>
${observacaoUser ? `<p><strong>Observação:</strong> ${observacaoUser.replace(/</g, "&lt;")}</p>` : ""}
<p>Em anexo ou link oficial deve ser utilizado o canal acordado com o financeiro (esta é uma notificação automática).</p>
<p>Atenciosamente,<br/>RG Ambiental</p>
`.trim();
}

function resolverProvedor(): {
  provedor: ProvedorEnvio;
  gmailUser?: string;
  gmailAppPassword?: string;
  resendKey?: string;
  fromEmail: string;
  erroConfig?: string;
} {
  const gmailUser = Deno.env.get("GMAIL_USER")?.trim();
  const gmailAppPassword = Deno.env.get("GMAIL_APP_PASSWORD")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const fromRaw = Deno.env.get("NF_EMAIL_FROM")?.trim();

  if (gmailUser && gmailAppPassword) {
    const fromEmail = fromRaw && fromRaw.includes("@")
      ? fromRaw
      : `RG Ambiental <${gmailUser}>`;
    return { provedor: "gmail", gmailUser, gmailAppPassword, fromEmail };
  }

  if (resendKey) {
    const fromEmail = fromRaw ||
      "RG Ambiental <onboarding@resend.dev>";
    return { provedor: "resend", resendKey, fromEmail };
  }

  return {
    provedor: "gmail",
    fromEmail: "",
    erroConfig:
      "Nenhum provedor de e-mail configurado. No Supabase: Edge Functions → Secrets — " +
      "opção A (Gmail): GMAIL_USER (conta Gmail/Google Workspace) e GMAIL_APP_PASSWORD (senha de app de 16 caracteres, com 2FA ativo). " +
      "opção B (Resend): RESEND_API_KEY. Opcional: NF_EMAIL_FROM (ex.: RG Ambiental <nf@dominio.com>).",
  };
}

Deno.serve(async (req: Request) => {
  const corsEarly = handleCorsOptions(req);
  if (corsEarly) return corsEarly;

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Método não permitido." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(req,500, { error: "Variáveis do Supabase não encontradas." });
  }

  const cfg = resolverProvedor();
  if (cfg.erroConfig) {
    return jsonResponse(req,503, {
      error: cfg.erroConfig,
      code: "EMAIL_PROVIDER_NOT_CONFIGURED",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(req,401, { error: "Token de autorização não enviado." });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return jsonResponse(req,401, { error: "Token inválido." });
  }

  let body: {
    destinatarios?: Destinatario[];
    observacao?: string | null;
    assunto?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(req,400, { error: "Body inválido. Envie JSON válido." });
  }

  const destinatarios = Array.isArray(body?.destinatarios)
    ? body.destinatarios as Destinatario[]
    : [];

  if (destinatarios.length === 0) {
    return jsonResponse(req,400, { error: "Informe ao menos um destinatário." });
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return jsonResponse(req,401, { error: "Sessão inválida ou expirada." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: perfil, error: perfilErr } = await admin
    .from("usuarios")
    .select("cargo")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (perfilErr) {
    return jsonResponse(req,500, { error: perfilErr.message });
  }

  if (!podeEnviarNf(perfil?.cargo ?? null)) {
    return jsonResponse(req,403, {
      error:
        "Sem permissão para envio de NF. Perfis: Administrador, Faturamento, Financeiro ou Diretoria.",
    });
  }

  const observacaoUser = body.observacao != null
    ? String(body.observacao).trim()
    : "";
  const assunto = (body.assunto != null && String(body.assunto).trim())
    ? String(body.assunto).trim()
    : "Nota fiscal — RG Ambiental";

  const resultados: {
    cliente_id: string;
    nome: string;
    email: string;
    ok: boolean;
    detalhe?: string;
  }[] = [];

  let smtp: SMTPClient | null = null;
  if (cfg.provedor === "gmail" && cfg.gmailUser && cfg.gmailAppPassword) {
    try {
      smtp = new SMTPClient({
        connection: {
          hostname: "smtp.gmail.com",
          port: 465,
          tls: true,
          auth: {
            username: cfg.gmailUser,
            password: cfg.gmailAppPassword,
          },
        },
      });
    } catch (e) {
      return jsonResponse(req,500, {
        error: `Falha ao iniciar SMTP Gmail: ${
          e instanceof Error ? e.message : String(e)
        }`,
        code: "GMAIL_SMTP_INIT_FAILED",
      });
    }
  }

  try {
    for (const d of destinatarios) {
      const email = String(d.email || "").trim();
      const nome = String(d.nome || "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        resultados.push({
          cliente_id: String(d.cliente_id || ""),
          nome,
          email,
          ok: false,
          detalhe: "E-mail inválido.",
        });
        continue;
      }

      const html = montarHtmlCorpo(nome, observacaoUser);

      if (cfg.provedor === "gmail" && smtp) {
        try {
          await smtp.send({
            from: cfg.fromEmail,
            to: email,
            subject: assunto,
            html,
          });
          resultados.push({
            cliente_id: String(d.cliente_id || ""),
            nome,
            email,
            ok: true,
          });
        } catch (e) {
          resultados.push({
            cliente_id: String(d.cliente_id || ""),
            nome,
            email,
            ok: false,
            detalhe: e instanceof Error ? e.message : "Falha SMTP Gmail",
          });
        }
        continue;
      }

      if (cfg.provedor === "resend" && cfg.resendKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${cfg.resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: cfg.fromEmail,
              to: [email],
              subject: assunto,
              html,
            }),
          });

          const payload = await res.json().catch(() => ({}));

          if (!res.ok) {
            const msg = (payload as { message?: string })?.message ||
              `HTTP ${res.status}`;
            resultados.push({
              cliente_id: String(d.cliente_id || ""),
              nome,
              email,
              ok: false,
              detalhe: msg,
            });
          } else {
            resultados.push({
              cliente_id: String(d.cliente_id || ""),
              nome,
              email,
              ok: true,
            });
          }
        } catch (e) {
          resultados.push({
            cliente_id: String(d.cliente_id || ""),
            nome,
            email,
            ok: false,
            detalhe: e instanceof Error ? e.message : "Falha de rede",
          });
        }
      }
    }
  } finally {
    if (smtp) {
      try {
        await Promise.resolve(smtp.close());
      } catch {
        /* ignore */
      }
    }
  }

  const okCount = resultados.filter((r) => r.ok).length;
  const failCount = resultados.length - okCount;
  const provedor = cfg.provedor;
  const modo = failCount === 0
    ? provedor
    : okCount === 0
    ? `${provedor}_falha`
    : `${provedor}_parcial`;

  const linhaResumo = provedor === "gmail"
    ? `[Gmail] enviados: ${okCount} · falhas: ${failCount}`
    : `[Resend] enviados: ${okCount} · falhas: ${failCount}`;
  const observacaoLog = [observacaoUser, linhaResumo].filter(Boolean).join("\n");

  const { data: logInsert, error: logErr } = await admin
    .from("nf_envios_log")
    .insert({
      modo,
      destinatarios: resultados,
      total_destinatarios: destinatarios.length,
      observacao: observacaoLog || null,
      created_by: userData.user.id,
    })
    .select("id")
    .maybeSingle();

  if (logErr) {
    return jsonResponse(req,500, {
      error: `E-mails processados, mas falhou o registo no histórico: ${logErr.message}`,
      resultados,
      okCount,
      failCount,
    });
  }

  const nfEnvioLogId = logInsert && typeof logInsert === "object" && "id" in logInsert
    ? String((logInsert as { id: string }).id)
    : null;

  const msgOk = provedor === "gmail"
    ? `${okCount} e-mail(ns) enviado(s) via Gmail.`
    : `${okCount} e-mail(ns) enviado(s) via Resend.`;

  return jsonResponse(req,200, {
    message:
      failCount === 0
        ? msgOk
        : `${okCount} enviado(s), ${failCount} falha(s). Ver histórico para detalhes.`,
    okCount,
    failCount,
    modo,
    provedor,
    nfEnvioLogId,
    resultados,
  });
});
