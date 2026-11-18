// src/app/api/cutout/route.js
// Best cut-out: forwards a photo from a signed-in staff member to the shop's Cloudflare Worker (BiRefNet background
// removal on Cloudflare's free plan) and returns the transparent PNG. The Worker key never reaches the browser.
// Env: CUTOUT_URL (the Worker's address) and CUTOUT_KEY (the same secret as the Worker's SHOP_KEY).
import { getCurrentUser } from "@/server/session";
import { logError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's free plan accepts request bodies up to 4.5 MB

const config = () => ({ url: process.env.CUTOUT_URL?.trim(), key: process.env.CUTOUT_KEY?.trim() });
const fail = (error, status) => Response.json({ error }, { status });

/** Is the best cut-out set up? (the tools only show the choice when it is) */
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
    if (!url || !key) return fail("The best cut-out isn't set up (CUTOUT_URL / CUTOUT_KEY).", 503);

    const type = request.headers.get("content-type") || "";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return fail("Send a JPEG, PNG or WebP photo.", 415);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return fail("The photo was empty.", 400);
    if (body.byteLength > MAX_BYTES) return fail("The photo is too big for the cloud cut-out.", 413);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": type, "x-shop-key": key },
            body,
            signal: AbortSignal.timeout(55000),
        });
        if (!res.ok) {
            const text = (await res.text()).slice(0, 300);
            const status = res.status === 401 ? 502 : res.status;
            const error =
                res.status === 401
                    ? "The Cloudflare key doesn't match (check CUTOUT_KEY and the Worker's SHOP_KEY)."
                    : res.status === 429
                        ? "This month's free Cloudflare cut-outs are used up."
                        : text || `Cloudflare error ${res.status}`;
            return fail(error, status);
        }
        const out = await res.arrayBuffer();
        return new Response(out, {
            headers: { "content-type": res.headers.get("content-type") || "image/png", "cache-control": "no-store" },
        });
    } catch (err) {
        logError("cutout", err);
        return fail(err?.name === "TimeoutError" ? "Cloudflare took too long." : "Couldn't reach Cloudflare.", 504);
    }
}