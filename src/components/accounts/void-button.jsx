// src/components/accounts/void-button.jsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidEntry, voidPayment } from "@/server/actions/accounts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Modal, useToast } from "@/components/ui/interactive";

/** Cancel an entry or payment, with a reason. It stays visible as "Cancelled". */
export function VoidButton({ id, what = "entry", label = "Cancel this entry", size = "sm" }) {
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = what === "payment" ? await voidPayment(id, reason) : await voidEntry(id, reason);
      if (!res.ok) {
        setError(res.fieldErrors?.reason || "");
        if (res.error) toast(res.error, "error");
        return;
      }
      toast(what === "payment" ? "Payment cancelled." : "Entry cancelled.");
      setOpen(false);
      setReason("");
      router.refresh();
    });

  return (
    <>
      <Button size={size} variant="ghost" className="text-danger hover:bg-danger-50" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={pending} onClick={confirm}>
              {pending ? "Cancelling…" : "Cancel it"}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-muted">
          It won't count in totals or dues any more, but it stays in the records with your name and the reason. This can't be
          undone — enter it again if needed.
        </p>
        <Field label="Reason" htmlFor="void-reason" error={error}>
          <Input
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Entered twice, wrong amount"
            autoFocus
          />
        </Field>
      </Modal>
    </>
  );
}
