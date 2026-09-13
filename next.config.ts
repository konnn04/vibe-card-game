import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',

  // Cho phép nhúng trong iframe Discord Activity
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.discord.com https://discord.com;",
          },
        ],
      },
      {
        source: '/:path(card-texture|sfx|music-theme)/:file*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=600, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
