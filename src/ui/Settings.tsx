'use client';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ThemePicker } from './ThemePicker';
import { BUILD } from '@/src/generated/version';
import { useSettings, type Graphics, type Locale, type FpsLimit } from '@/src/lib/settings';
import { defaultMusicFile, musicTracks, playSfx, refreshMusicVolume, reloadMusic } from '@/src/lib/audio';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="label text-[14px] tracking-[.18em] text-[#FFD34D]">{title}</div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Pick({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="display rounded-[11px] px-6 py-2.5 text-[19px]"
      style={on ? { background: '#FFD34D', color: '#2A1508' } : { background: 'rgba(255,255,255,.1)', color: '#EDE0FA' }}
    >
      {children}
    </button>
  );
}

/** Slider âm lượng — thanh gold + núm trắng như mock 07 (input thật nằm trong suốt phía trên). */
function Volume({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <span className="label-sm w-[74px]">{label}</span>
      <div className="relative h-2 flex-1 rounded-full bg-white/15">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value * 100}%`, background: '#FFD34D' }} />
        <div
          className="absolute top-[-7px] h-[22px] w-[22px] rounded-full bg-white"
          style={{ left: `${value * 100}%`, marginLeft: -11, boxShadow: '0 3px 8px rgba(0,0,0,.5)' }}
        />
        <input
          type="range" min={0} max={1} step={0.01} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="w-8 text-right text-[12px] font-semibold text-[#A48AC8]">{Math.round(value * 100)}</span>
    </div>
  );
}

/** Khoá i18n cho phần mô tả — dịch lúc render, không nhúng chữ cứng vào bảng. */
const GFX_NOTE: Record<Graphics, string> = {
  low: 'gfxLowDesc',
  medium: 'gfxMediumDesc',
  high: 'gfxHighDesc',
};

const FPS_OPTIONS: { id: FpsLimit; label: string; descKey: string }[] = [
  { id: '60', label: '60 FPS', descKey: 'fps60Desc' },
  { id: '120', label: '120 FPS', descKey: 'fps120Desc' },
  { id: 'unlimited', label: 'Unlimited', descKey: 'fpsUnlimitedDesc' },
];

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('settings');
  const s = useSettings();
  // Manifest đã nạp xong từ màn loading nên đọc đồng bộ được.
  const tracks = musicTracks();
  // Chưa chọn gì (chuỗi rỗng) thì đang dùng bài mặc định trong manifest —
  // tô sáng đúng bài đó, đừng để người chơi tưởng chưa có gì được chọn.
  const selectedTrack = s.musicTrack || defaultMusicFile() || '';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center p-6"
      style={{ background: 'rgba(10,4,16,.72)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="scroll-y max-h-[88vh] w-[min(94vw,560px)] rounded-[20px] p-7"
        style={{ background: 'rgba(36,21,54,.92)', border: '1px solid rgba(255,255,255,.12)' }}
      >
        <div className="display text-[34px] leading-none text-[#FFF3DA]">{t('title')}</div>
        <div className="label mt-1 text-[13px] tracking-[.2em] text-[#A48AC8]">{t('applyNow')}</div>

        <Section title={t('language')}>
          <div className="flex gap-2.5">
            {(['vi', 'en'] as Locale[]).map((l) => (
              <Pick key={l} on={s.locale === l} onClick={() => s.set('locale', l)}>
                {l === 'vi' ? 'Tiếng Việt' : 'English'}
              </Pick>
            ))}
          </div>
        </Section>

        <Section title={t('graphics')}>
          <div className="grid grid-cols-3 gap-2.5">
            {(['low', 'medium', 'high'] as Graphics[]).map((g) => (
              <button
                key={g}
                onClick={() => s.set('graphics', g)}
                className="rounded-xl p-3.5 text-left"
                style={
                  s.graphics === g
                    ? { background: 'linear-gradient(140deg,rgba(255,211,77,.24),rgba(255,158,44,.14))', border: '2px solid #FFD34D' }
                    : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)' }
                }
              >
                <div className="display text-[20px]" style={{ color: s.graphics === g ? '#FFD34D' : '#EDE0FA' }}>{t(g)}</div>
                <div className="text-[12px] font-semibold leading-tight text-[#A48AC8]">{t(GFX_NOTE[g])}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('fpsLimit')}>
          <div className="grid grid-cols-3 gap-2.5">
            {FPS_OPTIONS.map((f) => (
              <button
                key={f.id}
                onClick={() => s.set('fpsLimit', f.id)}
                className="rounded-xl p-3.5 text-left transition hover:brightness-110 active:scale-95 cursor-pointer"
                style={
                  s.fpsLimit === f.id
                    ? { background: 'linear-gradient(140deg,rgba(255,211,77,.24),rgba(255,158,44,.14))', border: '2px solid #FFD34D' }
                    : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)' }
                }
              >
                <div className="display text-[20px]" style={{ color: s.fpsLimit === f.id ? '#FFD34D' : '#EDE0FA' }}>{f.label}</div>
                <div className="text-[12px] font-semibold leading-tight text-[#A48AC8]">{t(f.descKey)}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('audio')}>
          <div className="flex flex-col gap-4">
            <Volume label={t('master')} value={s.masterVolume} onChange={(v) => { s.set('masterVolume', v); refreshMusicVolume(); playSfx('click'); }} />
            <Volume label={t('sfx')} value={s.sfxVolume} onChange={(v) => { s.set('sfxVolume', v); playSfx('click'); }} />
            <Volume label={t('music')} value={s.musicVolume} onChange={(v) => { s.set('musicVolume', v); refreshMusicVolume(); }} />
            <div className="flex gap-2.5">
              <button className={`chip ${s.muteSfx ? 'chip--on' : ''}`} onClick={() => s.set('muteSfx', !s.muteSfx)}>
                SFX {s.muteSfx ? 'OFF' : 'ON'}
              </button>
              <button
                className={`chip ${s.muteMusic ? 'chip--on' : ''}`}
                onClick={() => { s.set('muteMusic', !s.muteMusic); refreshMusicVolume(); }}
              >
                Music {s.muteMusic ? 'OFF' : 'ON'}
              </button>
            </div>
          </div>
        </Section>

        {/* CHỌN NHẠC NỀN — danh sách lấy từ public/music-theme/manifest.json,
            tên hiển thị là tên đầy đủ (file trên đĩa đã được đổi thành slug an
            toàn, xem public/music-theme/README.md). */}
        <Section title={t('musicTrack')}>
          <div className="flex flex-col gap-2">
            <button
              className="rounded-xl px-4 py-3 text-left"
              style={
                s.musicTrack === 'random'
                  ? { background: 'linear-gradient(140deg,rgba(255,211,77,.24),rgba(255,158,44,.14))', border: '2px solid #FFD34D' }
                  : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)' }
              }
              onClick={() => { s.set('musicTrack', 'random'); reloadMusic(); playSfx('click'); }}
            >
              <div className="display text-[18px]" style={{ color: s.musicTrack === 'random' ? '#FFD34D' : '#EDE0FA' }}>
                {t('musicRandom')}
              </div>
              <div className="text-[12px] font-semibold text-[#A48AC8]">{t('musicRandomSub')}</div>
            </button>
            {tracks.map((tr) => (
              <button
                key={tr.file}
                className="rounded-xl px-4 py-3 text-left"
                style={
                  selectedTrack === tr.file
                    ? { background: 'linear-gradient(140deg,rgba(255,211,77,.24),rgba(255,158,44,.14))', border: '2px solid #FFD34D' }
                    : { background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)' }
                }
                onClick={() => { s.set('musicTrack', tr.file); reloadMusic(); playSfx('click'); }}
              >
                <div
                  className="text-[14px] font-semibold leading-snug"
                  style={{ color: selectedTrack === tr.file ? '#FFD34D' : '#EDE0FA' }}
                >
                  {tr.title}
                </div>
              </button>
            ))}
            {!tracks.length && (
              <div className="text-[12px] font-semibold text-[#A48AC8]">{t('musicEmpty')}</div>
            )}
          </div>
        </Section>

        <Section title={t('bgTheme')}>
          <div className="label-sm mb-2 opacity-70">{t('bgThemeSub')}</div>
          <ThemePicker />
        </Section>

        <div className="mt-7 flex items-center justify-between gap-4">
          {/* Hai trang pháp lý mở TAB MỚI: bấm nhầm giữa ván mà điều hướng cả trang
              là mất phòng, mất bài đang cầm. */}
          <div className="label-sm flex flex-wrap items-center gap-3 opacity-70">
            {/* Phiên bản đóng dấu lúc build: người chơi báo lỗi chỉ cần đọc dòng này. */}
            <span title={BUILD.date || undefined}>{BUILD.label}</span>
            <a href="/legal/terms" target="_blank" rel="noreferrer" className="hover:text-[#FFD34D]">{t('terms')}</a>
            <a href="/legal/privacy" target="_blank" rel="noreferrer" className="hover:text-[#FFD34D]">{t('privacy')}</a>
          </div>
          <button className="btn btn--gold" onClick={onClose}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}
