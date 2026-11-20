"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { decide } from "@/app/actions";
import { btnGhost, btnPrimary } from "@/components/ui";
import { orAlert } from "@/lib/result";

export function ApproveButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 gap-2">
      <button className={btnGhost} disabled={pending} onClick={() => start(async () => { await orAlert(decide(id, false)); })}><X className="size-3.5" /> Reject</button>
      <button className={btnPrimary} disabled={pending} onClick={() => start(async () => { await orAlert(decide(id, true)); })}><Check className="size-3.5" /> Approve</button>
    </span>
  );
}
