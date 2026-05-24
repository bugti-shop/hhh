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

    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return json({ error: "Missing authorization code" }, 400);
    }

    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientSecret) {
      return json({ error: "Google client secret is not configured" }, 500);
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        redirect_uri: "",
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("[google-exchange] token exchange failed", data);
      return json({ error: data.error_description || data.error || "Token exchange failed" }, tokenRes.status);
    }

    if (data.refresh_token) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      );

      const { error: upsertError } = await admin.from("user_refresh_tokens").upsert(
        { user_id: user.id, google_refresh_token: data.refresh_token },
        { onConflict: "user_id" },
      );

      if (upsertError) {
        console.error("[google-exchange] failed to save refresh token", upsertError);
      }
    }

    return json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type,
    });
  } catch (error) {
    console.error("[google-exchange] unexpected error", error);
    return json({ error: "An unexpected error occurred" }, 500);
  }
});