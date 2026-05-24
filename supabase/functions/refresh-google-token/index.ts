import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = "425291387152-u06impgmsgg286jg7odo4f40fu6pjmb5.apps.googleusercontent.com";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getAuthedUser = async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader === "Bearer ") return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getAuthedUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    let refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    if (!refreshToken) {
      const { data, error } = await admin
        .from("user_refresh_tokens")
        .select("google_refresh_token")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[refresh-google-token] failed to load stored token", error);
      }

      refreshToken = data?.google_refresh_token ?? "";
    }

    if (!refreshToken) {
      return json({ error: "No refresh token available" }, 400);
    }

    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientSecret) {
      return json({ error: "Google client secret is not configured" }, 500);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("[refresh-google-token] refresh failed", data);
      return json({ error: data.error_description || data.error || "Token refresh failed" }, tokenRes.status);
    }

    const rotatedRefreshToken = typeof data.refresh_token === "string" ? data.refresh_token : undefined;
    if (rotatedRefreshToken) {
      const { error: upsertError } = await admin.from("user_refresh_tokens").upsert(
        { user_id: user.id, google_refresh_token: rotatedRefreshToken },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        console.error("[refresh-google-token] failed to persist rotated token", upsertError);
      }
    }

    return json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: rotatedRefreshToken,
      scope: data.scope,
      token_type: data.token_type,
    });
  } catch (error) {
    console.error("[refresh-google-token] unexpected error", error);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});