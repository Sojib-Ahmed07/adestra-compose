// src/app/api/nid-read/route.js
// Best NID reader: forwards the card pictures from a signed-in staff member to the shop's Cloudflare Worker (POST /nid,
// Workers AI vision model on Cloudflare's free plan) and returns the fields it read. The Worker key never reaches the
// browser. Uses the same env as the cut-out: CUTOUT_URL (the Worker's address) and CUTOUT_KEY (its SHOP_KEY).
import { getCurrentUser } from "@/server/session";
import { logError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's free plan accepts request bodies up to 4.5 MB

const config = () => ({ url: process.env.CUTOUT_URL?.trim().replace(/\/+$/, ""), key: process.env.CUTOUT_KEY?.trim() });
const fail = (error, status) => Response.json({ error }, { status });

/** Is the cloud reader set up? (the NID box only offers it when it is) */
export async function GET() {
    const user = await getCurrentUser();
    if (!user) return Response.json({ enabled: false }, { status: 401 });
    const { url, key } = config();
    return Response.json({ enabled: Boolean(url && key) });
}

export async function POST(request) {
    const user = await getCurrentUser();
    if (!user) return fail("Please sign in again.", 401);
    const { url, key } = config();
    if (!url || !key) return fail("The cloud reader isn't set up (CUTOUT_URL / CUTOUT_KEY).", 503);

    const body = await request.text();
    if (!body) return fail("No card pictures were sent.", 400);
    if (body.length > MAX_BYTES) return fail("The card pictures are too big for the cloud reader.", 413);
    let images;
    try {
        ({ images } = JSON.parse(body));
    } catch {
        return fail("Send JSON { images: [...] }.", 400);
    }
    if (!Array.isArray(images) || !images.length || images.length > 4) return fail("Send 1 to 4 card pictures.", 400);

    try {
        const res = await fetch(`${url}/nid`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-shop-key": key },
            body: JSON.stringify({ images }),
            signal: AbortSignal.timeout(55000),
        });
        const text = await res.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch {
            /* the old Worker (cut-out only) answers with a PNG error or plain text */
        }
        if (!res.ok || !data) {
            const error =
                res.status === 401
                    ? "The Cloudflare key doesn't match (check CUTOUT_KEY and the Worker's SHOP_KEY)."
                    : res.status === 429
                        ? data?.error || "Today's free AI reading is used up."
                        : data?.error ||
                        (/Images binding|segment|photo/i.test(text)
                            ? "The Worker is the old version — paste the new cloudflare/cutout-worker.js into Cloudflare."
                            : text.slice(0, 300) || `Cloudflare error ${res.status}`);
            return fail(error, res.status === 401 ? 502 : res.status || 502);
        }
        return Response.json(data, { headers: { "cache-control": "no-store" } });
    } catch (err) {
        logError("nid-read", err);
        return fail(err?.name === "TimeoutError" ? "Cloudflare took too long." : "Couldn't reach Cloudflare.", 504);
    }
}