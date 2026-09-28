'use client';
import { motion } from 'framer-motion';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { currentMusicTitle, onMusicChange, playSfx } from '@/src/lib/audio';
import { useSettings } from '@/src/lib/settings';
import { themeMeta, THEMES } from '@/src/lib/themes';
import { isDiscordActivity, openDiscordInvite } from '@/src/lib/discord';
import { useActiveTheme } from '@/src/state/room';
import { Avatar } from './Avatar';
import { Backdrop } from './Backdrop';
import { FullscreenToggle } from './MobileGuard';

/* ─────────────────────────────────────────────────────────────────────────
 * MENU CHÍNH — QUẠT BÀI
 *
 * Toàn bộ menu là một CỖ BÀI XOÈ RA: mỗi mục là một lá thật, cùng tỉ lệ và
 * cùng viền kem với bài trong ván, nên menu và bàn chơi trông là một game chứ
 * không phải hai màn hình rời.
 *
 * Hình học lấy nguyên từ bản thiết kế: gốc xoay đặt SÂU DƯỚI màn hình
 * (transform-origin 110px 720px trên lá cao 352px) nên các lá quay quanh một
 * tâm ảo như cầm trên tay, chứ không phải xoay quanh chính nó.
 * ───────────────────────────────────────────────────────────────────────── */

/** Kích thước khung gốc của thiết kế — mọi số px dưới đây tính theo khung này. */
const DESIGN_W = 1440;
const DESIGN_H = 810;

const CARD_W = 220;
const CARD_H = 352;
/** Bước xoè giữa 2 lá liền nhau (độ). Lá giữa (i = 2) đứng thẳng. */
const FAN_STEP = 18;
/** Lá bên cạnh dạt ra khi trỏ vào một lá, để lá được chọn có chỗ nhô lên. */
const FAN_PUSH = 6;
const HOVER_LIFT = -58;
const IDLE_LIFT = 10;
const FAN_BOTTOM = 152;

interface StageLayout {
  scale: number;
  isMobileLandscape: boolean;
  fanBottom: number;
}

/**
 * Tỉ lệ thu phóng cả sân khấu menu theo cửa sổ.
 * Tự động tối ưu riêng cho mobile màn hình ngang (e.g. iPhone SE 667x375) để không bị tràn màn hình.
 */
function useStageScale(): StageLayout {
  const [layout, setLayout] = useState<StageLayout>({ scale: 1, isMobileLandscape: false, fanBottom: FAN_BOTTOM });
  useEffect(() => {
    const measure = () => {
      const isDiscord = isDiscordActivity();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const isMob = h < 600 && w > h;

      const baseScale = Math.min(w / DESIGN_W, h / DESIGN_H);
      const factor = isDiscord ? 0.85 : 1;

      // Trên mobile landscape (h < 600, w > h):
      // Thu nhỏ quạt bài để vừa vặn với màn hình điện thoại (thường h: 360-500px).
      // Chiều cao quạt chiếm khoảng 40-44% chiều cao màn hình, chừa không gian thoáng cho tiêu đề & các nút.
      const mobScale = Math.max(0.32, Math.min(0.45, (h * 0.42) / CARD_H));
      const calculatedScale = isMob ? mobScale : Math.max(0.45, Math.min(1, baseScale * factor));
      const fanBottom = isMob ? Math.max(10, Math.round(h * 0.04)) : FAN_BOTTOM * calculatedScale;

      setLayout({ scale: calculatedScale, isMobileLandscape: isMob, fanBottom });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return layout;
}

/** Tên bài nhạc đang phát — audio.ts tự bốc bài nên phải nghe thông báo từ nó. */
function useMusicTitle(): string | null {
  return useSyncExternalStore(onMusicChange, currentMusicTitle, () => null);
}

interface FanCard {
  label: string;
  sub: string;
  glyph: string;
  face: string;
  onClick: () => void;
}

function FanCard({ card, index, hover, onEnter, isMobileLandscape }: {
  card: FanCard; index: number; hover: number | null; onEnter: () => void; isMobileLandscape?: boolean;
}) {
  const on = hover === index;
  const fanStep = isMobileLandscape ? 11 : FAN_STEP;
  const fanPush = isMobileLandscape ? 3 : FAN_PUSH;
  const base = (index - 2) * fanStep;
  const push = hover == null ? 0 : index < hover ? -fanPush : index > hover ? fanPush : 0;
  const lift = on ? (isMobileLandscape ? -42 : HOVER_LIFT) : hover == null ? 0 : IDLE_LIFT;

  return (
    <button
      onMouseEnter={onEnter}
      onFocus={onEnter}
      onClick={() => { playSfx('click'); card.onClick(); }}
      aria-label={card.label.replace('\n', ' ')}
      style={{
        position: 'absolute',
        left: -CARD_W / 2,
        bottom: 0,
        width: CARD_W,
        height: CARD_H,
        cursor: 'pointer',
        padding: 0,
        border: 0,
        background: 'transparent',
        // Tâm quay nằm dưới đáy lá -> cả quạt quay quanh một điểm ảo dưới màn hình
        transformOrigin: `${CARD_W / 2}px ${isMobileLandscape ? 620 : 720}px`,
        transition: 'transform .26s cubic-bezier(.22,.9,.3,1.2)',
        transform: `rotate(${base + push}deg) translateY(${lift}px) scale(${on ? 1.07 : 1})`,
        zIndex: on ? 20 : index,
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: 20, background: '#191016',
          border: '6px solid #F6ECDD', overflow: 'hidden',
          boxShadow: on
            ? '0 34px 60px rgba(0,0,0,.62), 0 0 0 4px rgba(255,190,110,.75), 0 0 60px rgba(255,160,70,.5)'
            : '0 18px 34px rgba(0,0,0,.55)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: card.face }} />
        {/* Dải kem chéo — chi tiết duy nhất khiến mắt đọc ra "đây là lá bài". */}
        <div style={{ position: 'absolute', left: '-30%', right: '-10%', top: '34%', height: '40%', background: '#F6ECDD', transform: 'rotate(-13deg)' }} />
        <div className="display" style={{ position: 'absolute', left: 18, top: 22, width: 44, height: 44, borderRadius: 11, background: 'rgba(10,5,8,.32)', display: 'grid', placeItems: 'center', fontSize: 24, color: '#F6ECDD' }}>
          {card.glyph}
        </div>
        <div
          className="display"
          style={{
            position: 'absolute',
            left: 16,
            top: 138,
            width: 172,
            fontSize: isMobileLandscape ? 26 : 30,
            lineHeight: 1.05,
            color: '#241318',
            whiteSpace: 'pre-line',
            transform: 'rotate(-9deg)',
            textAlign: 'left',
          }}
        >
          {card.label}
        </div>
        <div
          className="label"
          style={{
            position: 'absolute',
            left: 18,
            width: 170,
            bottom: 26,
            fontSize: 12,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: '#F0DFCA',
            textAlign: 'left',
          }}
        >
          {card.sub}
        </div>
        {/* Làm tối các lá KHÔNG được trỏ vào — không có lớp này thì cả quạt đều
            sáng như nhau và mắt không biết mình đang chọn lá nào. */}
        <div style={{ position: 'absolute', inset: 0, background: on || hover == null ? 'transparent' : 'rgba(10,6,10,.34)', transition: 'background .2s' }} />
      </div>
    </button>
  );
}

export function MainMenu({ onQuick, onCreate, onJoin, onSolo, onProfile, onSettings, onHowTo, busy, discordCode }: {
  onQuick: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onSolo: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onHowTo: () => void;
  busy?: boolean;
  discordCode?: string | null;
}) {
  const t = useTranslations('menu');
  const ts = useTranslations('settings');
  const username = useSettings((s) => s.username);
  const avatarPreset = useSettings((s) => s.avatarPreset);
  const setSetting = useSettings((s) => s.set);
  const theme = useActiveTheme();
  const meta = themeMeta(theme);
  const { scale, isMobileLandscape, fanBottom } = useStageScale();
  const musicTitle = useMusicTitle();

  const [code, setCode] = useState(discordCode ?? '');
  const [joining, setJoining] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const cards: FanCard[] = [
    { label: t('quick'), sub: t('quickSub'), glyph: '▲', face: 'linear-gradient(150deg,#E24B2E,#A8221A)', onClick: onQuick },
    { label: t('create'), sub: t('createSub'), glyph: '✚', face: 'linear-gradient(150deg,#3FA855,#1E6E32)', onClick: onCreate },
    { label: t('join'), sub: t('joinSub'), glyph: '#', face: 'linear-gradient(150deg,#2E86CC,#144F8C)', onClick: () => setJoining((v) => !v) },
    { label: t('profile'), sub: t('profileSub'), glyph: '★', face: 'linear-gradient(150deg,#F0B62E,#B87508)', onClick: onProfile },
    { label: t('settings'), sub: t('settingsSub'), glyph: '⚙', face: 'linear-gradient(150deg,#8A5CD6,#4B2B86)', onClick: onSettings },
  ];

  const roundBtn = 'grid place-items-center rounded-full text-[#FFD79A] transition-transform hover:scale-105 active:scale-95';
  const roundStyle = isMobileLandscape
    ? { width: 30, height: 30, background: 'rgba(24,15,18,.8)', border: '1px solid rgba(255,196,128,.3)' }
    : { width: 48, height: 48, background: 'rgba(24,15,18,.8)', border: '1px solid rgba(255,196,128,.3)' };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: meta.menu.base }}>
      <Backdrop theme={theme} />

      {/* Biển hiệu neon */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-auto"
        style={{
          top: isMobileLandscape ? 6 : 74 * scale,
          transformOrigin: '50% 0',
        }}
      >
        <div
          className="display"
          style={{
            fontSize: isMobileLandscape ? 28 : 90 * scale,
            lineHeight: 0.9,
            letterSpacing: '-.01em',
            color: meta.menu.ink,
            textShadow: meta.menu.glow,
            animation: 'bgFlicker 9s ease-in-out infinite',
          }}
        >
          {t('title')}
        </div>
        <div
          className="label mt-1 inline-block rounded-lg"
          style={{
            padding: isMobileLandscape ? '1px 6px' : meta.menu.tagPad,
            background: meta.menu.tagBg,
            fontSize: isMobileLandscape ? 8.5 : 15 * Math.max(scale, 0.75),
            letterSpacing: isMobileLandscape ? '.2em' : '.5em',
            textTransform: 'uppercase',
            color: meta.menu.tagInk,
            textShadow: meta.menu.tagGlow,
            animation: 'bgNeonBuzz 7s ease-in-out infinite',
          }}
        >
          {meta.tagline}
        </div>

        {/* Nút chơi với bot trên mobile đặt ngay dưới biển hiệu neon rất gọn và không che quạt bài */}
        {isMobileLandscape && (
          <div className="mt-1.5">
            <button
              className="label inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[10px] tracking-[.15em] uppercase transition-transform active:scale-95 shadow-lg"
              style={{
                background: 'rgba(24,15,18,.88)',
                border: '1px solid rgba(255,211,77,.55)',
                color: '#FFD34D',
              }}
              onClick={() => { playSfx('click'); onSolo(); }}
            >
              <span>🤖</span>
              <span>{t('solo')}</span>
            </button>
          </div>
        )}
      </motion.div>

      {/* QUẠT BÀI */}
      <div
        className="absolute left-1/2 pointer-events-auto"
        style={{
          bottom: fanBottom,
          width: 0,
          height: 0,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 26 }}
          style={{ width: 0, height: 0 }}
          onMouseLeave={() => setHover(null)}
        >
          {cards.map((c, i) => (
            <FanCard key={c.label} card={c} index={i} hover={hover} onEnter={() => setHover(i)} isMobileLandscape={isMobileLandscape} />
          ))}
        </motion.div>
      </div>

      {/* Nhập mã phòng — chỉ hiện khi chọn lá "Nhập mã". */}
      {joining && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-2xl p-2.5 max-w-[90vw]"
          style={{
            bottom: (fanBottom + CARD_H * scale) + 12,
            background: 'rgba(20,12,16,.92)',
            border: '1px solid rgba(255,196,128,.35)',
            boxShadow: '0 8px 30px rgba(0,0,0,.6)',
          }}
        >
          <input
            type="text"
            autoFocus
            value={code}
            maxLength={6}
            placeholder={t('codePlaceholder')}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) onJoin(code); }}
            className="w-36 sm:w-44 text-center tracking-[.3em] text-[15px]"
          />
          <button className="btn btn--gold !py-1.5 !px-3.5 !text-[14px]" disabled={code.length !== 6} onClick={() => onJoin(code)}>
            {t('join')}
          </button>
        </motion.div>
      )}

      {/* Thẻ người chơi góc trên bên trái */}
      <div
        className={`absolute z-20 flex items-center ${isMobileLandscape ? 'gap-1.5 py-0.5 pl-0.5 pr-2.5' : 'gap-3 py-2 pl-2 pr-4'} rounded-full text-left`}
        style={{
          left: isMobileLandscape ? 8 : Math.max(16, 34 * scale),
          top: isMobileLandscape ? 8 : Math.max(16, 30 * scale),
          background: 'rgba(24,15,18,.86)',
          border: '1px solid rgba(255,196,128,.3)',
          boxShadow: '0 12px 28px rgba(0,0,0,.5)',
        }}
      >
        <button
          onClick={() => { playSfx('click'); onProfile(); }}
          className="flex items-center gap-1.5 sm:gap-2 text-left focus:outline-none"
        >
          <Avatar
            name={username}
            preset={avatarPreset}
            size={isMobileLandscape ? 26 : scale < 0.8 ? 44 : 54}
            self
            className="!rounded-full overflow-hidden"
          />
          <span>
            <span
              className="display block leading-none text-[#FFE9C2]"
              style={{ fontSize: isMobileLandscape ? 12 : scale < 0.8 ? 18 : 22 }}
            >
              {username}
            </span>
            <span
              className="label block tracking-[.12em] text-[#C79A6C]"
              style={{ fontSize: isMobileLandscape ? 8 : 11 }}
            >
              {isDiscordActivity() ? t('discordHint') : t('subtitle')}
            </span>
          </span>
        </button>

        {isDiscordActivity() && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              playSfx('click');
              void openDiscordInvite();
            }}
            className="label ml-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #5865F2, #4752C4)',
              border: '1px solid rgba(255,255,255,.3)',
              color: '#FFFFFF',
              boxShadow: '0 2px 8px rgba(88,101,242,.4)',
            }}
            title={t('inviteVoice')}
          >
            <span>👥</span>
            <span>{t('inviteVoice')}</span>
          </button>
        )}
      </div>

      {/* Nút góc trên bên phải: toàn màn hình, hướng dẫn, nhạc, cài đặt */}
      <div
        className="absolute z-20 flex items-center gap-2"
        style={{
          right: isMobileLandscape ? 10 : Math.max(16, 30 * scale),
          top: isMobileLandscape ? 10 : Math.max(16, 30 * scale),
        }}
      >
        <FullscreenToggle />
        <button className={roundBtn} style={roundStyle} onClick={() => { playSfx('click'); onHowTo(); }} aria-label={t('howTo')} title={t('howTo')}>
          <span className={`display ${isMobileLandscape ? 'text-[16px]' : 'text-[20px]'}`}>i</span>
        </button>
        <button className={roundBtn} style={roundStyle} onClick={() => { playSfx('click'); onSettings(); }} aria-label={t('settings')} title={t('settings')}>
          ⚙
        </button>
      </div>

      {/* Đang phát + đổi nền nhanh — hiển thị trên màn hình rộng / desktop */}
      {!isMobileLandscape && (
        <div className="absolute flex flex-col items-end gap-2" style={{ right: Math.max(16, 30 * scale), top: Math.max(68, 94 * scale) }}>
          {musicTitle && (
            <div
              className="label max-w-[280px] truncate rounded-[10px] px-4 py-2 text-[12px] tracking-[.2em] uppercase"
              style={{ background: 'rgba(24,15,18,.7)', border: '1px solid rgba(159,216,224,.28)', color: '#9FD8E0' }}
            >
              {t('nowPlaying', { title: musicTitle })}
            </div>
          )}
          <div className="flex gap-1.5 rounded-[10px] p-1.5" style={{ background: 'rgba(24,15,18,.7)', border: '1px solid rgba(255,196,128,.24)' }}>
            {THEMES.map((th) => (
              <button
                key={th.id}
                onClick={() => { playSfx('click'); setSetting('bgTheme', th.id); }}
                aria-label={ts(`theme${th.id[0].toUpperCase()}${th.id.slice(1)}`)}
                title={ts(`theme${th.id[0].toUpperCase()}${th.id.slice(1)}`)}
                className="h-[22px] w-[30px] rounded-md"
                style={{ background: th.swatch, outline: theme === th.id ? '2px solid #FFD34D' : '1px solid rgba(255,255,255,.25)' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Chơi offline với bot & gợi ý — trên desktop */}
      {!isMobileLandscape && (
        <>
          <button
            className="label absolute left-1/2 -translate-x-1/2 rounded-[10px] px-4 py-2 text-[12px] tracking-[.2em] uppercase"
            style={{ bottom: 46, background: 'rgba(24,15,18,.66)', border: '1px solid rgba(255,196,128,.28)', color: '#E7B98C' }}
            onClick={() => { playSfx('click'); onSolo(); }}
          >
            {t('solo')}
          </button>

          <div
            className="label absolute left-1/2 -translate-x-1/2 text-[12px] tracking-[.32em] uppercase"
            style={{ bottom: 16, color: '#8A6A52' }}
          >
            {t('fanHint')}
          </div>
        </>
      )}

      {busy && (
        <div className="label absolute left-1/2 top-4 z-40 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2 text-[12px] text-[#FFD34D]">
          {t('connecting')}
        </div>
      )}
    </div>
  );
}
