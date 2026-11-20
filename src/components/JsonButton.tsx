"use client";

import { Download } from "lucide-react";
import { btnGhost } from "@/components/ui";

/** Downloads `data` as JSON, or `text` as is (Tally XML and the like). */
export function JsonButton({ data, text, mime = "application/json", name, label }: { data?: unknown; text?: string; mime?: string; name: string; label: string }) {
  return (
    <button className={btnGhost} onClick={() => {
      const url = URL.createObjectURL(new Blob([text ?? JSON.stringify(data, null, 2)], { type: mime }));
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
    }}>
      <Download className="size-3.5" /> {label}
    </button>
  );
}
