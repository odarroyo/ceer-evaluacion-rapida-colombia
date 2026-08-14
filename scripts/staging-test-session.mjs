import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export function requireStagingEnvironment(environment = process.env) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  const baseUrl = (environment.CEER_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  if (environment.NEXT_PUBLIC_CEER_ENV !== "staging") throw new Error("This verification is restricted to NEXT_PUBLIC_CEER_ENV=staging.");
  if (!url || !publishableKey || !secretKey) throw new Error("Staging URL, publishable key, and server secret are required.");
  const parsedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) throw new Error("CEER_BASE_URL must be HTTP(S).");
  return { url, publishableKey, secretKey, baseUrl };
}

export async function sessionCookieForProfile(admin, url, publishableKey, profileId) {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profileId);
  const email = userData.user?.email;
  if (userError || !email) throw userError ?? new Error("Synthetic test profile has no email.");
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData.properties?.hashed_token;
  if (linkError || !tokenHash) throw linkError ?? new Error("Could not create a one-use staging session.");

  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verifyError || !verified.session) throw verifyError ?? new Error("Could not verify the one-use staging session.");

  let cookieJar = [];
  const serverClient = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieJar,
      setAll: (cookies) => { cookieJar = cookies; },
    },
  });
  const { error: sessionError } = await serverClient.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  if (sessionError) throw sessionError;
  return cookieJar.map(({ name, value }) => `${name}=${value}`).join("; ");
}

export async function timedFetch(url, init = {}, timeoutMs = 90_000) {
  const started = performance.now();
  try {
    const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return { response, durationMs: performance.now() - started };
  } catch (error) {
    return { error, durationMs: performance.now() - started };
  }
}

export async function runPool(count, concurrency, worker) {
  const results = new Array(count);
  let cursor = 0;
  async function consume() {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, consume));
  return results;
}

export function percentile95(durations) {
  if (!durations.length) return null;
  const ordered = [...durations].sort((left, right) => left - right);
  return Math.round(ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)]);
}
