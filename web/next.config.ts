import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Game Locker exports are ~17MB; allow staff uploads through server actions.
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;
