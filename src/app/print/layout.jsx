// src/app/print/layout.jsx
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";

/** Printable pages: no menu, white background. */
export default async function PrintLayout({ children }) {
  await requireUser();
  return <div className="min-h-dvh bg-ink-100 print:bg-white">{children}</div>;
}
