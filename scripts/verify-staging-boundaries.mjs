import { createClient } from "@supabase/supabase-js";

function requireEnvironment(environment = process.env) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  if (!url || !publishableKey || !secretKey) {
    throw new Error("Staging verification requires the project URL, publishable key, and server secret.");
  }
  if (environment.NEXT_PUBLIC_CEER_ENV !== "staging") {
    throw new Error("Remote boundary verification is restricted to NEXT_PUBLIC_CEER_ENV=staging.");
  }
  return { url, publishableKey, secretKey };
}

async function clientForProfile(admin, url, publishableKey, profileId) {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profileId);
  const email = userData.user?.email;
  if (userError || !email) throw userError ?? new Error("The synthetic test user has no email.");

  // Generate, but do not send or print, a one-use link for the existing synthetic user.
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData.properties?.hashed_token;
  if (linkError || !tokenHash) throw linkError ?? new Error("Could not create a synthetic verification session.");

  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sessionError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (sessionError) throw sessionError;
  return client;
}

async function signedPhotoCheck(client, storagePath, shouldSucceed) {
  const { data, error } = await client.storage.from("inspection-photos").createSignedUrl(storagePath, 300);
  if (shouldSucceed) {
    if (error || !data?.signedUrl) throw error ?? new Error("Authorized role could not sign the photo URL.");
    const response = await fetch(data.signedUrl);
    if (!response.ok) throw new Error(`Authorized signed photo returned HTTP ${response.status}.`);
    return true;
  }
  if (!error || data?.signedUrl) throw new Error("Unrelated inspector unexpectedly signed another inspector's photo URL.");
  return false;
}

async function main() {
  const { url, publishableKey, secretKey } = requireEnvironment();
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: inspections, error: inspectionError }, { data: profiles, error: profileError }] = await Promise.all([
    admin.from("inspections").select("id,receipt_code,inspector_id,status").eq("status", "submitted").order("submitted_at", { ascending: false }),
    admin.from("profiles").select("id,role,active,must_change_password").eq("active", true),
  ]);
  if (inspectionError) throw inspectionError;
  if (profileError) throw profileError;
  const coordinator = profiles?.find((profile) => profile.role === "super_admin" || profile.role === "coordinator");
  const target = inspections?.find((inspection) => profiles?.some(
    (profile) => profile.id === inspection.inspector_id && profile.role === "inspector" && profile.active,
  ));
  if (!target) throw new Error("Create a synthetic inspection while signed in as an active inspector before running this check.");
  const owner = profiles?.find((profile) => profile.id === target.inspector_id && profile.role === "inspector");
  const otherInspector = profiles?.find((profile) => profile.role === "inspector" && profile.id !== target.inspector_id);
  if (!coordinator || !owner) throw new Error("The coordinator or owning inspector profile is missing.");
  if (!otherInspector) throw new Error("Create a second active synthetic inspector before running this check.");
  if (owner.must_change_password) throw new Error("The owning inspector has not completed the forced password change.");

  const { data: photos, error: photoError } = await admin
    .from("inspection_photos")
    .select("storage_path")
    .eq("inspection_id", target.id);
  if (photoError) throw photoError;
  const storagePath = photos?.[0]?.storage_path;
  if (!storagePath) throw new Error("The target synthetic inspection has no photo.");

  const [ownerClient, coordinatorClient, otherClient] = await Promise.all([
    clientForProfile(admin, url, publishableKey, owner.id),
    clientForProfile(admin, url, publishableKey, coordinator.id),
    clientForProfile(admin, url, publishableKey, otherInspector.id),
  ]);

  const [ownerRows, coordinatorRows, otherRows] = await Promise.all([
    ownerClient.from("inspections").select("id").eq("id", target.id),
    coordinatorClient.from("inspections").select("id").eq("id", target.id),
    otherClient.from("inspections").select("id").eq("id", target.id),
  ]);
  if (ownerRows.error || ownerRows.data?.length !== 1) throw ownerRows.error ?? new Error("Owner cannot read the inspection.");
  if (coordinatorRows.error || coordinatorRows.data?.length !== 1) throw coordinatorRows.error ?? new Error("Coordinator cannot read the inspection.");
  if (otherRows.error || otherRows.data?.length !== 0) throw otherRows.error ?? new Error("Unrelated inspector can read the inspection.");

  const publicUrl = `${url}/storage/v1/object/public/inspection-photos/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  const publicResponse = await fetch(publicUrl);
  if (publicResponse.ok) throw new Error("The private inspection photo is publicly readable.");

  const [ownerSigned, coordinatorSigned, otherSigned] = await Promise.all([
    signedPhotoCheck(ownerClient, storagePath, true),
    signedPhotoCheck(coordinatorClient, storagePath, true),
    signedPhotoCheck(otherClient, storagePath, false),
  ]);

  console.log(JSON.stringify({
    status: "ok",
    receiptCode: target.receipt_code,
    inspectionVisibility: { owner: 1, coordinator: 1, unrelatedInspector: 0 },
    photo: {
      publicDenied: true,
      ownerSigned,
      coordinatorSigned,
      unrelatedInspectorSigned: otherSigned,
      signedLifetimeSeconds: 300,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Remote staging verification failed.");
  process.exitCode = 1;
});
