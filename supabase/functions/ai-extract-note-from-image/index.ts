// Edge function: extract a richly-formatted note from an image of a page.
// Uses Lovable AI Gateway with vision (google/gemini-3-flash-preview) to OCR
// the page AND preserve detected structure (headings, bullet/numbered lists,
// paragraphs) as semantic HTML the rich text editor can render directly.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ExtractRequest {
  imageBase64: string;
  languageCode?: string;
  languageName?: string;
}

const AI_GATEWAY_TIMEOUT_MS = 40_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const imageUrl = rawImage.startsWith("data:")
      ? rawImage
      : `data:image/jpeg;base64,${rawImage}`;

    const langName = body.languageName || "auto";
    const langCode = body.languageCode || "auto";

    const systemPrompt = `You are a vision-based document transcriber. The user photographed a page (handwritten notebook, printed document, whiteboard, sticky notes, planner, etc.).

Your job: faithfully transcribe ALL readable text AND preserve the page's visual structure as semantic HTML.

Primary language hint: ${langName} (${langCode}). Preserve the original language(s) of the page — do NOT translate.

STRUCTURE RULES — detect and convert:
- Page title or top-most large heading → <h1>
- Section headings (underlined, bold, larger) → <h2> or <h3>
- Bulleted lists (•, -, *, ●, ▪, hand-drawn dots) → <ul><li>
- Numbered lists (1. 2. 3., a) b), i. ii.) → <ol><li>
- Checkboxes (☐, ☒, [ ], [x]) → <ul><li>☐ ...</li></ul> (keep the box character)
- Paragraphs → <p>
- Horizontal dividers / lines across the page → <hr>
- Emphasized words (UNDERLINED, **bold**, ALL CAPS standalone) → <strong>
- Tables → <table><tr><td>...</td></tr></table>

CONTENT RULES:
- Transcribe everything readable. Skip doodles, page numbers, decorative borders.
- Keep line breaks inside a paragraph as <br> only when meaningful.
- Output ONLY the body HTML (no <html>, <head>, <body>, no markdown fences, no commentary).
- If nothing is readable, return an empty string.

Return strictly via the tool call.`;

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
                  text: "Transcribe this page into structured HTML, preserving headings and lists.",
                },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_note",
                description: "Return the transcribed page as semantic HTML and a short title.",
                parameters: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description: "Suggested note title (5-8 words). Empty string if not obvious.",
                    },
                    html: {
                      type: "string",
                      description: "Body HTML preserving headings, lists, paragraphs.",
                    },
                  },
                  required: ["title", "html"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_note" },
          },
        }),
      },
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
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
      return new Response(JSON.stringify({ title: "", html: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { title?: string; html?: string } = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e);
      return new Response(JSON.stringify({ error: "Bad AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        title: typeof parsed.title === "string" ? parsed.title : "",
        html: typeof parsed.html === "string" ? parsed.html : "",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("ai-extract-note-from-image error", e);
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return new Response(
      JSON.stringify({ error: timedOut ? "AI scan timed out" : e instanceof Error ? e.message : "Unknown error" }),
      {
        status: timedOut ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
