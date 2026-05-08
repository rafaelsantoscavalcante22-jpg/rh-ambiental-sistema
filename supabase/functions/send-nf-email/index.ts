import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { corsHeadersFor, handleCorsOptions } from "../_shared/cors.ts";

type Destinatario = {
  cliente_id: string;
  nome: string;
  email: string;
};

type AnexoPayload = {
  filename?: string;
  contentType?: string | null;
  contentBase64?: string;
};

type AnexoNormalizado = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

/** NF + opcional boleto (PDF) no cliente — até 5 anexos gerais + 1 boleto. */
const MAX_ANEXOS = 6;
const MAX_BYTES_POR_ANEXO = 4 * 1024 * 1024; // 4 MiB (decodificado)

type ProvedorEnvio = "outlook" | "resend";

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

function nomeAnexoSeguro(name: string): string {
  const base = String(name || "")
    .replace(/[/\\]/g, "_")
    .replace(/\.\./g, "_")
    .trim();
  return base.slice(0, 200) || "anexo";
}

function validarAnexos(raw: unknown): AnexoNormalizado[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("Campo anexos inválido: deve ser uma lista.");
  }
  if (raw.length > MAX_ANEXOS) {
    throw new Error(`No máximo ${MAX_ANEXOS} anexos por envio.`);
  }
  const out: AnexoNormalizado[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as AnexoPayload;
    const b64 = String(o.contentBase64 ?? "").replace(/\s/g, "");
    const filename = nomeAnexoSeguro(String(o.filename ?? "anexo"));
    const contentType = String(o.contentType ?? "").trim() ||
      "application/octet-stream";
    if (!b64) {
      throw new Error(`Anexo "${filename}" sem conteúdo (contentBase64).`);
    }
    let size = 0;
    try {
      const bin = atob(b64);
      size = bin.length;
    } catch {
      throw new Error(`Anexo "${filename}": Base64 inválido.`);
    }
    if (size > MAX_BYTES_POR_ANEXO) {
      throw new Error(
        `Anexo "${filename}" excede ${MAX_BYTES_POR_ANEXO / (1024 * 1024)} MiB.`,
      );
    }
    out.push({ filename, contentType, contentBase64: b64 });
  }
  return out;
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

/** Ligação SMTP Outlook — host/porta configuráveis (Microsoft pode dar timeout a partir de IPs de datacenter). */
function resolverOutlookSmtp(): { hostname: string; port: number; tls: boolean } {
  const hostname = Deno.env.get("OUTLOOK_SMTP_HOST")?.trim() ||
    "smtp-mail.outlook.com";
  const portRaw = Deno.env.get("OUTLOOK_SMTP_PORT")?.trim();
  const port = portRaw ? Number(portRaw) : 465;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Secret OUTLOOK_SMTP_PORT inválida.");
  }
  if (port === 25 || port === 587) {
    throw new Error(
      "Portas SMTP 25 e 587 estão bloqueadas nas Supabase Edge Functions. Use 465 (TLS implícito) ou defina EMAIL_PROVIDER=resend com RESEND_API_KEY.",
    );
  }
  const tlsRaw = Deno.env.get("OUTLOOK_SMTP_TLS")?.trim().toLowerCase();
  let tls: boolean;
  if (tlsRaw === "false") tls = false;
  else if (tlsRaw === "true") tls = true;
  else tls = port === 465;
  return { hostname, port, tls };
}

function resolverProvedor(): {
  provedor: ProvedorEnvio;
  outlookUser?: string;
  outlookAppPassword?: string;
  resendKey?: string;
  fromEmail: string;
  erroConfig?: string;
} {
  const pref = (Deno.env.get("EMAIL_PROVIDER")?.trim().toLowerCase() || "auto");
  const outlookUser = Deno.env.get("OUTLOOK_USER")?.trim();
  const outlookAppPassword = Deno.env.get("OUTLOOK_APP_PASSWORD")?.trim();
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const fromRaw = Deno.env.get("NF_EMAIL_FROM")?.trim();

  const temOutlook = !!(outlookUser && outlookAppPassword);
  const temResend = !!resendKey;

  const fromOutlookDefault = () =>
    fromRaw && fromRaw.includes("@") ? fromRaw : `RG Ambiental <${outlookUser}>`;
  const fromResendDefault = () =>
    fromRaw || "RG Ambiental <onboarding@resend.dev>";

  if (pref === "resend") {
    if (!temResend) {
      return {
        provedor: "resend",
        fromEmail: "",
        erroConfig:
          "EMAIL_PROVIDER=resend mas RESEND_API_KEY não está definida nos Secrets.",
      };
    }
    return {
      provedor: "resend",
      resendKey,
      fromEmail: fromResendDefault(),
    };
  }

  if (pref === "outlook") {
    if (!temOutlook) {
      return {
        provedor: "outlook",
        fromEmail: "",
        erroConfig:
          "EMAIL_PROVIDER=outlook mas OUTLOOK_USER / OUTLOOK_APP_PASSWORD incompletos.",
      };
    }
    return {
      provedor: "outlook",
      outlookUser,
      outlookAppPassword,
      fromEmail: fromOutlookDefault(),
    };
  }

  // auto — na Cloud, SMTP Outlook/Hotmail costuma ficar pendurado minutos; se existir Resend, usa HTTPS primeiro.
  if (temResend && temOutlook) {
    return {
      provedor: "resend",
      resendKey,
      fromEmail: fromResendDefault(),
    };
  }

  if (temOutlook) {
    return {
      provedor: "outlook",
      outlookUser,
      outlookAppPassword,
      fromEmail: fromOutlookDefault(),
    };
  }

  if (temResend) {
    return {
      provedor: "resend",
      resendKey,
      fromEmail: fromResendDefault(),
    };
  }

  return {
    provedor: "outlook",
    fromEmail: "",
    erroConfig:
      "Nenhum provedor de e-mail configurado. No Supabase: Edge Functions → Secrets — " +
      "Outlook: OUTLOOK_USER + OUTLOOK_APP_PASSWORD (pode dar timeout a partir do Supabase; ver EMAIL_PROVIDER). " +
      "Recomendado na Cloud: RESEND_API_KEY (com auto, Resend tem prioridade se Outlook também existir). Opcional: NF_EMAIL_FROM.",
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

  /** Respostas dos destinatários (ex.: caixa Hotmail do faturamento); o From deve ser domínio verificado na Resend. */
  const nfReplyTo = Deno.env.get("NF_EMAIL_REPLY_TO")?.trim() || null;

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
    anexos?: AnexoPayload[];
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

  let anexos: AnexoNormalizado[] = [];
  try {
    anexos = validarAnexos(body.anexos);
  } catch (e) {
    return jsonResponse(req, 400, {
      error: e instanceof Error ? e.message : "Anexos inválidos.",
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
  if (cfg.provedor === "outlook" && cfg.outlookUser && cfg.outlookAppPassword) {
    try {
      const smtpOpts = resolverOutlookSmtp();
      smtp = new SMTPClient({
        connection: {
          hostname: smtpOpts.hostname,
          port: smtpOpts.port,
          tls: smtpOpts.tls,
          auth: {
            username: cfg.outlookUser,
            password: cfg.outlookAppPassword,
          },
        },
      });
    } catch (e) {
      return jsonResponse(req, 500, {
        error: `Falha ao iniciar SMTP Outlook: ${
          e instanceof Error ? e.message : String(e)
        }`,
        code: "OUTLOOK_SMTP_INIT_FAILED",
      });
    }
  }

  const denomailerAttachments = anexos.length > 0
    ? anexos.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      encoding: "base64" as const,
      content: a.contentBase64,
    }))
    : undefined;

  const resendAttachments = anexos.length > 0
    ? anexos.map((a) => ({
      filename: a.filename,
      content: a.contentBase64,
      ...(a.contentType && a.contentType !== "application/octet-stream"
        ? { content_type: a.contentType }
        : {}),
    }))
    : undefined;

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

      if (cfg.provedor === "outlook" && smtp) {
        try {
          await smtp.send({
            from: cfg.fromEmail,
            to: email,
            subject: assunto,
            html,
            ...(nfReplyTo ? { replyTo: nfReplyTo } : {}),
            ...(denomailerAttachments
              ? { attachments: denomailerAttachments }
              : {}),
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
            detalhe: e instanceof Error ? e.message : "Falha SMTP Outlook",
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
              ...(nfReplyTo ? { reply_to: nfReplyTo } : {}),
              ...(resendAttachments ? { attachments: resendAttachments } : {}),
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

  const linhaResumo = provedor === "outlook"
    ? `[Outlook] enviados: ${okCount} · falhas: ${failCount}`
    : `[Resend] enviados: ${okCount} · falhas: ${failCount}`;
  const linhaAnexos = anexos.length > 0
    ? `Anexos: ${anexos.map((a) => a.filename).join(", ")}`
    : "";
  const observacaoLog = [observacaoUser, linhaAnexos, linhaResumo].filter(Boolean).join("\n");

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

  const msgOk = provedor === "outlook"
    ? `${okCount} e-mail(ns) enviado(s) via Outlook.`
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
