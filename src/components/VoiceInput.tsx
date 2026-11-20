"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { btnGhost } from "@/components/ui";

type Rec = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };

/** "3 milk" → "3*milk", the counter's quantity syntax. Anything else passes through. */
export const spokenToQuery = (t: string) => t.trim().replace(/^(\d+(?:\.\d+)?)\s*(?:x|×|kg|kilo|packets?|pieces?)?\s+(?=\S)/i, "$1*");

/**
 * Speak an item instead of typing it, using the browser's built-in speech recognition (Chrome, Edge, Android).
 * Hidden where it doesn't exist. ponytail: browser engine only, so no offline and no Tamil/Marathi guarantees; swap in a server STT if needed.
 */
export function VoiceInput({ lang = "en-IN", onText }: { lang?: string; onText: (text: string) => void }) {
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  const [Ctor, setCtor] = useState<(new () => Rec) | undefined>();
  // after mount, so the server and first client render agree (no button), then it appears where supported
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    setCtor(() => w.SpeechRecognition ?? w.webkitSpeechRecognition);
  }, []);
  if (!Ctor) return null;
  const toggle = () => {
    if (on) return rec.current?.stop();
    const r = new Ctor();
    r.lang = lang; r.interimResults = false;
    r.onresult = (e) => onText(spokenToQuery(e.results[0][0].transcript));
    r.onend = r.onerror = () => setOn(false);
    rec.current = r; setOn(true); r.start();
  };
  return (
    <button type="button" className={`${btnGhost} px-2.5 ${on ? "border-accent text-accent" : ""}`} aria-pressed={on} aria-label="Speak an item" title="Speak an item, e.g. “3 milk”" onClick={toggle}>
      <Mic className="size-4" aria-hidden />
    </button>
  );
}
