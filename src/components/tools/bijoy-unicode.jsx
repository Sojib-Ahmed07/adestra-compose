// src/components/tools/bijoy-unicode.jsx
"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Copy, FileText } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { bijoyToUnicode, convertBijoyFile, detectEncoding, docTypes, textStats, unicodeToBijoy } from "@/lib/bangla/convert";
import { ResultFiles, useJob } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Checkbox, Label } from "@/components/ui/form";
import { Segmented, useToast } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

export function BijoyUnicodeTool() {
  const [tab, setTab] = useState("text");
  return (
    <div className="space-y-5">
      <Segmented
        options={[
          { value: "text", label: "Text" },
          { value: "file", label: "Word / document file" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div hidden={tab !== "text"}>
        <TextConverter />
      </div>
      <div hidden={tab !== "file"}>
        <FileConverter />
      </div>
    </div>
  );
}

function TextConverter() {
  const toast = useToast();
  const [dir, setDir] = useState("b2u");
  const [input, setInput] = useState("");
  const output = useMemo(() => (dir === "b2u" ? bijoyToUnicode(input) : unicodeToBijoy(input)), [dir, input]);
  const detected = useMemo(() => detectEncoding(input), [input]);
  const stats = textStats(dir === "b2u" ? output : input);

  // Pasted text looks like the other direction → offer to switch.
  const mismatch = (dir === "b2u" && detected === "unicode") || (dir === "u2b" && detected === "bijoy");

  const swap = () => {
    setInput(output);
    setDir((d) => (d === "b2u" ? "u2b" : "b2u"));
  };

  const fromLabel = dir === "b2u" ? "Bijoy (SutonnyMJ)" : "Unicode Bangla";
  const toLabel = dir === "b2u" ? "Unicode Bangla" : "Bijoy (SutonnyMJ)";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { value: "b2u", label: "Bijoy → Unicode" },
            { value: "u2b", label: "Unicode → Bijoy" },
          ]}
          value={dir}
          onChange={setDir}
        />
        <Button size="sm" variant="outline" onClick={swap} disabled={!input}>
          <ArrowLeftRight className="h-3.5 w-3.5" /> Swap
        </Button>
        {input ? (
          <Button size="sm" variant="ghost" onClick={() => setInput("")}>
            Clear
          </Button>
        ) : null}
      </div>

      {mismatch ? (
        <p className="rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">
          This looks like {detected === "unicode" ? "Unicode Bangla" : "Bijoy text"}.{" "}
          <button type="button" className="font-medium underline" onClick={() => setDir(detected === "unicode" ? "u2b" : "b2u")}>
            Switch to {detected === "unicode" ? "Unicode → Bijoy" : "Bijoy → Unicode"}
          </button>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex min-w-0 flex-col p-4">
          <Label htmlFor="bu-in" className="mb-2">
            {fromLabel}
          </Label>
          <textarea
            id="bu-in"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              dir === "b2u" ? "Paste Bijoy text here, e.g. Avgvi †mvbvi evsjv" : "এখানে ইউনিকোড বাংলা লিখুন বা পেস্ট করুন"
            }
            spellCheck={false}
            className={`min-h-64 w-full flex-1 resize-y rounded-[10px] border border-line-strong p-3 text-[15px] leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none ${dir === "u2b" ? "font-bangla" : "font-mono"}`}
          />
        </Card>
        <Card className="flex min-w-0 flex-col p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Label>{toLabel}</Label>
            <Button
              size="sm"
              variant="accent"
              disabled={!output}
              onClick={async () => {
                if (!(await copyText(output))) return toast("Couldn't copy. Select the text and press Ctrl+C.", "error");
                toast(dir === "b2u" ? "Unicode text copied." : "Bijoy text copied — paste it into a SutonnyMJ text box.");
              }}
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <textarea
            readOnly
            value={output}
            aria-label={`Result in ${toLabel}`}
            className={`min-h-64 w-full flex-1 resize-y rounded-[10px] border border-line bg-paper p-3 text-[15px] leading-relaxed focus:outline-none ${dir === "b2u" ? "font-bangla" : "font-mono"}`}
          />
        </Card>
      </div>
      <p className="text-xs text-subtle">
        {stats.words} words · {stats.chars} letters · {stats.lines} lines.{" "}
        {dir === "u2b"
          ? "Bijoy text only looks right in a Bijoy font (SutonnyMJ etc.) — here it shows as English letters."
          : "Numbers typed in Bijoy become Bangla digits (১২৩). English words in the same text get converted too, so convert only the Bangla part."}
      </p>
    </div>
  );
}

function FileConverter() {
  const [file, setFile] = useState(null);
  const [force, setForce] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();

  const convert = () =>
    run("convert", async () => {
      const out = await convertBijoyFile(file, { force, onProgress: (p) => setProgress(`${p.stage} ${Math.round(p.percent)}%`) });
      setProgress("");
      setResult([{ name: out.name, blob: out.blob }]);
    });

  return (
    <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
      <Card className="h-fit p-5">
        <Step n={1} title="Choose the file">
          {file ? (
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-brand-500" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <FileDrop
              accept={docTypes}
              listenPaste={false}
              onFiles={(f) => {
                setFile(f[0]);
                setResult(null);
              }}
              title="Choose a Word file"
              hint=".docx, .odt, .rtf, .txt or .html typed in SutonnyMJ / Bijoy"
            />
          )}
          <p className="text-xs text-subtle">Old .doc files: open in Word and “Save as” .docx first.</p>
        </Step>
      </Card>
      <Card className="h-fit space-y-4 p-5">
        <Step n={2} title="Convert to Unicode">
          <Checkbox
            label="Convert all text, even if it isn't in a Bijoy font (for files typed in Times New Roman etc.)"
            checked={force}
            onChange={(e) => {
              setForce(e.target.checked);
              setResult(null);
            }}
          />
          <p className="text-xs text-muted">
            Bangla text is changed to Unicode and its font is switched to a Unicode Bangla font. English text in English fonts
            stays as it is. Tables and layout are kept.
          </p>
          <Button variant="accent" disabled={!file || Boolean(busy)} onClick={convert}>
            {busy ? progress || "Converting…" : "Convert file"}
          </Button>
          <ResultFiles files={result} />
        </Step>
      </Card>
    </div>
  );
}
