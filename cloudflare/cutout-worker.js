// cloudflare/cutout-worker.js
// The shop's Cloudflare Worker for the "Best" cut-out. Paste this whole file into the Worker's code editor
// (see the setup steps in AI_CONTEXT.md §4 → "Best cut-out"). It is not part of the Next.js app.
//
// Needs, in the Worker's Settings:
//   Bindings → Images, variable name IMAGES
//   Variables and Secrets → Secret SHOP_KEY (any long random text; the same text goes in Vercel's CUTOUT_KEY)
//
// POST a photo (JPEG / PNG / WebP) with header x-shop-key → transparent PNG of the person.
// Background removal = Cloudflare Images `segment: "foreground"` (BiRefNet on Cloudflare's servers). On the free
// Images plan each photo is one of 5,000 free transformations a month; past that it fails (never billed).

export default {
    async fetch(request, env) {
        if (request.method === "GET") return text("Shop cut-out Worker is running. POST a photo to use it.", 200);
        if (request.method !== "POST") return text("Use POST.", 405);
        if (!env.SHOP_KEY || request.headers.get("x-shop-key") !== env.SHOP_KEY) return text("Wrong key.", 401);
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
    },
};

function text(body, status) {
    return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}