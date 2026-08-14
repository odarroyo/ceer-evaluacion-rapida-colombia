import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/constants";
import { inspectAppConfiguration } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const time = new Date().toISOString();
  const configuration = inspectAppConfiguration();
  if (!configuration.valid) {
    return NextResponse.json(
      {
        status: "error",
        version: APP_VERSION,
        mode: configuration.mode,
        backend: "configuration-error",
        issues: configuration.issues,
        time,
      },
      { status: 503, headers },
    );
  }
  if (configuration.mode === "demo") {
    return NextResponse.json(
      { status: "ok", version: APP_VERSION, mode: "demo", backend: "demo", time },
      { headers },
    );
  }

  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("municipalities")
      .select("code", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json(
      {
        status: "ok",
        version: APP_VERSION,
        mode: configuration.mode,
        backend: "supabase",
        checks: { database: "ok", municipalityCount: count ?? 0 },
        time,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        version: APP_VERSION,
        mode: configuration.mode,
        backend: "supabase",
        checks: { database: "unavailable" },
        time,
      },
      { status: 503, headers },
    );
  }
}
