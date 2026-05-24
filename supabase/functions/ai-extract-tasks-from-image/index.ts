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

const hashIdentifier = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};

const getAnonymousIdentifier = async (req: Request) => {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown-ip";
  const userAgent = req.headers.get("user-agent") || "unknown-agent";
  return `anon_${await hashIdentifier(`${ip}|${userAgent}`)}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Prefer authenticated users; allow legacy anonymous scans through a
    // server-derived anonymous identifier so clients cannot write counters directly.
    const authHeader = req.headers.get("Authorization") || "";
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    let userId = "";
    let userEmail = "";
    if (authHeader.startsWith("Bearer ")) {
      const accessToken = authHeader.replace("Bearer ", "");
      if (accessToken && accessToken !== anonKey) {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          anonKey,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data: userData, error: userError } = await sb.auth.getUser(accessToken);
        if (userError || !userData?.user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = String(userData.user.id || "");
        userEmail = String(userData.user.email || "").toLowerCase();
      }
    }

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
    const idType = userEmail ? "email" : userId ? "user" : "anonymous";
    const idValue = userEmail || userId || (await getAnonymousIdentifier(req));

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

    const systemPrompt = `You are an expert multilingual vision-based task extractor specialized in HANDWRITTEN notes (cursive, print, messy handwriting on paper, sticky-notes, whiteboards, planners, bullet journals).

Carefully read EVERY distinct task in the image and extract ALL metadata cues — explicit or implicit — that the writer marked down. Be thorough: people scribble dates, times, priorities, folders, tags and repeats in many shorthand ways and you must catch them.

Current datetime (ISO): ${now}
User timezone: ${tz}
Primary language hint: ${langName} (${langCode}) — but the image may contain other languages; preserve each task in its ORIGINAL language.

Available folders (match by name, case-insensitive, fuzzy ok):
${folders.length ? folders.map((f) => `- ${f.name} (id: ${f.id})`).join("\n") : "(none)"}

Available sections:
${sections.length ? sections.map((s) => `- ${s.name} (id: ${s.id})`).join("\n") : "(none)"}

Detection rules — apply ALL of them:
- One entry per distinct task. Skip pure headers, decorative doodles, page numbers.
- "title": short, action-oriented, in the ORIGINAL language. Strip out dates, times, priority markers, folder/section labels, tags, repeat words, location prefixes.
- "description": extra context written under the task (notes, sub-detail, parenthetical clarifications). Null if none.

DATE & TIME — handwritten cues across languages:
- Relative words: today/tonight, tomorrow, day after tomorrow, yesterday, next Mon/Tue/…, this weekend, next week, next month, in 3 days, EOD, EOW, kal, parso, mañana, demain, غداً, 明天, 今天, 来週, etc.
- Explicit dates in any format: 12/05, 12-05-2026, 5 Dec, Dec 5, 05.12, 12月5日, etc. Resolve year from current datetime.
- Times: "3pm", "15:00", "morning", "noon", "midnight", "evening", "afternoon", "before lunch", "subah", "shaam", "صباحاً", "下午3点".
- Combine date+time into "dueDateIso" (ISO 8601 with the user timezone offset). Date only -> 09:00 local. Time only & clearly for today -> use today.
- "reminderIso": if writer wrote a separate reminder/alarm (e.g. "remind 1h before", "alarm 7am", "🔔 8pm"). Null otherwise.
- "deadlineIso": only if note explicitly says deadline / due by / must finish by / "DL" / "by EOD".

PRIORITY — map ANY of these:
- high: "!!!", "!!", URGENT, ASAP, IMP, ★, ⭐, 🔥, heavily underlined, circled, red ink, ALL-CAPS, "P1", "critical", "अति आवश्यक", "مهم جداً".
- medium: single "!", "P2", "medium", "should do".
- low: "P3", "low", "later", "someday", "if time", "→".
- none: nothing indicating urgency.
- "isUrgent": true ONLY for strongest cues (URGENT / ASAP / multiple !!! / 🔥 / starred & circled).

REPEAT:
- "repeatType": none | hourly | daily | weekly | weekdays | weekends | monthly | yearly.
- Recognize "every day", "daily", "every Monday", "weekly", "M-F", "weekdays", "Sat & Sun", "every month", "monthly bill", "yearly", "annual", "हर रोज़", "tous les jours", "毎日".
- "repeatDays": for weekly/weekdays/weekends, return array of 0-6 (Sun=0..Sat=6) when specific days are written.

FOLDER / SECTION:
- Detect a folder/section label written near the task (heading at top of page, "[Work]", "Personal:", "#Home", a circled category). Map fuzzy to the available lists.
- "folderId" / "sectionId": id from the available lists. Null otherwise.

TAGS:
- "tags": any hashtags or @-tags ("#work", "#errand", "@home", "@call"). Return as plain strings WITHOUT the # or @.

LOCATION:
- "location": any place mentioned ("at gym", "@office", "Walmart", "home"). Null otherwise.

- If the image has no readable tasks, return an empty array.
- Return strictly via the tool call. Be aggressive about catching metadata — better to fill a field from a clear handwritten cue than leave it null.`;

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
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Extract every handwritten task visible in this image. Read carefully and capture every date, time, priority, folder/section, repeat, tag, and location cue the writer marked.",
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
                  "Return all tasks detected in the image as a structured list with full metadata.",
                parameters: {
                  type: "object",
                  properties: {
                    tasks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          description: { type: ["string", "null"] },
                          dueDateIso: { type: ["string", "null"] },
                          reminderIso: { type: ["string", "null"] },
                          deadlineIso: { type: ["string", "null"] },
                          priority: {
                            type: "string",
                            enum: ["high", "medium", "low", "none"],
                          },
                          isUrgent: { type: "boolean" },
                          folderId: { type: ["string", "null"] },
                          sectionId: { type: ["string", "null"] },
                          repeatType: {
                            type: "string",
                            enum: [
                              "none",
                              "hourly",
                              "daily",
                              "weekly",
                              "weekdays",
                              "weekends",
                              "monthly",
                              "yearly",
                            ],
                          },
                          repeatDays: {
                            type: "array",
                            items: { type: "integer", minimum: 0, maximum: 6 },
                          },
                          tags: {
                            type: "array",
                            items: { type: "string" },
                          },
                          location: { type: ["string", "null"] },
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

