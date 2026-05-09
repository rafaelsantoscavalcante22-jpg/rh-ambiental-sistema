import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

type Args = {
  name: string;
  email: string;
  password?: string;
  cargo: string;
  status: string;
};

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k?.startsWith("--")) continue;
    const key = k.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) continue;
    switch (key) {
      case "name":
        args.name = val;
        break;
      case "email":
        args.email = val;
        break;
      case "password":
        args.password = val;
        break;
      case "cargo":
        args.cargo = val;
        break;
      case "status":
        args.status = val;
        break;
      default:
        break;
    }
    i++;
  }

  const name = args.name ?? "Pateta";
  const email = args.email ?? "pateta@empresa.local";
  const cargo = args.cargo ?? "administrador";
  const status = args.status ?? "ativo";
  const password = args.password;

  return { name, email, cargo, status, password };
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function pickColumn(cols: Set<string>, candidates: string[]): string | undefined {
  return candidates.find((c) => cols.has(c));
}

function generatePassword(): string {
  // 24 chars base64url ~ 144 bits; good enough for a bootstrap admin password.
  return crypto.randomBytes(18).toString("base64url");
}

const { name, email, cargo, status, password: passwordArg } = parseArgs(
  process.argv.slice(2),
);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
if (!SUPABASE_URL) {
  throw new Error("Missing env var: SUPABASE_URL (or VITE_SUPABASE_URL)");
}
const SUPABASE_SERVICE_ROLE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const password =
  passwordArg ?? process.env.ADMIN_USER_PASSWORD ?? generatePassword();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: created, error: createErr } = await supabase.auth.admin.createUser(
  {
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  },
);

if (createErr) {
  // If it already exists, fetch and continue to profile upsert.
  const msg = String(createErr.message ?? createErr);
  const alreadyExists =
    msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists");
  if (!alreadyExists) throw createErr;
}

const userId = created?.user?.id;
if (!userId) {
  const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 2000,
  });
  if (listErr) throw listErr;
  const found = listed.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  if (!found) {
    throw new Error(
      `Could not resolve user id for ${email}. Create succeeded but user not found in listUsers.`,
    );
  }

  console.log(`Auth user already exists: ${found.id}`);

  await upsertProfile(found.id);
  printCredentials();
  process.exit(0);
}

console.log(`Auth user created: ${userId}`);

await upsertProfile(userId);
printCredentials();

async function upsertProfile(id: string) {
  const { data: colsRows, error: colsErr } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "usuarios");
  if (colsErr) throw colsErr;

  const cols = new Set(
    (colsRows ?? []).map((r: { column_name: unknown }) => String(r.column_name ?? "")),
  );

  const colNome = pickColumn(cols, ["nome", "name", "nome_completo", "nomeCompleto"]);
  const colEmail = pickColumn(cols, ["email", "email_usuario", "emailUsuario"]);
  const colCargo = pickColumn(cols, ["cargo", "role", "perfil"]);
  const colStatus = pickColumn(cols, ["status", "situacao", "ativo"]);

  const payload: Record<string, unknown> = { id };
  if (colNome) payload[colNome] = name;
  if (colEmail) payload[colEmail] = email.toLowerCase();
  if (colCargo) payload[colCargo] = cargo;
  if (colStatus) payload[colStatus] = status;

  const { error: upsertErr } = await supabase
    .from("usuarios")
    .upsert(payload, { onConflict: "id" });
  if (upsertErr) throw upsertErr;

  console.log(`Profile upserted in public.usuarios (id=${id}).`);
}

function printCredentials() {
  console.log("");
  console.log("== Admin user credentials ==");
  console.log(`name: ${name}`);
  console.log(`email: ${email}`);
  console.log(`password: ${password}`);
  console.log(`cargo: ${cargo}`);
  console.log(`status: ${status}`);
  console.log("============================");
}

