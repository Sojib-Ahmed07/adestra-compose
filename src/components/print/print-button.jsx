// src/components/print/print-button.jsx
"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }) {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()}>
      <Printer className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
