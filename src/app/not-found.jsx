// src/app/not-found.jsx
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">This page doesn't exist. It may have moved.</p>
      <ButtonLink href="/">Go to all tools</ButtonLink>
    </main>
  );
}
