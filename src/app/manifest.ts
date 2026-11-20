import type { MetadataRoute } from "next";

/** Installable on phones: "Add to home screen" opens straight into the dashboard, full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RetailX",
    short_name: "RetailX",
    description: "Run your business: records, KPIs, forecasts and an AI leadership team.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fcfcfb",
    theme_color: "#3538cd",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add a sale", url: "/m/sales?add=1" },
      { name: "Tasks", url: "/tasks" },
    ],
  };
}
