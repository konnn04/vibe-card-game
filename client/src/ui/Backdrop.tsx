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

const SPACE_STARS = Array.from({ length: 32 }, (_, i) => ({
  left: `${rnd(i * 3 + 1, 2, 98).toFixed(1)}%`,
  top: `${rnd(i * 7 + 2, 2, 95).toFixed(1)}%`,
  size: Number((1.2 + ((i * 11) % 5) * 0.4).toFixed(1)),
  color: ['#FFFFFF', '#BAE6FD', '#E9D5FF', '#FEF08A'][i % 4],
  dur: `${(3 + ((i * 13) % 7) * 0.8).toFixed(1)}s`,
  delay: `${(((i * 17) % 11) * 0.5).toFixed(1)}s`,
  glow: i % 3 === 0,
}));

const PADDY_POLLEN = Array.from({ length: 14 }, (_, i) => ({
  left: `${rnd(i * 5 + 3, 4, 96).toFixed(1)}%`,
  top: `${rnd(i * 9 + 4, 38, 88).toFixed(1)}%`,
  size: Number((2.5 + ((i * 7) % 4) * 0.8).toFixed(1)),
  dur: `${(4.5 + ((i * 11) % 6) * 0.7).toFixed(1)}s`,
  delay: `${(((i * 13) % 9) * 0.6).toFixed(1)}s`,
}));

const CITY_BEACONS = [
  { left: '16%', bottom: '58%', color: '#EF4444', dur: '1.6s', delay: '0s' },
  { left: '48%', bottom: '74%', color: '#F59E0B', dur: '2.0s', delay: '0.4s' },
  { left: '53%', bottom: '71%', color: '#EF4444', dur: '1.8s', delay: '0.8s' },
  { left: '71%', bottom: '56%', color: '#EF4444', dur: '2.2s', delay: '0.2s' },
  { left: '89%', bottom: '63%', color: '#F59E0B', dur: '1.9s', delay: '0.6s' },
];

const CITY_DROPS = Array.from({ length: 14 }, (_, i) => ({
  left: `${rnd(i * 7 + 1, 4, 96).toFixed(1)}%`,
  top: `${rnd(i * 11 + 3, 10, 85).toFixed(1)}%`,
  height: 12 + (i % 4) * 6,
  dur: `${(5 + ((i * 13) % 5) * 0.8).toFixed(1)}s`,
  delay: `${(((i * 17) % 7) * 0.9).toFixed(1)}s`,
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

function SpaceScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(180deg, #050510 0%, #090822 35%, #140D36 68%, #060614 100%)' }}>
      {/* Tinh vân tím góc trên trái */}
      <div style={{ position: 'absolute', left: '-10%', top: '-8%', width: '65%', height: '65%', background: 'radial-gradient(ellipse 65% 55% at 40% 40%, rgba(139, 92, 246, 0.22), transparent 72%)', filter: 'blur(20px)' }} />
      {/* Cụm sao / tinh vân lam góc phải */}
      <div style={{ position: 'absolute', right: '-10%', top: '22%', width: '60%', height: '60%', background: 'radial-gradient(ellipse 60% 50% at 60% 50%, rgba(6, 182, 212, 0.18), transparent 70%)', filter: 'blur(25px)' }} />
      {/* Bụi sao hồng ngoại góc dưới */}
      <div style={{ position: 'absolute', left: '20%', bottom: '-15%', width: '70%', height: '55%', background: 'radial-gradient(ellipse 70% 50% at 50% 60%, rgba(217, 70, 239, 0.14), transparent 75%)', filter: 'blur(30px)' }} />

      {/* Dàn sao nhấp nháy tĩnh (không giật khung hình) */}
      {SPACE_STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: s.color,
            boxShadow: s.glow ? `0 0 8px 2px ${s.color}` : 'none',
            animation: `bgTwinkle ${s.dur} ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}

      {/* Sao băng vụt qua bầu trời */}
      <div
        style={{
          position: 'absolute',
          left: '16%',
          top: '10%',
          width: 140,
          height: 2,
          transformOrigin: '0 50%',
          background: 'linear-gradient(90deg, transparent 0%, rgba(56,189,248,0.4) 40%, #FFFFFF 100%)',
          boxShadow: '0 0 10px 2px rgba(56,189,248,0.8)',
          animation: 'bgMeteor 9s ease-in 2.5s infinite',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: -2,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: '0 0 14px 4px #38BDF8',
          }}
        />
      </div>

      {/* Hành tinh khí khổng lồ có vành đai lơ lửng */}
      <div
        style={{
          position: 'absolute',
          right: '12%',
          top: '14%',
          width: 260,
          height: 200,
          animation: 'bgPlanetFloat 15s ease-in-out infinite',
        }}
      >
        {/* Nửa vành đai phía sau */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 62,
            width: 260,
            height: 76,
            borderRadius: '50%',
            transform: 'rotate(-24deg)',
            background: 'radial-gradient(ellipse 50% 50% at 50% 50%, transparent 48%, rgba(192, 132, 252, 0.2) 50%, rgba(216, 180, 254, 0.75) 58%, rgba(147, 51, 234, 0.35) 66%, rgba(232, 121, 249, 0.65) 73%, transparent 78%)',
            clipPath: 'polygon(0% 0%, 100% 0%, 100% 50%, 0% 50%)',
          }}
        />

        {/* Quả cầu hành tinh */}
        <div
          style={{
            position: 'absolute',
            left: 60,
            top: 30,
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 28%, #D8B4FE 0%, #9333EA 36%, #581C87 72%, #1E0738 100%)',
            boxShadow: '0 0 50px 12px rgba(168, 85, 247, 0.4)',
          }}
        />

        {/* Nửa vành đai phía trước tạo chiều sâu 3D */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 62,
            width: 260,
            height: 76,
            borderRadius: '50%',
            transform: 'rotate(-24deg)',
            background: 'radial-gradient(ellipse 50% 50% at 50% 50%, transparent 48%, rgba(192, 132, 252, 0.2) 50%, rgba(216, 180, 254, 0.75) 58%, rgba(147, 51, 234, 0.35) 66%, rgba(232, 121, 249, 0.65) 73%, transparent 78%)',
            clipPath: 'polygon(0% 50%, 100% 50%, 100% 100%, 0% 100%)',
          }}
        />
      </div>

      {/* Mặt trăng băng có hố va chạm lơ lửng */}
      <div
        style={{
          position: 'absolute',
          left: '14%',
          top: '22%',
          width: 70,
          height: 70,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 32% 28%, #E0F2FE 0%, #38BDF8 38%, #0284C7 74%, #082F49 100%)',
          boxShadow: '0 0 35px 8px rgba(56, 189, 248, 0.35)',
          animation: 'bgPlanetFloatAlt 18s ease-in-out 1.5s infinite',
        }}
      >
        <div style={{ position: 'absolute', left: 16, top: 20, width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle, #0369A1, transparent 75%)', opacity: 0.75 }} />
        <div style={{ position: 'absolute', left: 38, top: 34, width: 10, height: 10, borderRadius: '50%', background: 'radial-gradient(circle, #075985, transparent 75%)', opacity: 0.65 }} />
        <div style={{ position: 'absolute', left: 24, top: 44, width: 8, height: 8, borderRadius: '50%', background: 'radial-gradient(circle, #0284C7, transparent 75%)', opacity: 0.55 }} />
      </div>

      {/* Tiểu hành tinh hồng ngọc lơ lửng */}
      <div
        style={{
          position: 'absolute',
          left: '28%',
          bottom: '24%',
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #FDA4AF 0%, #E11D48 50%, #4C0519 100%)',
          boxShadow: '0 0 22px 5px rgba(225, 29, 72, 0.45)',
          animation: 'bgPlanetFloat 11s ease-in-out 3s infinite',
        }}
      />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '36%', background: 'linear-gradient(rgba(5,5,16,0), rgba(4,4,14,.65))' }} />
    </div>
  );
}

function RiceStalks({ style = {} }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 160 260" fill="none" xmlns="http://www.w3.org/2000/svg" style={style}>
      <path d="M20 260 Q40 160 90 90 Q120 50 145 65" stroke="#CA8A04" strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <ellipse
          key={`g1-${k}`}
          cx={95 + k * 9}
          cy={85 - k * 4 + (k > 3 ? (k - 3) * 6 : 0)}
          rx="5"
          ry="9"
          transform={`rotate(${30 + k * 8} ${95 + k * 9} ${85 - k * 4})`}
          fill="#FACC15"
          stroke="#A16207"
          strokeWidth="1"
        />
      ))}
      <path d="M10 260 Q30 180 65 120 Q95 70 120 85" stroke="#EAB308" strokeWidth="2.5" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((k) => (
        <ellipse
          key={`g2-${k}`}
          cx={75 + k * 10}
          cy={110 - k * 6 + (k > 2 ? (k - 2) * 6 : 0)}
          rx="4.5"
          ry="8"
          transform={`rotate(${35 + k * 7} ${75 + k * 10} ${110 - k * 6})`}
          fill="#FEF08A"
          stroke="#CA8A04"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function PaddyScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(180deg, #2A1133 0%, #581C26 22%, #9A3412 44%, #C2410C 60%, #EA580C 74%, #F59E0B 88%, #FDE047 100%)' }}>
      {/* Vầng hào quang mặt trời lặn */}
      <div style={{ position: 'absolute', left: '60%', top: '22%', width: 520, height: 520, marginLeft: -260, marginTop: -260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(254, 240, 138, 0.35) 0%, rgba(245, 158, 11, 0.2) 40%, rgba(234, 88, 12, 0.08) 65%, transparent 80%)', animation: 'bgSunPulse 9s ease-in-out infinite' }} />

      {/* Quả cầu mặt trời hoàng hôn rực rỡ */}
      <div style={{ position: 'absolute', left: '60%', top: '22%', width: 170, height: 170, marginLeft: -85, marginTop: -85, borderRadius: '50%', background: 'radial-gradient(circle at 50% 50%, #FFFBEB 0%, #FEF08A 32%, #F59E0B 68%, #EA580C 100%)', boxShadow: '0 0 60px 20px rgba(245, 158, 11, 0.7), 0 0 110px 40px rgba(234, 88, 12, 0.45)', animation: 'bgSunPulse 9s ease-in-out infinite' }} />

      {/* Dải mây chiều lững lờ trôi */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: '26%', height: 120, animation: 'bgDriftSlow 45s ease-in-out infinite alternate' }}>
        <div style={{ position: 'absolute', left: '12%', top: 20, width: 280, height: 42, borderRadius: 40, background: 'rgba(254, 215, 170, 0.35)', filter: 'blur(3px)' }} />
        <div style={{ position: 'absolute', left: '48%', top: 0, width: 340, height: 52, borderRadius: 50, background: 'rgba(253, 186, 116, 0.4)', filter: 'blur(4px)' }} />
        <div style={{ position: 'absolute', right: '8%', top: 38, width: 220, height: 36, borderRadius: 30, background: 'rgba(251, 146, 60, 0.3)', filter: 'blur(3px)' }} />
      </div>

      {/* Rặng núi phía xa chìm trong sương chiều */}
      <div style={{ position: 'absolute', left: '-4%', right: '-4%', bottom: '38%', height: '36%', background: 'linear-gradient(180deg, #431407 0%, #2A0F1D 100%)', clipPath: 'polygon(0% 100%, 0% 58%, 14% 45%, 26% 60%, 42% 38%, 56% 54%, 72% 40%, 86% 56%, 100% 42%, 100% 100%)', opacity: 0.88 }} />
      <div style={{ position: 'absolute', left: '-4%', right: '-4%', bottom: '34%', height: '32%', background: 'linear-gradient(180deg, #7C2D12 0%, #3B1207 100%)', clipPath: 'polygon(0% 100%, 0% 68%, 16% 50%, 30% 66%, 46% 46%, 62% 64%, 78% 48%, 90% 62%, 100% 52%, 100% 100%)' }} />

      {/* Các tầng ruộng bậc thang vàng óng */}
      <div style={{ position: 'absolute', left: '-6%', right: '-6%', bottom: '26%', height: '33%', borderRadius: '55% 45% 0 0', background: 'linear-gradient(135deg, #CA8A04 0%, #A16207 55%, #713F12 100%)', borderTop: '2px solid rgba(254, 240, 138, 0.55)' }} />
      <div style={{ position: 'absolute', left: '30%', right: '-15%', bottom: '20%', height: '31%', borderRadius: '45% 55% 0 0', background: 'linear-gradient(125deg, #EAB308 0%, #CA8A04 55%, #854D0E 100%)', borderTop: '3px solid rgba(254, 240, 138, 0.65)' }} />
      <div style={{ position: 'absolute', left: '-12%', right: '22%', bottom: '10%', height: '28%', borderRadius: '52% 48% 0 0', background: 'linear-gradient(115deg, #FACC15 0%, #D97706 60%, #92400E 100%)', borderTop: '3px solid rgba(255, 251, 235, 0.75)' }} />

      {/* Mặt ruộng lúa trĩu bông phía dưới */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%', background: 'linear-gradient(#B45309 0%, #451A03 100%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%', background: 'repeating-linear-gradient(102deg, rgba(254, 240, 138, 0.16) 0 3px, transparent 3px 26px)' }} />

      {/* Bông lúa trĩu hạt tiền cảnh đu đưa trong gió chiều */}
      <RiceStalks
        style={{
          position: 'absolute',
          left: 20,
          bottom: -10,
          width: 140,
          height: 230,
          transformOrigin: 'bottom center',
          animation: 'bgPaddySway 4.4s ease-in-out infinite alternate',
        }}
      />
      <RiceStalks
        style={{
          position: 'absolute',
          right: 25,
          bottom: -10,
          width: 140,
          height: 230,
          transformOrigin: 'bottom center',
          transform: 'scaleX(-1)',
          animation: 'bgPaddySway 5.2s ease-in-out 0.6s infinite alternate',
        }}
      />

      {/* Đốm sáng phấn lúa / đom đóm hoàng hôn bay là đà */}
      {PADDY_POLLEN.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: '#FEF08A',
            boxShadow: '0 0 10px 3px rgba(250, 204, 21, 0.85)',
            animation: `bgPollenDrift ${p.dur} ease-out ${p.delay} infinite`,
          }}
        />
      ))}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '36%', background: 'linear-gradient(rgba(38,22,9,0), rgba(30,15,6,.5))' }} />
    </div>
  );
}

function CityScene() {
  return (
    <div style={{ ...fill, background: 'linear-gradient(180deg, #070913 0%, #0F172A 32%, #1E1B4B 60%, #2E1065 80%, #3B0764 100%)' }}>
      {/* Ánh sáng neon hắt lên từ thành phố */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 95% 45% at 50% 88%, rgba(244, 63, 94, 0.22), rgba(14, 165, 233, 0.16) 60%, transparent 85%)' }} />

      {/* Đường chân trời xa (Distant silhouette) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '14%',
          height: '46%',
          background: 'linear-gradient(180deg, #17153B 0%, #0A0A18 100%)',
          clipPath: 'polygon(0% 100%, 0% 50%, 5% 50%, 5% 42%, 11% 42%, 11% 56%, 18% 56%, 18% 38%, 26% 38%, 26% 52%, 34% 52%, 34% 44%, 42% 44%, 42% 34%, 52% 34%, 52% 48%, 60% 48%, 60% 38%, 68% 38%, 68% 54%, 76% 54%, 76% 42%, 84% 42%, 84% 50%, 92% 50%, 92% 40%, 100% 40%, 100% 100%)',
          opacity: 0.75,
        }}
      />

      {/* Các toà tháp trung cảnh với cửa sổ sáng đèn */}
      {/* Toà 1 - Tháp ăng-ten bên trái */}
      <div style={{ position: 'absolute', left: '12%', bottom: '10%', width: 100, height: '48%', background: 'linear-gradient(180deg, #181938, #0C0F1A)', boxShadow: '0 0 20px rgba(0,0,0,0.6)' }}>
        <div style={{ position: 'absolute', left: '48%', top: -56, width: 3, height: 56, background: '#64748B' }} />
        <div style={{ position: 'absolute', inset: 8, background: 'repeating-linear-gradient(0deg, rgba(254, 240, 138, 0.45) 0 3px, transparent 3px 9px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.1) 0 4px, transparent 4px 10px)', opacity: 0.85 }} />
      </div>

      {/* Toà 2 - Toà nhà hiện đại mái cyan */}
      <div style={{ position: 'absolute', left: '26%', bottom: '10%', width: 125, height: '42%', background: 'linear-gradient(180deg, #1E1B4B, #0F172A)' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, background: '#06B6D4', boxShadow: '0 0 14px #06B6D4' }} />
        <div style={{ position: 'absolute', inset: 10, background: 'repeating-linear-gradient(0deg, rgba(253, 224, 71, 0.35) 0 4px, transparent 4px 12px), repeating-linear-gradient(90deg, rgba(56, 189, 248, 0.2) 0 5px, transparent 5px 12px)' }} />
      </div>

      {/* Toà 3 - Toà tháp trung tâm cao nhất với 2 cột ăng-ten */}
      <div style={{ position: 'absolute', left: '47%', bottom: '10%', width: 140, height: '62%', background: 'linear-gradient(180deg, #241A47, #0B0A1C)', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}>
        <div style={{ position: 'absolute', left: '20%', top: -65, width: 2, height: 65, background: '#94A3B8' }} />
        <div style={{ position: 'absolute', right: '20%', top: -65, width: 2, height: 65, background: '#94A3B8' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg, #F43F5E, #38BDF8)' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg, #38BDF8, #F43F5E)' }} />
        <div style={{ position: 'absolute', inset: 12, background: 'repeating-linear-gradient(0deg, rgba(254, 240, 138, 0.5) 0 3px, transparent 3px 10px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.12) 0 4px, transparent 4px 10px)' }} />
      </div>

      {/* Toà 4 - Toà nhà vát góc bên phải */}
      <div style={{ position: 'absolute', left: '67%', bottom: '10%', width: 115, height: '46%', background: 'linear-gradient(180deg, #1C1A3F, #0E1020)', clipPath: 'polygon(0 8%, 100% 0, 100% 100%, 0 100%)' }}>
        <div style={{ position: 'absolute', inset: 8, top: 20, background: 'repeating-linear-gradient(0deg, rgba(253, 186, 116, 0.4) 0 3px, transparent 3px 11px), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0 4px, transparent 4px 10px)' }} />
      </div>

      {/* Toà 5 - Toà nhà cao tầng góc phải */}
      <div style={{ position: 'absolute', right: '8%', bottom: '10%', width: 105, height: '54%', background: 'linear-gradient(180deg, #201D45, #0B0D18)' }}>
        <div style={{ position: 'absolute', left: '50%', top: -45, width: 2, height: 45, background: '#64748B' }} />
        <div style={{ position: 'absolute', inset: 8, background: 'repeating-linear-gradient(0deg, rgba(254, 240, 138, 0.4) 0 4px, transparent 4px 12px), repeating-linear-gradient(90deg, rgba(56, 189, 248, 0.15) 0 4px, transparent 4px 11px)' }} />
      </div>

      {/* Đèn tín hiệu hàng không chớp tắt */}
      {CITY_BEACONS.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: b.left,
            bottom: b.bottom,
            width: 7,
            height: 7,
            marginLeft: -3.5,
            borderRadius: '50%',
            background: b.color,
            boxShadow: `0 0 12px 4px ${b.color}`,
            animation: `bgBeaconBlink ${b.dur} ease-in-out ${b.delay} infinite`,
          }}
        />
      ))}

      {/* Vệt sáng xe cộ trên đại lộ phía dưới */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '8%', height: 35, background: 'linear-gradient(90deg, rgba(239,68,68,0.38) 0%, rgba(245,158,11,0.32) 30%, rgba(56,189,248,0.36) 70%, rgba(236,72,153,0.35) 100%)', filter: 'blur(16px)' }} />

      {/* ── KHUNG CỬA SỔ PENTHOUSE ── */}
      {/* Vệt phản chiếu ánh sáng kính */}
      <div style={{ ...fill, background: 'linear-gradient(130deg, rgba(255,255,255,0.04) 0%, transparent 45%, rgba(255,255,255,0.015) 100%)' }} />

      {/* Cột dọc chia khung cửa sổ 1 (33%) */}
      <div style={{ position: 'absolute', left: '33%', top: 0, bottom: 0, width: 14, background: 'linear-gradient(90deg, #11151F 0%, #222B3D 50%, #0E121B 100%)', boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.12), inset -1px 0 0 rgba(0,0,0,0.6)' }} />
      {/* Cột dọc chia khung cửa sổ 2 (67%) */}
      <div style={{ position: 'absolute', left: '67%', top: 0, bottom: 0, width: 14, background: 'linear-gradient(90deg, #11151F 0%, #222B3D 50%, #0E121B 100%)', boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.12), inset -1px 0 0 rgba(0,0,0,0.6)' }} />
      {/* Thanh ngang cửa sổ */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '26%', height: 12, background: 'linear-gradient(180deg, #222B3D 0%, #11151F 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 rgba(0,0,0,0.6)' }} />

      {/* Bệ cửa sổ phía dưới */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '10%', background: 'linear-gradient(180deg, #1A1F2B 0%, #0F121A 40%, #080A0E 100%)', borderTop: '2px solid rgba(255,255,255,0.15)', boxShadow: '0 -6px 24px rgba(0,0,0,0.7)' }} />

      {/* Hạt mưa / ngưng tụ trên kính */}
      {CITY_DROPS.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.left,
            top: d.top,
            width: 2,
            height: d.height,
            borderRadius: 2,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(56,189,248,0.4) 60%, transparent 100%)',
            animation: `bgRainSlide ${d.dur} linear ${d.delay} infinite`,
          }}
        />
      ))}

      {/* Hơi ấm căn phòng phản chiếu nhẹ ở bệ cửa */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '14%', background: 'linear-gradient(to top, rgba(255,180,100,0.07) 0%, transparent 100%)' }} />
    </div>
  );
}

const SCENES: Record<BgTheme, () => React.JSX.Element> = {
  cafe: CafeScene,
  meadow: MeadowScene,
  forest: ForestScene,
  park: ParkScene,
  space: SpaceScene,
  paddy: PaddyScene,
  city: CityScene,
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
