// Edge function: extract a list of tasks from an image of a paper / sticky-note board
// using Lovable AI Gateway with vision (google/gemini-3-flash-preview).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  imageBase64: string; // data URL or raw base64 of a JPEG/PNG image
  folders?: { id: string; name: string }[];
  sections?: { id: string; name: string }[];
  nowIso?: string;
  timezone?: string;
  languageCode?: string;
  languageName?: string;
}

const AI_GATEWAY_TIMEOUT_MS = 40_000;

const MAX_IMAGE_BASE64_BYTES = 8 * 1024 * 1024; // ~6MB image

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated Supabase user to prevent anonymous credit drain
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = await sb.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = String(claimsData.claims.sub || "");
    const userEmail = String(claimsData.claims.email || "").toLowerCase();

    // Service-role client for entitlement + usage enforcement
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check Pro entitlement
    const { data: ents } = await admin
      .from("user_entitlements")
      .select("is_active, expires_at, grace_period_expires_at, in_billing_retry")
      .or(
        userEmail
          ? `app_user_id.eq.${userId},app_user_id.eq.${userEmail}`
          : `app_user_id.eq.${userId}`,
      );
    const nowMs = Date.now();
    const isPro = (ents || []).some((e: any) => {
      if (!e?.is_active) return false;
      const exp = e.expires_at ? new Date(e.expires_at).getTime() : Infinity;
      const grace = e.grace_period_expires_at
        ? new Date(e.grace_period_expires_at).getTime()
        : 0;
      return exp > nowMs || grace > nowMs || e.in_billing_retry;
    });

    const FEATURE = "scan";
    const DAILY_LIMIT = 3;
    const today = new Date().toISOString().slice(0, 10);
    const idType = userEmail ? "email" : "user";
    const idValue = userEmail || userId;

    // Atomic increment-first quota check for non-Pro users (prevents TOCTOU bypass).
    // We increment BEFORE calling the AI gateway; on any downstream failure we
    // decrement so users aren't penalized for server errors.
    if (!isPro) {
      const { data: gate, error: gateErr } = await admin.rpc(
        "increment_ai_usage_if_under_limit",
        {
          p_identifier: idValue,
          p_identifier_type: idType,
          p_feature: FEATURE,
          p_usage_date: today,
          p_limit: DAILY_LIMIT,
        },
      );
      const row = Array.isArray(gate) ? gate[0] : gate;
      if (gateErr || !row?.allowed) {
        return new Response(
          JSON.stringify({
            error: "Daily AI scan limit reached. Upgrade to Pro for unlimited use.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const refundUsage = async () => {
      if (isPro) return;
      try {
        await admin.rpc("decrement_ai_usage", {
          p_identifier: idValue,
          p_identifier_type: idType,
          p_feature: FEATURE,
          p_usage_date: today,
        });
      } catch (refundErr) {
        console.error("usage refund failed", refundErr);
      }
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ExtractRequest;
    const rawImage = (body.imageBase64 || "").trim();
    if (!rawImage) {
      return new Response(JSON.stringify({ error: "Missing image" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rawImage.length > MAX_IMAGE_BASE64_BYTES) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize to a data URL
    const imageUrl = rawImage.startsWith("data:")
      ? rawImage
      : `data:image/jpeg;base64,${rawImage}`;

    const folders = body.folders || [];
    const sections = body.sections || [];
    const now = body.nowIso || new Date().toISOString();
    const tz = body.timezone || "UTC";
    const langCode = body.languageCode || "en";
    const langName = body.languageName || "English";

    const systemPrompt = `You are a multilingual vision-based task extractor. The user has photographed handwritten or printed notes (paper, sticky-notes on a board, whiteboard, planner page, etc.).

Read every distinct task / to-do item visible in the image and return them as a list.

Current datetime (ISO): ${now}
User timezone: ${tz}
Primary language hint: ${langName} (${langCode}) — but the image may contain other languages; preserve each task in its ORIGINAL language.

Available folders (match by name, case-insensitive, fuzzy ok):
${folders.length ? folders.map((f) => `- ${f.name} (id: ${f.id})`).join("\n") : "(none)"}

Available sections:
${sections.length ? sections.map((s) => `- ${s.name} (id: ${s.id})`).join("\n") : "(none)"}

Rules:
- One entry per distinct task. Skip headers, labels, doodles, and decorative text.
- "title": short and action-oriented. Keep in the original language as written. Strip dates/times/priority/folder words from the title.
- Recognize date/time words across languages (e.g. "tomorrow", "kal", "mañana", "demain", "غداً", "明天").
- "dueDateIso": ISO 8601 with timezone offset, resolved relative to current datetime in user timezone. Null if none.
- "deadlineIso": only if the note explicitly says deadline / due by / must finish by. Null otherwise.
- "priority": "high" | "medium" | "low" | "none". Map urgent / asap / important / "!!!" / underlined / starred -> high.
- "folderId" / "sectionId": id from the available list if a name matches (case-insensitive, fuzzy). Null otherwise.
- "repeatType": "none" | "daily" | "weekly" | "monthly" | "yearly".
- If the image has no readable tasks, return an empty array.
- Return strictly via the tool call.`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(AI_GATEWAY_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Extract every task visible in this image as a structured list.",
                },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_tasks",
                description:
                  "Return all tasks detected in the image as a structured list.",
                parameters: {
                  type: "object",
                  properties: {
                    tasks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          dueDateIso: { type: ["string", "null"] },
                          deadlineIso: { type: ["string", "null"] },
                          priority: {
                            type: "string",
                            enum: ["high", "medium", "low", "none"],
                          },
                          folderId: { type: ["string", "null"] },
                          sectionId: { type: ["string", "null"] },
                          repeatType: {
                            type: "string",
                            enum: [
                              "none",
                              "daily",
                              "weekly",
                              "monthly",
                              "yearly",
                            ],
                          },
                        },
                        required: ["title", "priority", "repeatType"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["tasks"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_tasks" },
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      await refundUsage();
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResponse.text();
      console.error("AI gateway error", aiResponse.status, txt);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResponse.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ tasks: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { tasks?: unknown[] } = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e);
      await refundUsage();
      return new Response(JSON.stringify({ error: "Bad AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-extract-tasks-from-image error", e);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return new Response(
      JSON.stringify({ error: timedOut ? "AI scan timed out" : "An unexpected error occurred" }),
      {
        status: timedOut ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

