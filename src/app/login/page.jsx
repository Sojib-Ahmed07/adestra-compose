// src/app/login/page.jsx
import { redirect } from "next/navigation";
import { getShop } from "@/server/queries/settings";
import { getCurrentUser, safeNext } from "@/server/session";
import { LoginForm } from "@/components/shell/login-form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));
  const shop = await getShop();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-lg font-semibold text-white">
            {shop.name.slice(0, 1).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold text-white">{shop.name}</h1>
          {shop.tagline ? <p className="mt-1 text-sm text-ink-300">{shop.tagline}</p> : null}
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-float)]">
          <LoginForm next={safeNext(next)} />
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Forgot your password? Ask the shop owner to set a new one in Settings › Team.
        </p>
      </div>
    </main>
  );
}
