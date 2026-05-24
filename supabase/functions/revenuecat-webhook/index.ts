// RevenueCat Webhook Handler
// Receives subscription events from RevenueCat and updates user_entitlements table
// Realtime push to client happens automatically via Supabase Realtime on the table

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RC_WEBHOOK_AUTH = Deno.env.get("RC_WEBHOOK_AUTH") || ""; // optional shared secret

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Events that REVOKE access immediately (no grace period for user-initiated cancels)
const REVOKE_EVENTS = new Set([
  "EXPIRATION",
  "CANCELLATION", // user cancelled in store — revoke instantly, no grace
  "SUBSCRIPTION_PAUSED",
  "TRANSFER", // moved to another app_user_id
]);

// Events that GRANT access
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

// Billing issue — keep access until grace period ends
const BILLING_ISSUE_EVENTS = new Set([
  "BILLING_ISSUE",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // REQUIRED: validate shared secret in Authorization header — no silent fallback
    if (!RC_WEBHOOK_AUTH) {
      console.error("[RC Webhook] RC_WEBHOOK_AUTH not configured — refusing all requests");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${RC_WEBHOOK_AUTH}`) {
      console.warn("[RC Webhook] Unauthorized request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const event = body?.event;

    if (!event) {
      return new Response(JSON.stringify({ error: "Missing event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventType: string = event.type;
    const appUserId: string = event.app_user_id || event.original_app_user_id;
    const productId: string | null = event.product_id || null;
    const store: string | null = event.store || null; // PLAY_STORE / APP_STORE / STRIPE
    const expirationAtMs: number | null = event.expiration_at_ms || null;
    const gracePeriodExpirationAtMs: number | null = event.grace_period_expiration_at_ms || null;

    if (!appUserId) {
      return new Response(JSON.stringify({ error: "Missing app_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[RC Webhook] ${eventType} for ${appUserId} (product: ${productId})`);

    // Determine active state
    let isActive = false;
    let inBillingRetry = false;

    if (GRANT_EVENTS.has(eventType)) {
      isActive = true;
    } else if (BILLING_ISSUE_EVENTS.has(eventType)) {
      // Keep active during grace period
      isActive = gracePeriodExpirationAtMs ? gracePeriodExpirationAtMs > Date.now() : true;
      inBillingRetry = true;
    } else if (REVOKE_EVENTS.has(eventType)) {
      // User-initiated cancellation OR expiration → revoke instantly, no grace period
      // Distinguish from billing issues (which DO get grace via BILLING_ISSUE_EVENTS above)
      const cancelReason: string | null = event.cancel_reason || null;
      console.log(`[RC Webhook] Revoking access for ${appUserId} — reason: ${cancelReason || 'none'}`);
      isActive = false;
    } else {
      // Unknown event — preserve existing state by re-fetching
      const { data: existing } = await supabase
        .from("user_entitlements")
        .select("is_active")
        .eq("app_user_id", appUserId)
        .maybeSingle();
      isActive = existing?.is_active ?? false;
    }

    const payload = {
      app_user_id: appUserId,
      is_active: isActive,
      product_id: productId,
      store,
      expires_at: expirationAtMs ? new Date(expirationAtMs).toISOString() : null,
      grace_period_expires_at: gracePeriodExpirationAtMs
        ? new Date(gracePeriodExpirationAtMs).toISOString()
        : null,
      in_billing_retry: inBillingRetry,
      last_event_type: eventType,
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("user_entitlements")
      .upsert(payload, { onConflict: "app_user_id" });

    if (error) {
      console.error("[RC Webhook] Upsert error:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, isActive }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[RC Webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
