// src/components/shell/tool-icon.jsx
import { Eraser, FileUser, IdCard, LayoutGrid, ScrollText, Users, Wand2, Wrench } from "lucide-react";

const icons = { Eraser, FileUser, IdCard, LayoutGrid, ScrollText, Users, Wand2 };

export function ToolIcon({ name, className }) {
  const Icon = icons[name] ?? Wrench;
  return <Icon className={className} aria-hidden="true" />;
}