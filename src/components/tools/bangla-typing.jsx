// src/components/tools/bangla-typing.jsx
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Download, Keyboard } from "lucide-react";
import { avroGuide, avroKeys, loadAvro } from "@/lib/bangla/avro";
import { textStats, unicodeToBijoy } from "@/lib/bangla/convert";
import { copyText } from "@/lib/clipboard";
import { downloadBlob } from "@/lib/photo/export";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/interactive";
import { Card } from "@/components/ui/misc";

const STORAGE_KEY = "shop-tools:bangla-typing";
/** The unconverted English run just before the caret (no spaces, no Bangla). */
const PENDING = /[^\sঀ-৿]+$/;

export function BanglaTypingTool() {
  const toast = useToast();
  const taRef = useRef(null);
  const caretRef = useRef(null);
  const [avro, setAvro] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [bangla, setBangla] = useState(true);
  const [pending, setPending] = useState("");

  const loadedRef = useRef(false);
  useEffect(() => {
    loadAvro()
      .then(setAvro)
      .catch((e) => setError(e.message));
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setText(saved);
    } catch {
      // storage not available
    }
    loadedRef.current = true;
  }, []);

  // Keep a draft in this browser so a reload doesn't lose work (not before the saved draft is read).
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch {
      // storage not available
    }
  }, [text]);

  // Put the caret back where it belongs after we replaced text.
  useLayoutEffect(() => {
    if (caretRef.current != null && taRef.current) {
      taRef.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  }, [text]);

  const pendingBefore = (value, pos) => value.slice(0, pos).match(PENDING)?.[0] ?? "";

  /** Convert the English run that ends at `pos`. Returns { value, caret }. */
  const convertAt = useCallback(
    (value, pos) => {
      const run = pendingBefore(value, pos);
      if (!run || !avro) return { value, caret: pos };
      const bn = avro.parse(run);
      return { value: value.slice(0, pos - run.length) + bn + value.slice(pos), caret: pos - run.length + bn.length };
    },
    [avro],
  );

  /** Convert whatever is still waiting before the caret (before copying, or when switching mode). */
  const flush = () => {
    const ta = taRef.current;
    if (!ta || !bangla) return text;
    const { value, caret } = convertAt(text, ta.selectionStart);
    if (value !== text) {
      caretRef.current = caret;
      setText(value);
    }
    setPending("");
    return value;
  };

  const onChange = (e) => {
    const value = e.target.value;
    const pos = e.target.selectionStart;
    const inserted = value.length - text.length;
    // A space / new line / tab was just typed → convert the word before it (works on phone keyboards too).
    if (bangla && avro && inserted === 1 && /\s/.test(value[pos - 1] ?? "")) {
      const { value: converted, caret } = convertAt(value, pos - 1);
      caretRef.current = caret + 1;
      setText(converted);
      setPending("");
      return;
    }
    setText(value);
    setPending(bangla ? pendingBefore(value, pos) : "");
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggle();
    }
  };

  const toggle = () => {
    if (bangla) flush();
    setBangla((b) => !b);
    setPending("");
    taRef.current?.focus();
  };

  const finalText = () => flush();
  const stats = textStats(text);

  const doCopy = async (bijoy) => {
    const t = finalText();
    if (!t.trim()) return;
    const ok = await copyText(bijoy ? unicodeToBijoy(t) : t);
    if (!ok) toast("Couldn't copy. Select the text and press Ctrl+C.", "error");
    else toast(bijoy ? "Copied for SutonnyMJ — paste into a Bijoy-font text box." : "Copied.");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={bangla}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-medium transition-colors",
              bangla ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-ink-100 text-ink-800 hover:bg-ink-200",
            )}
          >
            <Keyboard className="h-4 w-4" />
            {bangla ? "বাংলা (Banglish)" : "English"}
          </button>
          <span className="text-xs text-subtle">Ctrl + M switches</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => doCopy(false)} disabled={!text.trim()}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button size="sm" variant="outline" onClick={() => doCopy(true)} disabled={!text.trim()}>
              <Copy className="h-3.5 w-3.5" /> Copy for SutonnyMJ
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!text.trim()}
              onClick={() => {
                downloadBlob(new Blob([finalText()], { type: "text/plain;charset=utf-8" }), "bangla-text.txt");
                toast("Saved to Downloads.");
              }}
            >
              <Download className="h-3.5 w-3.5" /> .txt
            </Button>
            {text ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setText("");
                  setPending("");
                  taRef.current?.focus();
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="relative">
          <textarea
            ref={taRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onClick={(e) => setPending(bangla ? pendingBefore(text, e.currentTarget.selectionStart) : "")}
            autoFocus
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Typing area"
            placeholder={
              bangla
                ? "Type in English letters, e.g. ami bangla likhte pari — each word turns into Bangla when you press space."
                : "Typing in English."
            }
            className="min-h-[420px] w-full resize-y rounded-[var(--radius-card)] border border-line-strong bg-white p-4 font-bangla text-lg leading-relaxed shadow-[var(--shadow-lift)] focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          {pending && avro ? (
            <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg bg-ink-900 px-3 py-1.5 text-sm text-white shadow-[var(--shadow-float)]">
              <span className="text-ink-300">{pending}</span> → <span className="font-bangla">{avro.parse(pending)}</span>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-subtle">
          {stats.words} words · {stats.chars} letters. Your text is kept in this browser until you clear it.
        </p>
      </div>

      <Card className="h-fit p-5">
        <h2 className="text-sm font-semibold">How to type</h2>
        <p className="mt-1 text-xs text-muted">Same rules as the Avro keyboard. Capital letters matter.</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          {avroGuide.map(([en, bn]) => (
            <div key={en} className="contents">
              <dt className="font-mono text-[13px] text-ink-700">{en}</dt>
              <dd className="font-bangla text-ink-900">{bn}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-5 text-xs font-semibold text-ink-800">Special keys</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
          {avroKeys.map(([en, bn]) => (
            <div key={en} className="flex gap-2">
              <dt className="font-mono text-ink-700">{en}</dt>
              <dd className="font-bangla text-ink-900">{bn}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
