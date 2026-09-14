'use client';
import { themeMeta, type BgTheme } from '@/src/lib/themes';

/* ───────────────────────────────────────────────────────── các cảnh nền */

type Style = React.CSSProperties;

const fill: Style = { position: 'absolute', inset: 0 };

/** Hơi nóng bốc lên từ tách cà phê (4 luồng lệch pha). */
const STEAM = [0, 1, 2, 3].map((i) => ({
  left: 34 + i * 14,
  size: 20 + i * 5,
  dur: `${(4.2 + i * 0.7).toFixed(1)}s`,
  delay: `${(i * 1.1).toFixed(1)}s`,
}));

/** Toạ độ đốm sáng/lá rơi: cố định, KHÔNG random — render thuần, khung hình ổn định. */
const rnd = (i: number, a: number, b: number) => a + (((i * 37) % 13) / 13) * (b - a);
const SPARKS = [0, 1, 2, 3, 4, 5].map((i) => ({
  left: `${8 + i * 15}%`,
  top: `${34 + (i % 3) * 14}%`,
  dur: `${(9 + rnd(i, 0, 7)).toFixed(1)}s`,
  delay: `${(i * 1.4).toFixed(1)}s`,
}));
const LEAVES = [0, 1, 2, 3, 4, 5].map((i) => ({
  left: `${14 + i * 14}%`,
  top: `${8 + (i % 3) * 9}%`,
  color: ['#D98A34', '#C2632A', '#E0A63F'][i % 3],
  dur: `${(7 + rnd(i, 0, 5)).toFixed(1)}s`,
  delay: `${(i * 1.6).toFixed(1)}s`,
}));

function CafeScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(#140E14 0%,#1B1218 42%,#241519 70%,#160F12 100%)' }}>
      <div style={{ ...fill, background: 'radial-gradient(ellipse 46% 40% at 50% 6%, rgba(255,176,84,.34), transparent 70%),radial-gradient(ellipse 30% 46% at 92% 34%, rgba(90,170,190,.16), transparent 70%)' }} />
      {/* Kệ/ván ốp tường phía sau — vệt dọc rất mờ, chỉ để mắt bắt được chiều sâu. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '46%', background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.022) 0 2px, transparent 2px 46px)' }} />

      {/* Đèn thả rủ — gốc xoay đặt ở TRẦN nên nó đung đưa như thật. */}
      <div style={{ position: 'absolute', left: '20%', top: 0, transformOrigin: '50% 0', animation: 'bgSway 7s ease-in-out infinite' }}>
        <div style={{ position: 'absolute', left: 0, top: -14, width: 2, height: 96, background: 'rgba(255,214,150,.35)' }} />
        <div style={{ position: 'absolute', left: 0, top: 82, width: 132, height: 54, marginLeft: -66, borderRadius: '66px 66px 14px 14px', background: 'linear-gradient(#2E1C16,#1B100D)', boxShadow: '0 16px 40px rgba(0,0,0,.6)' }} />
        <div style={{ position: 'absolute', left: 0, top: 130, width: 520, height: 440, marginLeft: -260, background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(255,186,92,.32), transparent 72%)', filter: 'blur(2px)', animation: 'bgFlicker 6.5s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', left: 0, top: 128, width: 26, height: 12, marginLeft: -13, borderRadius: '50%', background: '#FFD79A', boxShadow: '0 0 40px 18px rgba(255,182,90,.55)', animation: 'bgFlicker 6.5s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'absolute', right: '22%', top: 0, transformOrigin: '50% 0', animation: 'bgSway 9s ease-in-out infinite' }}>
        <div style={{ position: 'absolute', right: 0, top: -14, width: 2, height: 58, background: 'rgba(255,214,150,.3)' }} />
        <div style={{ position: 'absolute', right: 0, top: 44, width: 98, height: 40, marginRight: -49, borderRadius: '50px 50px 10px 10px', background: 'linear-gradient(#2E1C16,#1B100D)', boxShadow: '0 12px 30px rgba(0,0,0,.55)' }} />
        <div style={{ position: 'absolute', right: 0, top: 80, width: 30, height: 14, marginRight: -15, borderRadius: '50%', background: '#FFCD86', boxShadow: '0 0 34px 14px rgba(255,170,80,.45)', animation: 'bgFlicker 4.2s ease-in-out .8s infinite' }} />
        <div style={{ position: 'absolute', right: 0, top: 86, width: 360, height: 330, marginRight: -180, background: 'radial-gradient(ellipse 50% 60% at 50% 0%, rgba(255,170,80,.16), transparent 72%)' }} />
      </div>

      {/* Mặt bàn gỗ chiếm dải dưới, vân gỗ chạy ngang. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', background: 'linear-gradient(#3A2118,#24130E 58%,#160C0A)', boxShadow: 'inset 0 2px 0 rgba(255,196,128,.22)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '40%', background: 'repeating-linear-gradient(92deg, rgba(0,0,0,.16) 0 3px, transparent 3px 34px)' }} />
      <div style={{ position: 'absolute', left: '50%', bottom: '8%', width: '82%', height: 210, transform: 'translateX(-50%)', background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,178,92,.20), transparent 72%)', animation: 'bgFlicker 6.5s ease-in-out infinite' }} />

      {/* Tách cà phê bốc khói, kê ở mép trái mặt bàn. */}
      <div style={{ position: 'absolute', left: 118, bottom: '16%' }}>
        <div style={{ width: 128, height: 26, borderRadius: '50%', background: 'rgba(0,0,0,.45)', filter: 'blur(3px)' }} />
        <div style={{ position: 'absolute', left: 14, bottom: 8, width: 96, height: 72, borderRadius: '10px 10px 42px 42px', background: 'linear-gradient(100deg,#F2E4D2,#CBB49C)', boxShadow: '0 10px 22px rgba(0,0,0,.5)' }} />
        <div style={{ position: 'absolute', left: 98, bottom: 26, width: 34, height: 34, borderRadius: '50%', border: '9px solid #E4D3BE' }} />
        <div style={{ position: 'absolute', left: 30, bottom: 74, width: 64, height: 12, borderRadius: '50%', background: '#4A2A18' }} />
        {STEAM.map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: p.left, bottom: 80, width: p.size, height: p.size, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,240,220,.7),rgba(255,240,220,0) 70%)', filter: 'blur(5px)', animation: `bgSteam ${p.dur} linear ${p.delay} infinite` }} />
        ))}
      </div>

      <div className="label" style={{ position: 'absolute', right: 132, bottom: '15%', width: 150, height: 46, borderRadius: 9, background: '#1E1414', border: '1px solid rgba(255,196,128,.24)', display: 'grid', placeItems: 'center', fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: '#C79A6C' }}>
        bàn số 07
      </div>
    </div>
  );
}

function MeadowScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(#8FD3E8 0%,#BFE6EC 34%,#E9F0C6 56%,#9CC65A 68%,#5E9636 100%)' }}>
      <div style={{ position: 'absolute', left: '50%', top: '6%', width: 560, height: 560, marginLeft: -280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,247,214,.85),rgba(255,240,190,0) 66%)', animation: 'pulseGlow 9s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '31%', height: 150, animation: 'bgDriftSlow 40s ease-in-out infinite alternate' }}>
        <div style={{ position: 'absolute', left: '18%', top: 14, width: 260, height: 64, borderRadius: 60, background: 'rgba(255,255,255,.8)', filter: 'blur(1px)' }} />
        <div style={{ position: 'absolute', left: '26%', top: -6, width: 160, height: 60, borderRadius: 60, background: 'rgba(255,255,255,.88)' }} />
        <div style={{ position: 'absolute', right: '19%', top: 56, width: 280, height: 58, borderRadius: 60, background: 'rgba(255,255,255,.66)', filter: 'blur(2px)' }} />
      </div>
      {/* Hai ngọn đồi chồng lớp -> chiều sâu, rồi tới thảm cỏ tiền cảnh. */}
      <div style={{ position: 'absolute', left: '-6%', right: '-6%', bottom: '26%', height: '37%', borderRadius: '50% 50% 0 0', background: 'linear-gradient(#8FBE4E,#6BA23C)' }} />
      <div style={{ position: 'absolute', left: '40%', right: '-14%', bottom: '28%', height: '32%', borderRadius: '50% 50% 0 0', background: 'linear-gradient(#A6CE62,#7DB045)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '36%', background: 'linear-gradient(#79AE41,#3F6E28)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '36%', background: 'repeating-linear-gradient(96deg, rgba(255,255,255,.07) 0 4px, transparent 4px 26px)', transformOrigin: '50% 100%', animation: 'bgGrassWave 6s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '31%', height: 70, background: 'repeating-linear-gradient(90deg, transparent 0 34px, rgba(255,255,255,.5) 34px 38px, transparent 38px 72px)', opacity: 0.5, transformOrigin: '50% 100%', animation: 'bgGrassWave 5s ease-in-out .4s infinite' }} />
      {SPARKS.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: p.left, top: p.top, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,.75)', boxShadow: '0 0 10px rgba(255,255,220,.9)', animation: `bgDrift ${p.dur} linear ${p.delay} infinite` }} />
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', background: 'linear-gradient(rgba(20,30,12,0),rgba(18,28,10,.42))' }} />
    </div>
  );
}

function ForestScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(#20304A 0%,#3A4E63 30%,#6E7A7A 52%,#3C4A3C 70%,#1A2418 100%)' }}>
      <div style={{ position: 'absolute', left: '64%', top: '8%', width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle,#FFF6D8,rgba(255,240,200,0) 68%)', animation: 'pulseGlow 12s ease-in-out infinite' }} />
      {/* Hai rặng núi cắt bằng clip-path — rẻ hơn nhiều so với SVG path động. */}
      <div style={{ position: 'absolute', left: '-4%', right: '-4%', bottom: '37%', height: '42%', background: 'linear-gradient(#4E5E72,#33404F)', clipPath: 'polygon(0% 100%,8% 46%,18% 68%,30% 22%,44% 62%,56% 34%,70% 70%,84% 40%,96% 66%,100% 100%)' }} />
      <div style={{ position: 'absolute', left: '-4%', right: '-4%', bottom: '36%', height: '27%', background: 'linear-gradient(#2C3A45,#1F2A32)', clipPath: 'polygon(0% 100%,12% 50%,26% 76%,40% 44%,54% 72%,68% 48%,82% 74%,94% 52%,100% 100%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '33%', height: 180, background: 'linear-gradient(rgba(214,228,232,.55),rgba(214,228,232,0))', filter: 'blur(8px)', animation: 'bgDriftSlow 34s ease-in-out infinite alternate' }} />
      {/* Hàng thân thông tối in bóng lên sương. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '22%', height: '27%', background: 'repeating-linear-gradient(90deg, transparent 0 60px, #16211A 60px 78px, transparent 78px 130px)', clipPath: 'polygon(0 40%,100% 24%,100% 100%,0 100%)', opacity: 0.9 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '37%', background: 'linear-gradient(#24331F,#101809)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '37%', background: 'repeating-linear-gradient(94deg, rgba(255,255,255,.045) 0 3px, transparent 3px 30px)' }} />
      {SPARKS.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: p.left, top: p.top, width: 9, height: 9, borderRadius: '50%', background: '#DFFF9A', boxShadow: '0 0 14px 4px rgba(190,255,120,.65)', animation: `bgTwinkle ${p.dur} ease-in-out ${p.delay} infinite` }} />
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '44%', background: 'linear-gradient(rgba(8,14,8,0),rgba(6,12,6,.5))' }} />
    </div>
  );
}

function ParkScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(#F4C98A 0%,#F0A96E 26%,#D98F6A 46%,#8E7A50 64%,#4A4326 100%)' }}>
      <div style={{ position: 'absolute', left: '22%', top: '11%', width: 420, height: 420, marginLeft: -210, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,236,186,.9),rgba(255,220,150,0) 64%)', animation: 'pulseGlow 10s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '35%', height: 130, background: 'linear-gradient(#6E6B44,#55522F)' }} />
      {/* Hai tán cây lớn hai bên khung — tiền cảnh, không cần chi tiết. */}
      <div style={{ position: 'absolute', left: -40, bottom: '37%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle at 40% 34%,#8C6B3A,#4A3A1E)', filter: 'blur(1px)' }} />
      <div style={{ position: 'absolute', right: -60, bottom: '36%', width: 360, height: 340, borderRadius: '50%', background: 'radial-gradient(circle at 60% 30%,#9A7440,#4E3C1E)' }} />
      <div style={{ position: 'absolute', right: 120, bottom: '35%', width: 26, height: 120, background: '#3A2C16' }} />
      <div style={{ position: 'absolute', left: 120, bottom: '35%', width: 22, height: 110, background: '#3A2C16' }} />
      {/* Cột đèn công viên vừa lên. */}
      <div style={{ position: 'absolute', left: '48%', bottom: '37%', width: 8, height: 190, background: '#2A2A22' }} />
      <div style={{ position: 'absolute', left: '48%', bottom: '58%', width: 44, height: 26, marginLeft: -18, borderRadius: '22px 22px 6px 6px', background: '#23231C' }} />
      <div style={{ position: 'absolute', left: '48%', bottom: '56%', width: 26, height: 14, marginLeft: -9, borderRadius: '50%', background: '#FFE7B0', boxShadow: '0 0 34px 16px rgba(255,214,140,.6)', animation: 'bgFlicker 5s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '37%', background: 'linear-gradient(#6B5C34,#2F2A18)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '37%', background: 'repeating-linear-gradient(92deg, rgba(0,0,0,.12) 0 3px, transparent 3px 40px)' }} />
      {LEAVES.map((p, i) => (
        <div key={i} style={{ position: 'absolute', left: p.left, top: p.top, width: 16, height: 11, borderRadius: '11px 2px 11px 2px', background: p.color, animation: `bgLeafFall ${p.dur} linear ${p.delay} infinite` }} />
      ))}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '42%', background: 'linear-gradient(rgba(30,20,8,0),rgba(26,18,6,.45))' }} />
    </div>
  );
}

const SCENES: Record<BgTheme, () => React.JSX.Element> = {
  cafe: CafeScene, meadow: MeadowScene, forest: ForestScene, park: ParkScene,
};

/**
 * Nền của một màn hình.
 *
 * `dim` quyết định cảnh lùi lại bao xa sau nội dung:
 *  - 'none'   : menu — cảnh CHÍNH LÀ phần nhìn ở đó, để nguyên.
 *  - 'soft'   : bàn chơi — cảnh vẫn nhận ra được nhưng tối và mờ nhẹ, đủ để bài
 *               và HUD nổi hẳn lên. Bàn 3D vẽ trên một canvas TRONG SUỐT đè lên
 *               lớp này, nên quanh bàn là khung cảnh của chủ đề chứ không còn là
 *               một mảng màu phẳng.
 *  - 'strong' : phòng chờ, bảng điểm — toàn chữ để đọc, cảnh phải lùi hẳn.
 *
 * `dark` là mặt Dark của Ú Nồ Flip: cả khung cảnh chìm vào một hố đen, đổi cùng
 * nhịp với tiếng lật bàn và nhạc bị nhấn chìm (xem setMusicDark).
 */
export function Backdrop({ theme, dim = 'none', dark = false }: {
  theme: BgTheme;
  dim?: 'none' | 'soft' | 'strong';
  dark?: boolean;
}) {
  const meta = themeMeta(theme);
  const Scene = SCENES[meta.id];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: meta.menu.base }}>
      <Scene />
      {/* 'soft' cố tình KHÔNG dùng backdrop-filter: lớp này nằm dưới canvas WebGL
          đang vẽ mỗi khung hình, mà backdrop-filter thì bắt trình duyệt lấy mẫu
          lại nền theo từng khung — đúng thứ thuế khung hình không đáng trả cho
          một hiệu ứng mà một lớp gradient phẳng cũng làm được. */}
      {dim === 'soft' && (
        <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(ellipse 72% 66% at 50% 52%, rgba(6,4,10,.34), rgba(6,4,10,.74))' }} />
      )}
      {dim === 'strong' && (
        <div style={{ position: 'absolute', inset: -40, backdropFilter: 'blur(9px)', background: 'radial-gradient(ellipse 62% 58% at 50% 46%, rgba(6,4,10,.66), rgba(6,4,10,.86))' }} />
      )}
      <div
        style={{
          position: 'absolute', inset: -40,
          background: 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(8,3,18,.80), #05020B)',
          opacity: dark ? 1 : 0,
          transition: 'opacity .6s ease',
        }}
      />
    </div>
  );
}
