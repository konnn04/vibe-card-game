'use client';
import { useSettings } from './settings';
import { SFX_NAMES, type Sfx } from './sfxNames';

export type { Sfx } from './sfxNames';

/**
 * ÂM THANH — hai tầng, file thật đè lên bộ tổng hợp.
 *
 *  1. Nếu public/sfx có file trùng tên (xem public/sfx/README.md) thì phát file đó.
 *  2. Không có thì tổng hợp bằng WebAudio theo đặc tả SPEC bên dưới.
 *
 * Nhờ vậy game chạy được ngay khi chưa có asset nào, mà chỉ cần thả file vào
 * thư mục là thay được âm — không phải sửa một dòng code nào.
 */

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/* ------------------------------------------------------- file thay thế */

const buffers = new Map<string, AudioBuffer>();
let sfxManifest: Record<string, string> | null = null;
let manifestLoading: Promise<void> | null = null;

/**
 * Nạp manifest do scripts/gen-sfx-manifest.mjs sinh ra rồi giải mã sẵn toàn bộ
 * file. Gọi lúc màn loading để vào ván không bị khựng ở lần phát đầu tiên.
 */
export function preloadSfx(): Promise<void> {
  if (manifestLoading) return manifestLoading;
  manifestLoading = (async () => {
    try {
      // KHÔNG dùng cache:'force-cache' — manifest ĐỔI mỗi lần thêm/bớt file âm
      // thanh. force-cache bảo trình duyệt xài bản đã lưu bất kể cũ tới đâu, nên
      // ai từng mở game lúc thư mục sfx còn rỗng sẽ vĩnh viễn đọc lại manifest
      // "{}" và không bao giờ thấy âm mới. Chế độ mặc định vẫn dùng cache trên
      // đĩa, chỉ thêm một lần xác thực ETag (304, vài trăm byte).
      const res = await fetch('/sfx/manifest.json');
      sfxManifest = res.ok ? ((await res.json()) as Record<string, string>) : {};
    } catch {
      sfxManifest = {};
    }
    const c = ac();
    if (!c || !sfxManifest) return;
    await Promise.all(
      Object.entries(sfxManifest).map(async ([name, file]) => {
        try {
          const r = await fetch(`/sfx/${file}`);
          buffers.set(name, await c.decodeAudioData(await r.arrayBuffer()));
        } catch (err) {
          // Hỏng file nào thì âm đó rơi về bản tổng hợp, KHÔNG chặn cả game —
          // nhưng phải kêu lên. Nuốt im lặng thì người thay âm thanh chỉ thấy
          // "vẫn tiếng cũ" mà không biết vì sao (định dạng lạ, file lỗi...).
          console.warn(`[sfx] không giải mã được "${file}", dùng bản tổng hợp:`, err);
        }
      }),
    );
  })();
  return manifestLoading;
}

function playBuffer(buf: AudioBuffer, vol: number, rate: number) {
  const c = ac();
  if (!c) return;
  const g = c.createGain();
  g.gain.value = vol;
  g.connect(c.destination);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(g);
  src.start();
}

/* ------------------------------------------------------- bộ tổng hợp */

interface Spec { f: number; to: number; dur: number; type: OscillatorType; gain: number }

const SPEC: Record<Sfx, Spec> = {
  whoosh: { f: 900, to: 180, dur: 0.16, type: 'triangle', gain: 0.18 },
  place: { f: 320, to: 120, dur: 0.10, type: 'square', gain: 0.22 },
  action: { f: 260, to: 70, dur: 0.22, type: 'sawtooth', gain: 0.26 },
  draw: { f: 520, to: 660, dur: 0.09, type: 'triangle', gain: 0.16 },
  penalty: { f: 300, to: 90, dur: 0.30, type: 'sawtooth', gain: 0.20 },
  // Cấm lượt: hai nốt cụt, dứt khoát như đóng sập cửa.
  playSkip: { f: 520, to: 180, dur: 0.18, type: 'square', gain: 0.24 },
  // Rút nhẹ (+1/+2): đi lên, gọn.
  playDraw2: { f: 240, to: 520, dur: 0.20, type: 'square', gain: 0.24 },
  // Rút nặng (+4/+5/Wild+2): trầm và dày hơn hẳn, nghe là biết ăn đòn to.
  playDraw4: { f: 160, to: 420, dur: 0.34, type: 'sawtooth', gain: 0.28 },
  // Rút tới khi ra màu: dài, lê thê — đúng cảm giác rút mãi không thôi.
  playDrawUntil: { f: 200, to: 120, dur: 0.52, type: 'sawtooth', gain: 0.26 },
  // Lá Flip: quét nhanh, gợi cú lật.
  playFlipCard: { f: 420, to: 880, dur: 0.20, type: 'triangle', gain: 0.22 },
  rush: { f: 440, to: 880, dur: 0.32, type: 'sawtooth', gain: 0.22 },
  // Bị cấm lượt: trầm, cụt, nghe như bị chặn đứng lại.
  skipped: { f: 300, to: 120, dur: 0.26, type: 'square', gain: 0.22 },
  caught: { f: 380, to: 110, dur: 0.34, type: 'square', gain: 0.24 },
  // Bắt lỗi: tiếng "gõ búa" ngắn, căng thẳng, chưa biết đúng sai
  challenge: { f: 180, to: 150, dur: 0.14, type: 'square', gain: 0.26 },
  challengeWin: { f: 523, to: 1318, dur: 0.42, type: 'triangle', gain: 0.26 },
  challengeLose: { f: 420, to: 80, dur: 0.46, type: 'sawtooth', gain: 0.24 },
  // Đổi chiều: quét XUỐNG rồi lên, gợi cảm giác quay đầu.
  reverse: { f: 700, to: 300, dur: 0.22, type: 'triangle', gain: 0.20 },
  // Chọn màu: nốt trong trẻo, ngắn, không lấn tiếng đặt bài ngay trước đó.
  color: { f: 660, to: 990, dur: 0.18, type: 'sine', gain: 0.18 },
  // Đánh chen: sắc và gấp — cướp lượt phải nghe ra là "chen ngang".
  jumpIn: { f: 980, to: 520, dur: 0.16, type: 'square', gain: 0.24 },
  flip: { f: 200, to: 700, dur: 0.28, type: 'sine', gain: 0.20 },
  swap: { f: 620, to: 300, dur: 0.26, type: 'triangle', gain: 0.20 },
  win: { f: 523, to: 1046, dur: 0.55, type: 'triangle', gain: 0.25 },
  click: { f: 700, to: 700, dur: 0.045, type: 'sine', gain: 0.14 },
  // Đếm ngược: tiếng "tick" gọn, cao độ cố định để 5 nhịp nghe đều nhau.
  countdown: { f: 880, to: 880, dur: 0.09, type: 'square', gain: 0.20 },
  // Vào trận: quét lên, dứt khoát hơn hẳn tiếng tick.
  gameStart: { f: 330, to: 990, dur: 0.42, type: 'sawtooth', gain: 0.26 },
};

function synth(spec: Spec, vol: number, rate: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(vol * spec.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
  g.connect(c.destination);
  const osc = c.createOscillator();
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.f * rate, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, spec.to * rate), t + spec.dur);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + spec.dur + 0.02);
}

export function playSfx(name: Sfx, rate = 1) {
  const s = useSettings.getState();
  if (s.muteSfx) return;
  const vol = s.masterVolume * s.sfxVolume;
  if (vol <= 0.001) return;
  const buf = buffers.get(name);
  if (buf) return playBuffer(buf, vol, rate);
  synth(SPEC[name], vol, rate);
}

/** Danh sách âm đang dùng bản thay thế — cho màn Cài đặt / gỡ lỗi. */
export function overriddenSfx(): string[] {
  return SFX_NAMES.filter((n) => buffers.has(n));
}

/* ═══════════════════════════════════════════════════════════ NHẠC NỀN */

/**
 * Nhạc nền phát bằng <audio> + WebAudio.
 *
 * Vì sao <audio> chứ không decodeAudioData: có bài nặng 57MB — giải mã ra PCM
 * là hàng trăm MB trong RAM. <audio> phát kiểu STREAM, tốn gần như không đáng kể.
 *
 * Chuỗi xử lý (không cần thư viện ngoài, WebAudio có sẵn hết):
 *
 *   <audio> ─► lowpass ─┬─► dryGain ──┐
 *                       └─► convolver ─► wetGain ─┴─► musicGain ─► loa
 *
 *  - lowpass  : bóp tần số cao -> tiếng nghe đục, xa
 *  - convolver: vang/echo, dùng impulse response TỰ SINH (nhiễu tắt dần) nên
 *               không phải kèm file .wav impulse nào
 *  - dry/wet  : trộn giữa tiếng gốc và tiếng vang
 *
 * Mặt Dark (Ú Nồ Flip) kéo cả 3 thứ về phía "rơi xuống hố": cắt tần cao, dâng
 * vang, hạ âm lượng. Mọi thay đổi đi qua setTargetAtTime nên trượt mượt chứ
 * không giật nấc.
 */
interface MusicChain {
  el: HTMLAudioElement;
  src: MediaElementAudioSourceNode;
  lowpass: BiquadFilterNode;
  dry: GainNode;
  wet: GainNode;
  out: GainNode;
}

let chain: MusicChain | null = null;
let manifest: MusicManifest | null = null;
let manifestLoad: Promise<MusicManifest> | null = null;
let wantPlaying = false;
let darkMode = false;

export interface MusicTrack { file: string; title: string }
interface MusicManifest { default: string | null; tracks: MusicTrack[] }

/** Mượt hơn cắt nấc: mọi tham số đổi theo hằng số thời gian này. */
const GLIDE = 0.45;
/** Mặt Dark: tần số cắt + tỉ lệ vang + hệ số âm lượng. */
const DARK = { cutoff: 620, wet: 0.62, dry: 0.4, volume: 1 };
const LIGHT = { cutoff: 20000, wet: 0, dry: 1, volume: 1 };

export function loadMusicManifest(): Promise<MusicManifest> {
  // Memo hoá cả PROMISE, không chỉ kết quả: màn loading và Cài đặt có thể gọi
  // gần như cùng lúc, memo theo kết quả vẫn để lọt 2 request.
  if (manifestLoad) return manifestLoad;
  manifestLoad = (async () => {
    try {
      const res = await fetch('/music-theme/manifest.json');
      manifest = res.ok ? ((await res.json()) as MusicManifest) : { default: null, tracks: [] };
    } catch {
      manifest = { default: null, tracks: [] };
    }
    return manifest;
  })();
  return manifestLoad;
}

/** File nhạc mặc định theo manifest (khi người chơi chưa chọn gì). */
export function defaultMusicFile(): string | null {
  return manifest?.default ?? null;
}

export function musicTracks(): MusicTrack[] {
  return manifest?.tracks ?? [];
}

/* ── BÀI ĐANG PHÁT ────────────────────────────────────────────────────────
   Nhạc do module này tự chọn (chế độ ngẫu nhiên bốc bài mới sau mỗi lần hết
   bài), nên UI KHÔNG suy ra được tên bài từ cài đặt. Phát ra ngoài bằng một
   danh sách listener bé xíu thay vì kéo cả zustand vào đây — audio.ts cố tình
   không phụ thuộc React. */
let currentFile: string | null = null;
const musicListeners = new Set<() => void>();

/** Đăng ký nghe đổi bài; trả về hàm huỷ đăng ký. */
export function onMusicChange(fn: () => void): () => void {
  musicListeners.add(fn);
  return () => { musicListeners.delete(fn); };
}

/** Tên đầy đủ của bài đang phát (null = chưa phát bài nào). */
export function currentMusicTitle(): string | null {
  if (!currentFile) return null;
  const hit = musicTracks().find((t) => t.file === currentFile);
  return hit?.title ?? null;
}

/** Impulse response tổng hợp: nhiễu trắng tắt dần theo hàm mũ = phòng vang. */
function makeImpulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function ensureChain(): MusicChain | null {
  if (chain) return chain;
  const c = ac();
  if (!c) return null;

  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';

  const src = c.createMediaElementSource(el);
  const lowpass = c.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = LIGHT.cutoff;

  const convolver = c.createConvolver();
  convolver.buffer = makeImpulse(c, 2.6, 2.2);

  const dry = c.createGain();
  dry.gain.value = LIGHT.dry;
  const wet = c.createGain();
  wet.gain.value = LIGHT.wet;
  const out = c.createGain();
  out.gain.value = 0;

  src.connect(lowpass);
  lowpass.connect(dry);
  lowpass.connect(convolver);
  convolver.connect(wet);
  dry.connect(out);
  wet.connect(out);
  out.connect(c.destination);

  chain = { el, src, lowpass, dry, wet, out };
  // Hết bài: 1 bài thì lặp lại, ngẫu nhiên thì bốc bài khác.
  el.addEventListener('ended', () => { if (wantPlaying) void startTrack(); });
  return chain;
}

function targetVolume(): number {
  const s = useSettings.getState();
  if (!wantPlaying || s.muteMusic) return 0;
  return s.masterVolume * s.musicVolume * (darkMode ? DARK.volume : LIGHT.volume);
}

function applyGains() {
  const c = ac();
  if (!c || !chain) return;
  const t = c.currentTime;
  const m = darkMode ? DARK : LIGHT;
  chain.out.gain.setTargetAtTime(targetVolume(), t, GLIDE);
  chain.lowpass.frequency.setTargetAtTime(m.cutoff, t, GLIDE);
  chain.wet.gain.setTargetAtTime(m.wet, t, GLIDE);
  chain.dry.gain.setTargetAtTime(m.dry, t, GLIDE);
}

/** Chọn file sẽ phát tiếp theo theo thiết lập. */
function pickTrack(): string | null {
  const list = musicTracks();
  if (!list.length) return null;
  // '' = chưa chọn -> lấy bài mặc định ghi trong manifest.
  const want = useSettings.getState().musicTrack || manifest?.default || '';
  if (want !== 'random') {
    const hit = list.find((t) => t.file === want);
    if (hit) return hit.file; // chọn 1 bài -> lặp lại chính nó
  }
  // Ngẫu nhiên: tránh lặp lại đúng bài vừa phát khi còn bài khác.
  const current = chain?.el.src.split('/').pop();
  const pool = list.length > 1 ? list.filter((t) => decodeURIComponent(t.file) !== decodeURIComponent(current ?? '')) : list;
  return pool[Math.floor(Math.random() * pool.length)].file;
}

async function startTrack() {
  await loadMusicManifest();
  const ch = ensureChain();
  const file = pickTrack();
  if (!ch || !file) return;
  ch.el.src = `/music-theme/${file}`;
  currentFile = file;
  musicListeners.forEach((fn) => fn());
  ch.el.loop = useSettings.getState().musicTrack !== 'random';
  applyGains();
  try {
    await ch.el.play();
  } catch {
    // Trình duyệt chặn autoplay -> chờ chạm/bấm đầu tiên (xem unlockAudio).
  }
}

export function setMusicPlaying(on: boolean) {
  wantPlaying = on;
  if (!on) {
    applyGains();
    // Hạ âm lượng mượt rồi mới dừng hẳn, không cắt phựt.
    setTimeout(() => { if (!wantPlaying) chain?.el.pause(); }, GLIDE * 2000);
    return;
  }
  // ĐANG PHÁT RỒI THÌ THÔI — chỉ áp lại âm lượng.
  //
  // Nhạc chạy liền mạch từ menu -> phòng chờ -> vào ván, mà mỗi lần đổi màn
  // hình đều gọi hàm này. Không có nhánh này thì lần gọi nào cũng startTrack()
  // và bài nhảy về đầu đúng lúc đang vào trận.
  if (chain && chain.el.src && !chain.el.paused) {
    applyGains();
    return;
  }
  void startTrack();
}

/** Đổi bài ngay (khi người chơi chọn bài khác trong Cài đặt). */
export function reloadMusic() {
  if (wantPlaying) void startTrack();
}

/** Âm lượng/mute vừa đổi -> áp lại ngay. */
export function refreshMusicVolume() {
  applyGains();
}

/**
 * NHẠC NỔI LÊN ăn mừng — dâng âm lượng nhạc nền rồi trả về cũ.
 *
 * Dùng chính chuỗi xử lý sẵn có nên không phải phát thêm file nào: chỉ là một
 * đường cong trên musicGain. Cũng vì thế nó tự tôn trọng mute và thanh âm lượng
 * của người chơi — đang tắt nhạc thì targetVolume() = 0, dâng lên từ 0 vẫn là 0.
 *
 * Trả về ÂM LƯỢNG BÌNH THƯỜNG bằng cách gọi lại applyGains() chứ không nhớ giá
 * trị cũ: trong 3 giây đó người chơi có thể vừa kéo thanh âm lượng, nhớ giá trị
 * cũ là ghi đè mất thao tác của họ.
 */
export function musicFlourish(peak = 1.6, holdMs = 1800) {
  const c = ac();
  if (!c || !chain) return;
  const t = c.currentTime;
  chain.out.gain.setTargetAtTime(targetVolume() * peak, t, 0.12);
  setTimeout(() => applyGains(), holdMs);
}

/**
 * Mặt Dark của Ú Nồ Flip: nhạc chìm xuống, vang lên, đục đi — cảm giác rơi vào
 * hố đen. Chỉ đụng NHẠC NỀN, không đụng hiệu ứng âm thanh (tiếng bài, tiếng hô
 * vẫn phải rõ để chơi được).
 */
export function setMusicDark(dark: boolean) {
  if (darkMode === dark) return;
  darkMode = dark;
  applyGains();
}

/**
 * MỞ KHOÁ ÂM THANH Ở CHẠM/BẤM ĐẦU TIÊN.
 *
 * Trình duyệt chặn phát âm trước khi người dùng tương tác, nên nếu chỉ gọi
 * play() lúc vào ván thì rơi vào đúng khe "đã tương tác ở màn menu nhưng
 * AudioContext vẫn suspended" -> nhạc câm mà không báo lỗi gì. Gắn một lần vào
 * pointerdown/keydown: resume context rồi phát lại nếu đang muốn phát.
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  const kick = () => {
    const c = ac(); // ac() tự resume nếu đang suspended
    // Phải xử lý cả trường hợp CHƯA CÓ chain: ở menu ta bật nhạc ngay khi tải
    // xong, lúc đó chưa có tương tác nào nên play() bị chặn và chain chưa dựng.
    if (wantPlaying && (!chain || chain.el.paused)) void startTrack();
    // resume() là bất đồng bộ: cú chạm đầu có thể vẫn thấy 'suspended', nên chỉ
    // gỡ listener khi context đã thật sự chạy — lần chạm sau sẽ chốt nốt.
    if (c?.state === 'running') {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
    }
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}
