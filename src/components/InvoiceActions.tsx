"use client";

import { useEffect } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { btnGhost, btnPrimary } from "@/components/ui";

export function InvoiceActions({ share, autoPrint }: { share: string | null; autoPrint?: boolean }) {
  // the counter's "Save & print" opens the receipt straight into the print dialog
  useEffect(() => { if (autoPrint) window.print(); }, [autoPrint]);
  return (
    <div className="mx-auto mb-4 flex max-w-2xl justify-end gap-2 print:hidden">
      {share ? <a href={share} target="_blank" rel="noreferrer" className={btnGhost}><MessageCircle className="size-3.5" /> Send on WhatsApp</a> : null}
      <button className={btnPrimary} onClick={() => window.print()}><Printer className="size-3.5" /> Print / save as PDF</button>
    </div>
  );
}
