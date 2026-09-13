import type { NextConfig } from 'next';

const firebaseDbUrl =
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ||
  process.env.FIREBASE_DATABASE_URL ||
  'https://rush-games-e8823-default-rtdb.asia-southeast1.firebasedatabase.app';

const nextConfig: NextConfig = {
  // Cho phép nhúng trong iframe Discord Activity
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://*.discord.com https://discord.com" }],
      },
    ];
  },
  // Proxy Firebase RTDB qua same-origin để tránh CSP của Discord iframe
  async rewrites() {
    return [
      {
        source: '/firebase/:path*',
        destination: `${firebaseDbUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
