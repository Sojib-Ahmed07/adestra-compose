// src/app/(app)/layout.jsx
import { requireUser } from "@/server/session";
import { getShop } from "@/server/queries/settings";
import { AppShell } from "@/components/shell/app-shell";
import { ToastProvider } from "@/components/ui/interactive";

// Signed-in pages are always rendered per request (never at build time).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const [user, shop] = await Promise.all([requireUser(), getShop()]);
  return (
    <ToastProvider>
      <AppShell user={user} shopName={shop.name}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
