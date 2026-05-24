import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Product IDs to plan type mapping
const PRODUCT_TO_PLAN: Record<string, string> = {
  prod_UFxq1E9sWWYyYP: "weekly",
  prod_UFxuZOFIvhkpxr: "monthly",
  prod_UFxvRW5CagcDV1: "yearly",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

/** Safely convert a Stripe Unix timestamp to ISO string, or return null */
const ts = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) ? new Date(v * 1000).toISOString() : null;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey) {
    logStep("ERROR: STRIPE_SECRET_KEY not set");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!webhookSecret) {
    logStep("ERROR: STRIPE_WEBHOOK_SECRET not set — refusing to process unsigned events");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  // Supabase client with service role for DB writes
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  let event: Stripe.Event;

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      logStep("ERROR: Missing stripe-signature header");
      return new Response("Missing signature", { status: 400 });
    }
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    logStep("Event received", { type: event.type, id: event.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("ERROR: Webhook signature verification failed", { error: msg });
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          logStep("Checkout completed, fetching subscription", { subscriptionId: session.subscription });
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await upsertSubscription(supabaseAdmin, stripe, subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription created/updated", { id: subscription.id, status: subscription.status });
        await upsertSubscription(supabaseAdmin, stripe, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted", { id: subscription.id });
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscription.id);
        if (error) logStep("ERROR updating canceled subscription", { error });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          logStep("Payment succeeded, refreshing subscription", { subscriptionId: invoice.subscription });
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await upsertSubscription(supabaseAdmin, stripe, subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          logStep("Payment failed", { subscriptionId: invoice.subscription });
          const { error } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", invoice.subscription as string);
          if (error) logStep("ERROR updating past_due subscription", { error });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("ERROR processing event", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function upsertSubscription(
  supabaseAdmin: any,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  // Get customer email
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  if (customer.deleted) {
    logStep("Customer deleted, skipping");
    return;
  }

  const email = customer.email;
  if (!email) {
    logStep("No customer email, skipping");
    return;
  }

  // Determine plan type from product
  const productId = subscription.items.data[0]?.price?.product as string;
  const planType = PRODUCT_TO_PLAN[productId] || "unknown";

  const record = {
    user_email: email.toLowerCase(),
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    plan_type: planType,
    status: subscription.status,
    is_trialing: subscription.status === "trialing",
    current_period_start: ts(subscription.current_period_start),
    current_period_end: ts(subscription.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  logStep("Upserting subscription", { email, planType, status: subscription.status });

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(record, { onConflict: "stripe_subscription_id" });

  if (error) {
    logStep("ERROR upserting subscription", { error });
  } else {
    logStep("Subscription upserted successfully");
  }
}
