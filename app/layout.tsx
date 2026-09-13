import type { Metadata, Viewport } from 'next';
import { Baloo_2, Barlow_Semi_Condensed } from 'next/font/google';
import './globals.css';

// Baloo 2 = chữ hiển thị/số trên lá bài; Barlow Semi Condensed = nhãn viết hoa giãn chữ
const baloo = Baloo_2({ variable: '--font-baloo', subsets: ['latin', 'vietnamese'], weight: ['600', '700', '800'] });
const barlow = Barlow_Semi_Condensed({
  variable: '--font-barlow', subsets: ['latin', 'vietnamese'], weight: ['500', '600', '700'],
});

/**
 * URL gốc để Next dựng link tuyệt đối cho ảnh xem trước và canonical.
 * Thiếu biến môi trường thì rơi về localhost — vẫn chạy được, chỉ là link chia
 * sẻ sẽ trỏ về máy mình, nên nhớ đặt biến này khi deploy.
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const DESCRIPTION =
  'Ú Nồ — game bài party với bàn chơi 3D. Chơi bộ cổ điển hoặc bộ Flip hai mặt, '
  + 'đấu với máy hoặc rủ tối đa 4 người vào cùng phòng, chơi thẳng trong Discord.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Trang con (nếu thêm sau) tự nối vào sau tên game, khỏi lặp lại tay.
  title: { default: 'Ú NỒ! Card Party', template: '%s · Ú NỒ!' },
  description: DESCRIPTION,
  applicationName: 'Ú Nồ',
  keywords: ['ú nồ', 'uno', 'game bài', 'card game', 'discord activity', '3d card game', 'uno flip'],
  authors: [{ name: 'Ú Nồ' }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Ú NỒ! Card Party',
    title: 'Ú NỒ! Card Party',
    description: DESCRIPTION,
    url: '/',
    locale: 'vi_VN',
  },
  twitter: { card: 'summary_large_image', title: 'Ú NỒ! Card Party', description: DESCRIPTION },
  robots: { index: true, follow: true },
  // Icon lấy từ app/icon.svg (Next tự nhận). Khai thêm mask-icon cho Safari.
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/icon.svg' },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#40040A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${baloo.variable} ${barlow.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
