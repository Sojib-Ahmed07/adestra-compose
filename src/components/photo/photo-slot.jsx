// src/components/photo/photo-slot.jsx
"use client";

import { useId } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { defaultEdit, loadImage } from "@/lib/photo/image";
import { FileDrop } from "@/components/ui/file-drop";
import { useToast } from "@/components/ui/interactive";
import { CropEditor } from "./crop-editor";

/**
 * One photo: upload → crop/adjust. Value = { image, edit } | null.
 * @param {{ title: string, value: any, onChange: (v: any) => void, aspect: number, guide?: "face" | "none",
 *   fit?: "cover" | "contain", maxHeight?: number, hint?: string }} props
 */
export function PhotoSlot({ title, value, onChange, aspect, guide = "none", fit = "cover", maxHeight = 360, hint }) {
  const toast = useToast();
  const changeId = useId();

  const take = async (files) => {
    try {
      const image = await loadImage(files[0]);
      if (value?.image?.url) setTimeout(() => URL.revokeObjectURL(value.image.url), 1000);
      onChange({ image, edit: { ...defaultEdit } });
    } catch (err) {
      toast(err.message, "error");
    }
  };

  if (!value) {
    return <FileDrop onFiles={take} title={title} hint={hint ?? "Click to choose, or drag a file here"} listenPaste={false} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-ink-900">{title}</p>
        <div className="flex shrink-0 gap-1">
          <label
            htmlFor={changeId}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Change
            <input
              id={changeId}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) take(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setTimeout(() => URL.revokeObjectURL(value.image.url), 1000);
              onChange(null);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-danger-50 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>
      <CropEditor
        img={value.image.img}
        edit={value.edit}
        onChange={(edit) => onChange({ ...value, edit })}
        aspect={aspect}
        guide={guide}
        fit={fit}
        maxHeight={maxHeight}
      />
    </div>
  );
}
