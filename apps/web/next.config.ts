import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  typedRoutes: true,
  // dev 模式默认只信任 localhost,局域网 IP 访问时 HMR/客户端资源会被跨域拦截,页面不水合
  allowedDevOrigins: ["192.168.31.213"]
};

export default nextConfig;
