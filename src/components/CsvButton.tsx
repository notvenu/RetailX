"use client";

import { Download } from "lucide-react";
import { btnGhost } from "@/components/ui";

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function CsvButton({ rows, name }: { rows: string[][]; name: string }) {
  return (
    <button className={btnGhost} onClick={() => {
      const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" }));
      Object.assign(document.createElement("a"), { href: url, download: name }).click();
      URL.revokeObjectURL(url);
    }}>
      <Download className="size-3.5" /> Export CSV
    </button>
  );
}
