import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Node.js 전용 패키지를 서버 번들에서 외부화 (Edge Runtime 충돌 방지)
  serverExternalPackages: ["@supabase/ssr"],
};

export default nextConfig;
