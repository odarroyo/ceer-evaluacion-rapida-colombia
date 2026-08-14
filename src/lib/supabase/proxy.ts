import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { inspectAppConfiguration } from "@/lib/environment";

export async function updateSession(request: NextRequest) {
  const configuration = inspectAppConfiguration();
  if (!configuration.valid) {
    if (request.nextUrl.pathname.startsWith("/api/health")) {
      return NextResponse.next({ request });
    }
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "La configuración del servidor está incompleta.",
          issues: configuration.issues,
        },
        { status: 503 },
      );
    }
    return new NextResponse(
      `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Configuración incompleta</title><body style="margin:0;background:#f3f6f5;color:#15292f;font:16px system-ui"><main style="max-width:700px;margin:10vh auto;padding:32px"><h1>Configuración incompleta</h1><p>La aplicación no entró en modo demostración porque se detectó una configuración parcial de Supabase.</p><ul>${configuration.issues.map((issue) => `<li>${issue}</li>`).join("")}</ul><p>Revise <code>.env.local</code> y reinicie el servidor.</p></main></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  if (configuration.mode === "demo") return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    configuration.supabase.url,
    configuration.supabase.publishableKey,
    {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const publicPath = request.nextUrl.pathname === "/login";
  if (!data?.claims && !publicPath && !request.nextUrl.pathname.startsWith("/api/health")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // Always allow /login. A deactivated account can still carry an unexpired
  // access-token cookie, and redirecting solely on claims would create a loop
  // with the database-backed active-profile check.
  return response;
}
