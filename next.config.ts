import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Gói sẵn một server tối giản vào .next/standalone.
   *
   * Dành cho Docker: image chạy chỉ cần node + đúng những file thật sự được
   * import, KHÔNG cần cả node_modules (vài trăm MB) lẫn mã nguồn. Chạy
   * `next start` như thường vẫn không đổi gì — đây chỉ là thư mục được xuất
   * thêm ra.
   */
  output: 'standalone',

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
        /*
         * ẢNH BÀI VÀ ÂM THANH — cho phép cache lâu.
         *
         * public/ nặng ~87MB. Không có chỉ dẫn cache thì mặc định là
         * "must-revalidate": mỗi lần mở game, mỗi tệp lại tốn một lượt hỏi
         * server (kể cả khi trả về 304). Qua proxy của Discord thì mỗi lượt đó
         * còn đắt hơn nữa.
         *
         * KHÔNG dùng 'immutable': mấy tệp này không có hash trong tên và thỉnh
         * thoảng được xuất lại, immutable là người chơi cũ dính hình cũ vĩnh
         * viễn (đúng lý do trước đây đã bỏ cache:'force-cache' trong Preloader).
         * stale-while-revalidate cho cái tốt của cả hai: mở game là có ngay từ
         * cache, còn bản mới được kéo về ngầm ở nền.
         */
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
