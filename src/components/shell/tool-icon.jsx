// src/components/shell/tool-icon.jsx
import {
  ArrowDownUp,
  ArrowLeftRight,
  CalendarClock,
  Eraser,
  FileImage,
  FileLock,
  FileStack,
  FileUser,
  IdCard,
  Images,
  Keyboard,
  Languages,
  LayoutGrid,
  Minimize2,
  Rows3,
  ScanText,
  Scissors,
  ScrollText,
  Shrink,
  Signature,
  Stamp,
  Users,
  Wand2,
  Wrench,
} from "lucide-react";

const icons = {
  ArrowDownUp,
  ArrowLeftRight,
  CalendarClock,
  Eraser,
  FileImage,
  FileLock,
  FileStack,
  FileUser,
  IdCard,
  Images,
  Keyboard,
  Languages,
  LayoutGrid,
  Minimize2,
  Rows3,
  ScanText,
  Scissors,
  ScrollText,
  Shrink,
  Signature,
  Stamp,
  Users,
  Wand2,
};

export function ToolIcon({ name, className }) {
  const Icon = icons[name] ?? Wrench;
  return <Icon className={className} aria-hidden="true" />;
}