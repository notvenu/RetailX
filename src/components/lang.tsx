"use client";

import { createContext, useContext } from "react";
import { t, type Key } from "@/lib/i18n";
import type { Lang } from "@/lib/model";

const Ctx = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

/** `const tr = useT(); tr("rec.add")` */
export function useT() {
  const lang = useContext(Ctx);
  return (key: Key) => t(lang, key);
}
