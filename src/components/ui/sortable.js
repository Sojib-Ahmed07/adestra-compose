// src/components/ui/sortable.js
"use client";

import { useRef, useState } from "react";

/** Move item at `from` to `to` (returns a new array). */
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag-and-drop reordering for a list (mouse). Pair it with up/down buttons for touch screens.
 * const { itemProps, overIndex } = useDragSort(list, setList);  <li {...itemProps(i)}>
 */
export function useDragSort(list, setList) {
  const from = useRef(-1);
  const [overIndex, setOverIndex] = useState(-1);
  const itemProps = (i) => ({
    draggable: true,
    onDragStart: (e) => {
      from.current = i;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(i));
    },
    onDragOver: (e) => {
      if (from.current < 0) return;
      e.preventDefault();
      if (overIndex !== i) setOverIndex(i);
    },
    onDragLeave: () => setOverIndex((o) => (o === i ? -1 : o)),
    onDrop: (e) => {
      e.preventDefault();
      if (from.current >= 0) setList(moveItem(list, from.current, i));
      from.current = -1;
      setOverIndex(-1);
    },
    onDragEnd: () => {
      from.current = -1;
      setOverIndex(-1);
    },
  });
  return { itemProps, overIndex };
}
