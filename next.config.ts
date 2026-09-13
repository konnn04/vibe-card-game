import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
