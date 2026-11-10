// src/components/tools/amount-in-words.jsx
"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { bnAmount, bnWords, enAmount, enWords, groupBD, parseAmount } from "@/lib/number-words";
import { toBanglaDigits } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Segmented, useToast } from "@/components/ui/interactive";
import { Card } from "@/components/ui/misc";

export function AmountInWordsTool() {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("taka");
  const value = parseAmount(input);

  const lines = value
    ? mode === "taka"
      ? [
          { label: "বাংলা", text: bnAmount(value), bangla: true },
          { label: "English", text: enAmount(value) },
          {
            label: "Figures",
            text: `৳ ${groupBD(value.taka, value.poisa)} · ${toBanglaDigits(groupBD(value.taka, value.poisa))} টাকা`,
          },
        ]
      : [
          { label: "বাংলা", text: bnWords(value.taka), bangla: true },
          { label: "English", text: enWords(value.taka) },
        ]
    : [];

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied.");
    } catch {
      toast("Couldn't copy. Select the text and press Ctrl+C.", "error");
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Card className="space-y-4 p-5">
        <Segmented
          options={[
            { value: "taka", label: "Taka amount" },
            { value: "number", label: "Just the number" },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Field
          label={mode === "taka" ? "Amount" : "Number"}
          htmlFor="aw-input"
          error={input && !value ? "Type digits only, with up to 2 decimal places — e.g. 125000.50 or ১২৫০০০" : undefined}
          hint="Bangla or English digits. Commas are fine."
        >
          <Input
            id="aw-input"
            inputMode="decimal"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 1,25,000"
            className="h-12 text-lg"
          />
        </Field>
      </Card>

      {lines.map((l) => (
        <Card key={l.label} className="flex items-start gap-3 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{l.label}</p>
            <p className={`mt-1 text-lg text-ink-900 ${l.bangla ? "font-bangla" : ""}`}>{l.text}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => copy(l.text)}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </Card>
      ))}
    </div>
  );
}
