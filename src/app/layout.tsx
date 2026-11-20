import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Public_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const publicSans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"], display: "swap" });
// alternates a business can pick in Settings → Theme; not preloaded, fetched only when used
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", preload: false });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"], display: "swap", preload: false });

export const viewport: Viewport = { themeColor: "#3538cd" };

export const metadata: Metadata = {
  title: "RetailX — the operating system for small business",
  description: "Sign up, describe your business, and get modules, KPIs, forecasts and an AI leadership team shaped to it.",
  appleWebApp: { capable: true, title: "RetailX", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${publicSans.variable} ${plex.variable} ${serif.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
