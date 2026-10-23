import type { NextConfig } from "next";
const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: "60mb" } } };
export default nextConfig;