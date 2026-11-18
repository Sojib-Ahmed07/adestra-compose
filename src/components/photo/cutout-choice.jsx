// src/components/photo/cutout-choice.jsx
"use client";

import { useEffect, useState } from "react";
import { cloudCutoutReady, getCutoutMode, onCutoutNotice, setCutoutMode } from "@/lib/photo/ai/matte";
import { Field } from "@/components/ui/form";
import { Segmented } from "@/components/ui/interactive";

/**
 * Background removal engine: "Best" (BiRefNet on the shop's Cloudflare account) or "Offline" (this computer).
 * Shown only when the Cloudflare cut-out is set up on the server; otherwise renders nothing (offline is used).
 * Also shows the last "Best didn't work, done offline" notice.
 */
export function CutoutChoice() {
    const [ready, setReady] = useState(false);
    const [mode, setMode] = useState("best");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        let live = true;
        setMode(getCutoutMode());
        cloudCutoutReady().then((ok) => live && setReady(ok));
        const off = onCutoutNotice((msg) => live && setNotice(msg));
        return () => {
            live = false;
            off();
        };
    }, []);

    if (!ready) return null;
    return (
        <div className="space-y-1.5">
            <Field label="Background removal">
                <Segmented
                    size="sm"
                    options={[
                        { value: "best", label: "Best (Cloudflare)" },
                        { value: "offline", label: "Offline" },
                    ]}
                    value={mode}
                    onChange={(m) => {
                        setCutoutMode(m);
                        setMode(m);
                        setNotice("");
                    }}
                />
            </Field>
            <p className="text-xs text-subtle">
                {mode === "best"
                    ? "Best: the photo is sent to the shop's Cloudflare account for a sharper cut-out (hair, hijab, dark clothes). Free for 5,000 photos a month; if it fails, the photo is done offline. Applies to photos added from now on."
                    : "Offline: done on this computer, nothing is sent. Applies to photos added from now on."}
            </p>
            {notice ? <p className="text-xs text-warn">{notice}</p> : null}
        </div>
    );
}