import { randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { MAX_IMPORT_BYTES } from "@/lib/constants";
import { requireSupabaseConfiguration } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const rosterRow = z.object({
  email: z.email(),
  fullName: z.string().trim().min(2).max(160),
  affiliation: z.string().trim().min(2).max(160),
});

const lifecycleRequest = z.object({
  userId: z.uuid(),
  action: z.enum(["deactivate", "reactivate", "reset_password"]),
});

type Role = "inspector" | "coordinator" | "super_admin";

function temporaryPassword() {
  return `Atc!${randomBytes(12).toString("base64url")}9a`;
}

function canManageTarget(actorRole: Role, targetRole: Role) {
  if (actorRole === "coordinator") return targetRole === "inspector";
  return actorRole === "super_admin" && targetRole !== "super_admin";
}

async function authorizedCoordinator() {
  const profile = await getCurrentProfile();
  if (!profile || profile.mustChangePassword || profile.role === "inspector") return null;
  try {
    requireSupabaseConfiguration();
  } catch {
    return null;
  }
  return profile;
}

async function readRoster(file: File) {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const delimiter = lines[0]?.includes(";") ? ";" : ",";
    const headers = lines[0]?.split(delimiter).map((item) => item.trim().toLowerCase()) ?? [];
    return lines.slice(1).map((line) => {
      const values = line.split(delimiter).map((item) => item.trim());
      return {
        email: values[headers.indexOf("email")],
        fullName: values[headers.indexOf("nombre")],
        affiliation: values[headers.indexOf("afiliacion")],
      };
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) =>
    headers.set(cell.text.trim().toLowerCase(), column),
  );
  return Array.from({ length: Math.max(0, sheet.actualRowCount - 1) }, (_, index) => ({
    email: sheet.getRow(index + 2).getCell(headers.get("email") ?? 0).text.trim(),
    fullName: sheet.getRow(index + 2).getCell(headers.get("nombre") ?? 0).text.trim(),
    affiliation: sheet.getRow(index + 2).getCell(headers.get("afiliacion") ?? 0).text.trim(),
  })).filter((row) => row.email || row.fullName || row.affiliation);
}

export async function GET() {
  const profile = await authorizedCoordinator();
  if (!profile) return NextResponse.json({ error: "Acceso de coordinación requerido." }, { status: 403 });
  const admin = createAdminClient();
  let query = admin
    .from("profiles")
    .select("id,email,full_name,affiliation,role,active,must_change_password,created_at,updated_at");
  if (profile.role === "coordinator") query = query.eq("role", "inspector");
  const { data, error } = await query
    .order("full_name", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "No fue posible listar las cuentas." }, { status: 500 });
  return NextResponse.json({
    accounts: (data ?? []).map((account) => ({
      id: account.id,
      email: account.email,
      fullName: account.full_name,
      affiliation: account.affiliation,
      role: account.role,
      active: account.active,
      mustChangePassword: account.must_change_password,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    })),
  });
}

export async function POST(request: Request) {
  const profile = await authorizedCoordinator();
  if (!profile) return NextResponse.json({ error: "Acceso de coordinación requerido." }, { status: 403 });
  const form = await request.formData();
  const roster = form.get("roster");
  const hasRoster = roster instanceof File && roster.size > 0;
  if (hasRoster && !/\.(?:csv|xlsx)$/i.test(roster.name)) {
    return NextResponse.json({ error: "El roster debe ser un archivo CSV o XLSX." }, { status: 422 });
  }
  if (hasRoster && roster.size > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "El roster supera 10 MB." }, { status: 413 });
  }
  let candidates;
  try {
    candidates = hasRoster
      ? await readRoster(roster)
      : [{
        email: String(form.get("email") ?? ""),
        fullName: String(form.get("fullName") ?? ""),
        affiliation: String(form.get("affiliation") ?? ""),
      }];
  } catch {
    return NextResponse.json({ error: "No fue posible leer el roster." }, { status: 422 });
  }
  if (candidates.length === 0 || candidates.length > 500) {
    return NextResponse.json({ error: "El roster debe contener entre 1 y 500 personas." }, { status: 422 });
  }

  const parsed = candidates.map((candidate, index) => ({ index: index + 2, result: rosterRow.safeParse(candidate) }));
  const issues = parsed.flatMap(({ index, result }) => result.success
    ? []
    : result.error.issues.map((issue) => ({ row: index, column: String(issue.path[0]), message: issue.message })));
  if (issues.length) {
    return NextResponse.json({ error: "Corrija el roster; no se creó ninguna cuenta.", report: issues }, { status: 422 });
  }
  const uniqueEmails = new Set(parsed.map(({ result }) => result.success ? result.data.email.toLowerCase() : ""));
  if (uniqueEmails.size !== parsed.length) {
    return NextResponse.json({ error: "El roster contiene correos duplicados." }, { status: 422 });
  }

  const admin = createAdminClient();
  const created: Array<{ id: string; email: string; fullName: string; temporaryPassword: string }> = [];
  try {
    for (const item of parsed) {
      if (!item.result.success) continue;
      const password = temporaryPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email: item.result.data.email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: item.result.data.fullName,
          affiliation: item.result.data.affiliation,
          role: "inspector",
          must_change_password: true,
        },
      });
      if (error || !data.user) throw new Error(`No se pudo crear ${item.result.data.email}.`);
      created.push({ id: data.user.id, email: item.result.data.email, fullName: item.result.data.fullName, temporaryPassword: password });
    }
    const { error: auditError } = await admin.from("audit_events").insert(
      created.map((user) => ({ actor_id: profile.id, event_type: "account.created", entity_type: "profile", entity_id: user.id, metadata: { role: "inspector" } })),
    );
    if (auditError) throw new Error("No se pudo registrar la auditoría del lote.");
    return NextResponse.json({
      created: created.map((user) => ({ email: user.email, fullName: user.fullName, temporaryPassword: user.temporaryPassword })),
      warning: "Las contraseñas se muestran una sola vez.",
    });
  } catch (error) {
    for (const user of created.reverse()) {
      await admin.from("profiles").delete().eq("id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
    return NextResponse.json({
      error: error instanceof Error ? `${error.message} Se revirtieron las cuentas creadas en este lote.` : "No se creó ninguna cuenta.",
    }, { status: 422 });
  }
}

export async function PATCH(request: Request) {
  const profile = await authorizedCoordinator();
  if (!profile) return NextResponse.json({ error: "Acceso de coordinación requerido." }, { status: 403 });
  const parsed = lifecycleRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud de cuenta inválida." }, { status: 422 });
  if (parsed.data.userId === profile.id) {
    return NextResponse.json({ error: "No puede administrar su propia cuenta desde esta pantalla." }, { status: 422 });
  }

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,email,full_name,role,active")
    .eq("id", parsed.data.userId)
    .maybeSingle();
  if (targetError || !target) return NextResponse.json({ error: "La cuenta no existe." }, { status: 404 });
  if (!canManageTarget(profile.role, target.role)) {
    return NextResponse.json({ error: "No tiene permiso para administrar esa cuenta." }, { status: 403 });
  }
  if (parsed.data.action === "reset_password" && !target.active) {
    return NextResponse.json({ error: "Reactive la cuenta para emitir una nueva contraseña temporal." }, { status: 422 });
  }

  const supabase = await createClient();
  const { error: lifecycleError } = await supabase.rpc("manage_account_lifecycle", {
    target_user_id: parsed.data.userId,
    requested_action: parsed.data.action,
  });
  if (lifecycleError) return NextResponse.json({ error: "No fue posible registrar el cambio de cuenta." }, { status: 422 });

  const password = parsed.data.action === "deactivate" ? undefined : temporaryPassword();
  const attributes = parsed.data.action === "deactivate"
    ? { ban_duration: "876000h" }
    : { ban_duration: "none", password };
  const { error: providerError } = await admin.auth.admin.updateUserById(parsed.data.userId, attributes);
  if (providerError) {
    return NextResponse.json({
      error: parsed.data.action === "deactivate"
        ? "La base de datos bloqueó la cuenta, pero el proveedor de identidad no confirmó el cierre de sesiones. Escale a soporte."
        : "El cambio quedó bloqueado para revisión; el proveedor no emitió la contraseña temporal.",
    }, { status: 502 });
  }

  return NextResponse.json({
    account: { id: target.id, email: target.email, fullName: target.full_name, active: parsed.data.action !== "deactivate", mustChangePassword: true },
    temporaryPassword: password,
    warning: password ? "La contraseña se muestra una sola vez." : undefined,
  });
}
