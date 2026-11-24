// cloudflare/cutout-worker.js
// The shop's Cloudflare Worker: the "Best" cut-out AND the "Best" NID reader. Paste this whole file into the Worker's
// code editor (see the setup steps in AI_CONTEXT.md §4 → "Best cut-out" / "Best NID reader"). It is not part of the
// Next.js app.
//
// Needs, in the Worker's Settings:
//   Bindings → Images, variable name IMAGES          (cut-out)
//   Bindings → Workers AI, variable name AI          (NID reader)
//   Variables and Secrets → Secret SHOP_KEY (any long random text; the same text goes in Vercel's CUTOUT_KEY)
//
// POST /       a photo (JPEG / PNG / WebP) with header x-shop-key → transparent PNG of the person.
//              Cloudflare Images `segment: "foreground"` (BiRefNet). Free plan: 5,000 a month; past that it fails.
// POST /nid    JSON { images: ["data:image/jpeg;base64,…", …] } (1–4 card pictures of ONE person) with x-shop-key
//              → JSON { model, data: { name, nameEn, father, mother, husband, dob, nid, address, blood, mrz } }.
//              Workers AI vision models (tried in order). Free plan: 10,000 Neurons a day (roughly 80–100 cards);
//              past that it fails until 00:00 UTC (6 am in Bangladesh) — never billed on the Workers Free plan.
//              Workers AI keeps nothing (zero data retention) and does not train on what is sent.

const NID_MODELS = [
    "@cf/meta/llama-4-scout-17b-16e-instruct",
    "@cf/google/gemma-3-12b-it",
    "@cf/mistralai/mistral-small-3.1-24b-instruct",
];

const NID_PROMPT = `You read Bangladesh National ID (NID) cards. The pictures show the front and/or the back of ONE person's card (a smart card or an old laminated card). A picture may be rotated or slightly blurred.

Copy the text EXACTLY as it is printed on the card:
- Bangla text stays in Bangla script. Never translate, never transliterate, never "correct" a spelling.
- Digits exactly as printed.
- If a field is not on the pictures or you cannot read it with certainty, use "" (empty). Never guess or invent.

Answer with ONE JSON object and nothing else:
{
  "name": "the Bangla name after নাম",
  "nameEn": "the English name after Name",
  "father": "the Bangla name after পিতা",
  "mother": "the Bangla name after মাতা",
  "husband": "the Bangla name after স্বামী, else empty",
  "dob": "date of birth as YYYY-MM-DD",
  "nid": "the NID / ID number, digits only",
  "address": "the whole address after ঠিকানা: on one line, exactly as printed, with its labels (বাসা/হোল্ডিং:, গ্রাম/রাস্তা:, ডাকঘর:, উপজেলা:, জেলা:) and commas",
  "blood": "blood group, else empty",
  "mrz": "the 3 machine-readable lines at the bottom of a smart card's back (I<BGD…), separated by \\n, else empty"
}`;

export default {
    async fetch(request, env) {
        const path = new URL(request.url).pathname.replace(/\/+$/, "");
        if (request.method === "GET")
            return text(
                `Shop Worker is running. Cut-out: ${env.IMAGES ? "ready" : "add the IMAGES binding"}. ` +
                `NID reader: ${env.AI ? "ready" : "add the Workers AI binding named AI"}.`,
                200,
            );
        if (request.method !== "POST") return text("Use POST.", 405);
        if (!env.SHOP_KEY || request.headers.get("x-shop-key") !== env.SHOP_KEY) return text("Wrong key.", 401);
        if (path.endsWith("/nid")) return readNid(request, env);
        return cutout(request, env);
    },
};

async function cutout(request, env) {
    if (!env.IMAGES) return text("The Images binding (IMAGES) is missing — add it in Settings → Bindings.", 500);
    if (!request.body) return text("No photo was sent.", 400);
    try {
        const result = await env.IMAGES.input(request.body).transform({ segment: "foreground" }).output({ format: "image/png" });
        const out = result.response();
        return new Response(out.body, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
    } catch (err) {
        const msg = String(err?.message || err);
        // 9422 = the free plan's monthly transformations are used up.
        if (/9422|limit|quota/i.test(msg)) return text("This month's free cut-outs are used up.", 429);
        return text(`Cut-out failed: ${msg}`, 502);
    }
}

async function readNid(request, env) {
    if (!env.AI) return json({ error: "The Workers AI binding (AI) is missing — add it in Settings → Bindings." }, 500);
    let images;
    try {
        ({ images } = await request.json());
    } catch {
        return json({ error: "Send JSON { images: [...] }." }, 400);
    }
    if (!Array.isArray(images) || !images.length || images.length > 4) return json({ error: "Send 1 to 4 card pictures." }, 400);
    if (!images.every((u) => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(u)))
        return json({ error: "Card pictures must be JPEG / PNG / WebP data URLs." }, 400);

    const messages = [
        {
            role: "user",
            content: [{ type: "text", text: NID_PROMPT }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))],
        },
    ];
    const problems = [];
    for (const model of NID_MODELS) {
        try {
            const out = await env.AI.run(model, { messages, max_tokens: 1200, temperature: 0 });
            const data = jsonIn(out);
            if (data) return json({ model, data });
            problems.push(`${short(model)}: no answer`);
        } catch (err) {
            const msg = String(err?.message || err);
            // 4006 / "neurons" = today's free allocation is used up (resets 00:00 UTC = 6 am in Bangladesh)
            if (/4006|neuron|daily|quota|limit/i.test(msg))
                return json({ error: "Today's free AI reading is used up (it starts again at 6 am)." }, 429);
            problems.push(`${short(model)}: ${msg.slice(0, 160)}`);
        }
    }
    return json({ error: `The AI could not read the card — ${problems.join(" | ")}` }, 502);
}

/** The model's answer → the JSON object in it (models sometimes wrap it in ```json … ``` or add a sentence). */
function jsonIn(out) {
    const raw = out?.response ?? out?.choices?.[0]?.message?.content ?? out?.result?.response ?? "";
    if (raw && typeof raw === "object") return raw;
    const s = String(raw);
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        const data = JSON.parse(s.slice(start, end + 1));
        return data && typeof data === "object" ? data : null;
    } catch {
        return null;
    }
}

const short = (model) => model.split("/").pop();

function text(body, status) {
    return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
}