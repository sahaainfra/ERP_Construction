import type { MetadataRoute } from "next";
import { COLOUR_TOKENS } from "@/design/tokens";

// The installable app's manifest (Part 14 REQ-FIELD-F05). Colours come from the design tokens, not literals (CP-DS-02).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ERP Construction",
    short_name: "ERP",
    description: "Site, store and project work for construction teams",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: COLOUR_TOKENS["bg-page"].light,
    theme_color: COLOUR_TOKENS["brand-primary"].light,
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
