// src/components/tools/pdf-protect.jsx
"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { runQpdf } from "@/lib/pdf/engine";
import { pdfBlob, suffixName } from "@/lib/pdf/ops";
import { PdfPicker, ResultFiles, useJob } from "@/components/pdf/pdf-bits";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/interactive";
import { Card, Step } from "@/components/ui/misc";

export function PdfProtectTool() {
  const [mode, setMode] = useState("lock");
  return (
    <div className="max-w-2xl space-y-5">
      <Segmented
        options={[
          { value: "lock", label: "Lock with a password" },
          { value: "unlock", label: "Remove a password" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div hidden={mode !== "lock"} data-panel="lock">
        <LockPanel />
      </div>
      <div hidden={mode !== "unlock"} data-panel="unlock">
        <UnlockPanel />
      </div>
    </div>
  );
}

function FileRow({ file, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 truncate text-sm">
        <strong>{file.name}</strong> · {file.pageCount ? `${file.pageCount} page${file.pageCount === 1 ? "" : "s"}` : "locked"}
      </p>
      <Button size="sm" variant="outline" onClick={onChange}>
        Change
      </Button>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete = "new-password" }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((x) => !x)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-subtle hover:text-ink-900"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/** A random owner password so the restrictions can't be lifted by just opening the file. */
function randomPassword() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[^a-zA-Z0-9]/g, "");
}

function LockPanel() {
  const [file, setFile] = useState(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowEdit, setAllowEdit] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();

  useEffect(() => setResult(null), [file, pw, pw2, allowPrint, allowCopy, allowEdit]);

  const tooShort = pw.length > 0 && pw.length < 4;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ready = file && pw.length >= 4 && pw === pw2;

  const lock = () =>
    run("lock", async () => {
      const out = await runQpdf(file.bytes, (inp, outp) => [
        "--encrypt",
        `--user-password=${pw}`,
        `--owner-password=${randomPassword()}`,
        "--bits=256",
        `--print=${allowPrint ? "full" : "none"}`,
        `--modify=${allowEdit ? "all" : "none"}`,
        `--extract=${allowCopy ? "y" : "n"}`,
        "--",
        inp,
        outp,
      ]);
      setResult([{ name: suffixName(file.name, "locked"), blob: pdfBlob(out) }]);
    });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Step n={1} title="Choose PDF">
          {file ? <FileRow file={file} onChange={() => setFile(null)} /> : <PdfPicker onFiles={(f) => setFile(f[0])} />}
        </Step>
      </Card>
      <Card className="space-y-4 p-5">
        <Step n={2} title="Password">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" htmlFor="lk-pw" error={tooShort ? "At least 4 characters." : undefined}>
              <PasswordInput id="lk-pw" value={pw} onChange={setPw} />
            </Field>
            <Field label="Password again" htmlFor="lk-pw2" error={mismatch ? "The passwords don't match." : undefined}>
              <PasswordInput id="lk-pw2" value={pw2} onChange={setPw2} />
            </Field>
          </div>
          <div className="space-y-2 rounded-xl bg-paper p-4">
            <p className="text-xs font-medium text-ink-800">After opening with the password, the reader may:</p>
            <Checkbox label="Print" checked={allowPrint} onChange={(e) => setAllowPrint(e.target.checked)} />
            <br />
            <Checkbox label="Copy text and images" checked={allowCopy} onChange={(e) => setAllowCopy(e.target.checked)} />
            <br />
            <Checkbox label="Edit the file" checked={allowEdit} onChange={(e) => setAllowEdit(e.target.checked)} />
          </div>
          <p className="text-xs text-subtle">
            AES-256 encryption. Tell the customer the password — it can't be recovered if forgotten.
          </p>
          <Button variant="accent" disabled={!ready || Boolean(busy)} onClick={lock}>
            <Lock className="h-4 w-4" /> {busy ? "Locking…" : "Lock PDF"}
          </Button>
          <ResultFiles files={result} />
        </Step>
      </Card>
    </div>
  );
}

function UnlockPanel() {
  const [file, setFile] = useState(null);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [busy, run] = useJob();

  useEffect(() => {
    setResult(null);
    setError("");
  }, [file, pw]);

  const unlock = () =>
    run("unlock", async () => {
      try {
        const out = await runQpdf(file.bytes, (inp, outp) => [`--password=${pw}`, "--decrypt", inp, outp]);
        setResult([{ name: suffixName(file.name, "unlocked"), blob: pdfBlob(out) }]);
      } catch (err) {
        if (/invalid password/i.test(err.qpdf || err.message)) setError("Wrong password. Check capital letters and try again.");
        else throw new Error("Couldn't unlock this PDF. It may be damaged.");
      }
    });

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Step n={1} title="Choose the locked PDF">
          {file ? (
            <FileRow file={file} onChange={() => setFile(null)} />
          ) : (
            <PdfPicker allowEncrypted onFiles={(f) => setFile(f[0])} />
          )}
          {file && !file.encrypted ? <p className="text-sm text-muted">This PDF has no password. Nothing to remove.</p> : null}
        </Step>
      </Card>
      {file?.encrypted ? (
        <Card className="space-y-4 p-5">
          <Step n={2} title="Password">
            <Field
              label="The PDF's password"
              htmlFor="ul-pw"
              error={error || undefined}
              hint="Leave empty if the file opens without a password but can't be printed or copied."
            >
              <PasswordInput id="ul-pw" value={pw} onChange={setPw} autoComplete="off" />
            </Field>
            <Button variant="accent" disabled={Boolean(busy)} onClick={unlock}>
              <LockOpen className="h-4 w-4" /> {busy ? "Unlocking…" : "Remove password"}
            </Button>
            <ResultFiles files={result} />
          </Step>
        </Card>
      ) : null}
    </div>
  );
}
