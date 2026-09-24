import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Read Well",
    short_name: "Read Well",
    description: "Grade 1 Reading Assessment",
    start_url: "/login",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6b8f71",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
