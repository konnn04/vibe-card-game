import { ImageResponse } from 'next/og';

/**
 * Ảnh xem trước khi dán link (Discord, Facebook, Zalo, Twitter...).
 *
 * Vẽ bằng ImageResponse thay vì kèm một file .png tĩnh: đổi tên game hay tagline
 * thì ảnh tự đổi theo, không ai phải nhớ đi xuất lại ảnh. Cố tình KHÔNG nạp font
 * ngoài — mỗi lần sinh ảnh sẽ phải tải font đó, mà đây là thứ bot mạng xã hội
 * gọi vào lúc không đoán trước được.
 */
export const alt = 'Ú Nồ — 3D card party game';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 42%, #FF9A3C 0%, #C1201B 42%, #40040A 100%)',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 150,
            fontWeight: 700,
            color: '#FFD34D',
            letterSpacing: -4,
            textShadow: '0 10px 0 #7A2A06',
          }}
        >
          Ú NỒ!
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 40, color: '#FFF3DA', letterSpacing: 6 }}>
          CARD PARTY
        </div>
        <div style={{ display: 'flex', marginTop: 34, fontSize: 28, color: '#F6C79A' }}>
          3D table · Classic &amp; Flip decks · Play in Discord
        </div>
      </div>
    ),
    size,
  );
}
