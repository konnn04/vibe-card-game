import type { MetadataRoute } from 'next';

/**
 * Chặn bot bò vào /api: chúng là endpoint hành động của phòng chơi, không phải
 * nội dung để lập chỉ mục, và một số còn đổi trạng thái ván đấu.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: '/api/' }],
    sitemap: `${site}/sitemap.xml`,
  };
}
