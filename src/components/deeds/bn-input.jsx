// src/components/deeds/bn-input.jsx
"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AVRO_RUN, loadAvro } from "@/lib/bangla/avro";
import { cn } from "@/lib/utils";
import { Input, Textarea } from "@/components/ui/form";

/**
 * Banglish typing for every text box of a form (Avro phonetic: "amar sonar bangla" → "আমার সোনার বাংলা").
 * A word turns into Bangla when you press space / Enter or leave the box. Bangla typed with a keyboard layout (Avro,
 * Bijoy on the computer) passes through untouched. Ctrl+M switches Bangla ⇄ English, like in the typing tool.
 * Short forms: md → মোঃ, mst → মোছাঃ, mosa → মোসাঃ, dr → ডাঃ.
 */
const Ctx = createContext({ on: false, avro: null, toggle: () => { } });

export function BanglaTypingProvider({ children }) {
    const [on, setOn] = useState(true);
    const [avro, setAvro] = useState(null);
    useEffect(() => {
        loadAvro()
            .then(setAvro)
            .catch(() => setAvro(null));
        try {
            if (localStorage.getItem("deed:banglish") === "off") setOn(false);
        } catch {
            // ignore
        }
    }, []);
    const toggle = () =>
        setOn((v) => {
            try {
                localStorage.setItem("deed:banglish", v ? "off" : "on");
            } catch {
                // ignore
            }
            return !v;
        });
    return <Ctx.Provider value={{ on, avro, toggle }}>{children}</Ctx.Provider>;
}

export const useBanglaTyping = () => useContext(Ctx);

/** Short forms used in deeds that Avro would spell out letter by letter ("md" → "মদ"). */
const shortForms = { md: "মোঃ", "md.": "মোঃ", mst: "মোছাঃ", "mst.": "মোছাঃ", mosa: "মোসাঃ", dr: "ডাঃ", "dr.": "ডাঃ" };

/** Turn the English run just before `pos` into Bangla. */
function convertBefore(avro, value, pos) {
    const run = value.slice(0, pos).match(AVRO_RUN)?.[0] ?? "";
    if (!run) return { value, caret: pos };
    const out = shortForms[run.toLowerCase()] ?? avro.parse(run);
    return { value: value.slice(0, pos - run.length) + out + value.slice(pos), caret: pos - run.length + out.length };
}

/**
 * Text box with Banglish typing. Same props as Input / Textarea, but onChange gets the text (not the event).
 * @param {{ value: string, onChange: (v: string) => void, multiline?: boolean, english?: boolean }} props
 *   english: never convert (e.g. e-mail)
 */
export function BnInput({ value, onChange, multiline = false, english = false, className, onBlur, onKeyDown, ...props }) {
    const { on, avro, toggle } = useBanglaTyping();
    const ref = useRef(null);
    const caret = useRef(null);
    const active = on && avro && !english;

    useLayoutEffect(() => {
        if (caret.current != null && ref.current) {
            ref.current.setSelectionRange(caret.current, caret.current);
            caret.current = null;
        }
    }, [value]);

    const handle = (e) => {
        const v = e.target.value;
        const pos = e.target.selectionStart;
        const inserted = v.length - (value ?? "").length;
        if (active && inserted === 1 && /\s/.test(v[pos - 1] ?? "")) {
            const r = convertBefore(avro, v, pos - 1);
            caret.current = r.caret + 1;
            onChange(r.value);
            return;
        }
        onChange(v);
    };
    const blur = (e) => {
        if (active) {
            const v = e.target.value;
            const r = convertBefore(avro, v, v.length);
            if (r.value !== v) onChange(r.value);
        }
        onBlur?.(e);
    };
    const keyDown = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
            e.preventDefault();
            toggle();
        }
        onKeyDown?.(e);
    };
    const Comp = multiline ? Textarea : Input;
    return (
        <Comp
            ref={ref}
            value={value ?? ""}
            onChange={handle}
            onBlur={blur}
            onKeyDown={keyDown}
            lang="bn"
            className={cn("font-bangla", className)}
            {...props}
        />
    );
}

/** The on/off switch shown at the top of the form. */
export function BanglaSwitch() {
    const { on, avro, toggle } = useBanglaTyping();
    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={on}
            className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                on ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-ink-100 text-ink-800 hover:bg-ink-200",
            )}
            title="Ctrl+M"
        >
            {on ? "বাংলা (Banglish) টাইপিং চালু" : "English typing"}
            {on && !avro ? <span className="text-xs opacity-80">(loading…)</span> : null}
        </button>
    );
}