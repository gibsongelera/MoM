import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendered in Node route handlers (minutes PDF export); bundling it breaks its font/layout engine.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
