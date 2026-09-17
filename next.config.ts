import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["grok-js", "oniguruma"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
