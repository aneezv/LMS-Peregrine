import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Peregrine T&C | LMS",
    short_name: "Peregrine LMS",
    description: "Advanced Learning Management System",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#064E3B",
    orientation: "portrait",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/desktop.png",
        sizes: "1898x910",
        type: "image/png",
        form_factor: "wide",
        label: "Peregrine LMS dashboard on desktop",
      },
      {
        src: "/screenshots/mobile.png",
        sizes: "448x800",
        type: "image/png",
        form_factor: "narrow",
        label: "Peregrine LMS dashboard on mobile",
      },
    ],
  };
}
