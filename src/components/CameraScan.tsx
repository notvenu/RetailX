"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { btnGhost } from "@/components/ui";

type Detector = { detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/**
 * A phone or laptop camera as a barcode scanner, using the browser's built-in BarcodeDetector (Chrome, Edge,
 * Android). Where the browser lacks it the button says so, and a USB scanner or typing still works.
 * ponytail: no JS decoder fallback (Safari/Firefox), add zxing-wasm if shops on those browsers need it.
 */
export function CameraScan({ onCode }: { onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    if (!open) return;
    const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!Ctor) { setErr("This browser can't read barcodes from the camera. Use Chrome or Edge, or a USB scanner."); return; }
    let stream: MediaStream | undefined, timer: ReturnType<typeof setInterval> | undefined, last = "", lastAt = 0, live = true;
    const det = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((s) => {
      if (!live) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      const v = video.current!;
      v.srcObject = s;
      void v.play();
      timer = setInterval(async () => {
        if (v.readyState < 2) return;
        const [hit] = await det.detect(v).catch(() => []);
        // the same code stays in frame for a second or two: count it once
        if (hit && (hit.rawValue !== last || Date.now() - lastAt > 2500)) { last = hit.rawValue; lastAt = Date.now(); cb.current(hit.rawValue); }
      }, 250);
    }, () => setErr("Camera blocked. Allow camera access for this site in the browser, then try again."));
    return () => { live = false; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [open]);

  return (
    <>
      <button type="button" className={`${btnGhost} px-2.5`} aria-label="Scan with camera" title="Scan with camera" onClick={() => { setErr(""); setOpen(true); }}>
        <Camera className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="dialog" aria-label="Camera scanner" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-sm bg-surface p-3 shadow-overlay">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[0.85rem] font-semibold">Point at a barcode</p>
              <button type="button" aria-label="Close scanner" className="p-1 text-ink-soft hover:text-ink" onClick={() => setOpen(false)}><X className="size-4" /></button>
            </div>
            {err ? <p className="py-6 text-center text-[0.82rem] text-bad">{err}</p> : <video ref={video} muted playsInline className="aspect-[4/3] w-full rounded-sm bg-black object-cover" />}
            <p className="mt-2 text-[0.72rem] text-ink-faint">Each code you scan is added to the bill. Keep this open to scan the next one.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
