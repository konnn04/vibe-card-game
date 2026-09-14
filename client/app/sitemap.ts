import type { MetadataRoute } from 'next';

/** Màn game là một trang duy nhất (mọi thứ khác nằm sau query `?room=`), cộng
 *  hai trang pháp lý tĩnh mà Discord có thể hỏi tới. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const at = new Date();
  return [
    { url: site, lastModified: at, changeFrequency: 'monthly', priority: 1 },
    { url: `${site}/legal/terms`, lastModified: at, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site}/legal/privacy`, lastModified: at, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
