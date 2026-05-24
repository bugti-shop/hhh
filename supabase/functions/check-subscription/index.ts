import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Product IDs to plan type mapping (fallback for direct Stripe check)
const PRODUCT_TO_PLAN: Record<string, string> = {
  prod_UFxq1E9sWWYyYP: "weekly",
  prod_UFxuZOFIvhkpxr: "monthly",
  prod_UFxvRW5CagcDV1: "yearly",
};

// After trial/period ends and payment fails, give user 2 days max before forcing them to free
const GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const normalizeEmail = (email?: string | null) => {
  if (!email || typeof email !== "string" || !email.includes("@")) return null;
  return email.trim().toLowerCase();
};

const safeTimestamp = (v: unknown): string | null => {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return new Date(v * 1000).toISOString();
  }
  return null;
};

const getSubscriptionState = (subscription: Stripe.Subscription) => {
  const planType = PRODUCT_TO_PLAN[subscription.items.data[0].price.product as string] || "unknown";
  const subscriptionEnd = safeTimestamp(subscription.current_period_end);
  const isTrialing = subscription.status === "trialing";
  const periodEndMs = typeof subscription.current_period_end === "number" ? subscription.current_period_end * 1000 : 0;
  const isGracePeriod =
    subscription.status === "past_due" && periodEndMs > 0 && Date.now() < periodEndMs + GRACE_PERIOD_MS;

  return {
    subscribed: subscription.status === "active" || isTrialing || isGracePeriod,
    planType,
    subscriptionEnd,
    isTrialing,
    isGracePeriod,
    status: subscription.status,
  };
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    let requestBody: { email?: string; session_id?: string } = {};
    try {
      requestBody = await req.json();
    } catch {}

    const checkoutSessionId = typeof requestBody.session_id === "string"
      ? requestBody.session_id.trim()
      : "";

    let userEmail: string | null = null;

    // Try auth first
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader !== "Bearer ") {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (!userError && userData.user?.email) {
          userEmail = userData.user.email;
        }
      } catch {}
    }

    // SECURITY: Do NOT fall back to a bare email from the request body.
    // Direct subscription lookups require a verified JWT. The session_id
    // path below is the only unauthenticated lookup we allow because it
    // requires possession of a Stripe checkout session ID.

    if (checkoutSessionId) {
      logStep("Checking subscription via checkout session", { sessionId: checkoutSessionId });

      const checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
        expand: ["subscription"],
      });

      const sessionEmail = normalizeEmail(
        checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? null
      );

      if (sessionEmail) {
        userEmail = sessionEmail;
      }

      if (checkoutSession.subscription) {
        const subscription = typeof checkoutSession.subscription === "string"
          ? await stripe.subscriptions.retrieve(checkoutSession.subscription)
          : checkoutSession.subscription;

        const subscriptionState = getSubscriptionState(subscription);

        if (subscriptionState.subscribed) {
          logStep("Checkout session subscription verified", {
            status: subscriptionState.status,
            planType: subscriptionState.planType,
          });

          if (userEmail) {
            await supabaseAdmin.from("subscriptions").upsert({
              user_email: userEmail,
              stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
              stripe_subscription_id: subscription.id,
              plan_type: subscriptionState.planType,
              status: subscription.status,
              is_trialing: subscriptionState.isTrialing,
              current_period_start: safeTimestamp(subscription.current_period_start),
              current_period_end: subscriptionState.subscriptionEnd,
              cancel_at_period_end: subscription.cancel_at_period_end,
            }, { onConflict: "stripe_subscription_id" }).then(({ error }) => {
              if (error) logStep("Warning: failed to sync checkout session subscription", { error });
            });
          }

          return jsonResponse({
            subscribed: true,
            plan_type: subscriptionState.planType,
            subscription_end: subscriptionState.subscriptionEnd,
            is_trialing: subscriptionState.isTrialing,
            is_grace_period: subscriptionState.isGracePeriod,
            subscription_status: subscriptionState.status,
            customer_email: userEmail,
          });
        }

        logStep("Checkout session found but subscription not active yet", {
          status: subscriptionState.status,
        });
      }
    }

    if (!userEmail) {
      return jsonResponse({ subscribed: false, error: "No email provided" });
    }

    const normalizedEmail = userEmail.toLowerCase();
    logStep("Checking subscription for", { email: normalizedEmail });

    // 1. Check local DB first (populated by webhook)
    // Check active/trialing first
    const { data: dbSub, error: dbError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_email", normalizedEmail)
      .in("status", ["active", "trialing"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!dbError && dbSub) {
      logStep("Found active subscription in DB", { plan: dbSub.plan_type, status: dbSub.status });
      return jsonResponse({
        subscribed: true,
        plan_type: dbSub.plan_type,
        subscription_end: dbSub.current_period_end,
        is_trialing: dbSub.is_trialing,
        subscription_status: dbSub.status,
        customer_email: normalizedEmail,
      });
    }

    // Check past_due with 3-day grace period
    const { data: pastDueSub } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_email", normalizedEmail)
      .eq("status", "past_due")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pastDueSub && pastDueSub.current_period_end) {
      const periodEnd = new Date(pastDueSub.current_period_end).getTime();
      const now = Date.now();
      if (now < periodEnd + GRACE_PERIOD_MS) {
        logStep("Past-due subscription within grace period", { plan: pastDueSub.plan_type, periodEnd: pastDueSub.current_period_end });
        return jsonResponse({
          subscribed: true,
          plan_type: pastDueSub.plan_type,
          subscription_end: pastDueSub.current_period_end,
          is_trialing: false,
          is_grace_period: true,
          subscription_status: pastDueSub.status,
          customer_email: normalizedEmail,
        });
      }
      logStep("Past-due grace expired — cancelling Stripe subscription to stop retries");
      try {
        await stripe.subscriptions.cancel(pastDueSub.stripe_subscription_id);
      } catch (e) {
        logStep("Warning: failed to cancel past-due subscription", { error: String(e) });
      }
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", pastDueSub.stripe_subscription_id);
      return jsonResponse({ subscribed: false, subscription_status: "canceled", customer_email: normalizedEmail });
    }

    // 2. Fallback: check Stripe API directly (for cases where webhook hasn't fired yet)
    logStep("No DB record, checking Stripe API directly");
    const customers = await stripe.customers.list({ email: normalizedEmail, limit: 1 });

    if (customers.data.length === 0) {
      logStep("No Stripe customer found");
      return jsonResponse({ subscribed: false });
    }

    const customerId = customers.data[0].id;

    const [activeSubs, trialingSubs, pastDueSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 1 }),
      stripe.subscriptions.list({ customer: customerId, status: "past_due", limit: 1 }),
    ]);

    const allSubs = [...activeSubs.data, ...trialingSubs.data];
    
    // Check past_due with grace period — cancel if expired so retries stop
    if (allSubs.length === 0 && pastDueSubs.data.length > 0) {
      const pdSub = pastDueSubs.data[0];
      const periodEnd = pdSub.current_period_end * 1000;
      if (Date.now() < periodEnd + GRACE_PERIOD_MS) {
        allSubs.push(pdSub);
      } else {
        logStep("Stripe past-due grace expired — cancelling subscription");
        try {
          await stripe.subscriptions.cancel(pdSub.id);
        } catch (e) {
          logStep("Warning: failed to cancel past-due subscription", { error: String(e) });
        }
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", pdSub.id);
      }
    }

    if (allSubs.length === 0) {
      logStep("No active Stripe subscription");
      return jsonResponse({ subscribed: false });
    }

    const subscription = allSubs[0];
    const subscriptionState = getSubscriptionState(subscription);

    logStep("Found active Stripe subscription", { planType: subscriptionState.planType, status: subscription.status });

    // Sync to DB for faster future lookups
    const record = {
      user_email: normalizedEmail,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan_type: subscriptionState.planType,
      status: subscription.status,
      is_trialing: subscriptionState.isTrialing,
      current_period_start: safeTimestamp(subscription.current_period_start),
      current_period_end: subscriptionState.subscriptionEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
    };

    await supabaseAdmin
      .from("subscriptions")
      .upsert(record, { onConflict: "stripe_subscription_id" })
      .then(({ error }) => {
        if (error) logStep("Warning: failed to sync to DB", { error });
      });

    return jsonResponse({
      subscribed: true,
      plan_type: subscriptionState.planType,
      subscription_end: subscriptionState.subscriptionEnd,
      is_trialing: subscriptionState.isTrialing,
      is_grace_period: subscriptionState.isGracePeriod,
      subscription_status: subscriptionState.status,
      customer_email: normalizedEmail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return jsonResponse({ error: "An unexpected error occurred" }, 500);
  }
});
