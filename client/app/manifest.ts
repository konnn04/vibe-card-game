import type { MetadataRoute } from 'next';

/**
 * Cho phép cài như ứng dụng trên điện thoại. `display: fullscreen` vì game vẽ
 * toàn màn, thanh địa chỉ chỉ tổ ăn mất chiều cao của quạt bài.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ú NỒ! Card Party',
    short_name: 'Ú Nồ',
    description: 'Game bài party với bàn chơi 3D, bộ cổ điển và bộ Flip hai mặt.',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#40040A',
    theme_color: '#40040A',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
