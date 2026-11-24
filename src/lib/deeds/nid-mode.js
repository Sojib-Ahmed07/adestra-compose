// src/lib/deeds/nid-mode.js
// Which NID reader the NID box uses: "best" (Cloudflare Workers AI through /api/nid-read) or "offline" (tesseract.js
// in this browser). Small on purpose — the deed page imports it without loading the reader itself.

let cloudReady = null; // Promise<boolean>

/** Is the cloud reader set up on the server (CUTOUT_URL / CUTOUT_KEY)? Asked once per page load. */
export function nidCloudReady() {
    if (!cloudReady) {
        cloudReady = fetch("/api/nid-read", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : { enabled: false }))
            .then((d) => !!d.enabled)
            .catch(() => false);
    }
    return cloudReady;
}

const MODE_KEY = "nid:mode";

/** "best" or "offline". Saved on this computer; "best" by default. */
export function getNidMode() {
    try {
        return localStorage.getItem(MODE_KEY) === "offline" ? "offline" : "best";
    } catch {
        return "best";
    }
}

export function setNidMode(mode) {
    try {
        localStorage.setItem(MODE_KEY, mode === "offline" ? "offline" : "best");
    } catch {
        /* private window */
    }
}