'use client';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import type { CardColor, CardValue, DeckType, DeckSide } from '@u-no/game-engine';

/**
 * Atlas ảnh thật (chụp/scan bộ bài Ú Nô thật) — thay cho atlas vẽ tay bằng Canvas.
 * Nguồn: public/card-texture/{u-no-std,u-no-flip-light,u-no-flip-dark}.{png,json}.
 *
 * x/y/w/h trong JSON là toạ độ PIXEL THẬT trên chính file PNG đi kèm (x,y = góc
 * trên-trái sprite, w,h = rộng/cao) — KHÔNG giả định trước 1 kích thước canvas
 * chung cho cả 3 bộ. Từng bị 1 bug: hardcode chia cho 4096 vì lúc đó tưởng cả
 * 3 JSON cùng hệ quy chiếu 4096×4096; sau đó u-no-std.json được xuất lại để
 * khớp đúng u-no-std.jpg thật (2048×2048) trong khi 2 file Flip vẫn theo
 * 4096×4096 — hardcode 1 hằng số chung cắt sai hẳn 1 nửa cho bộ classic. Sửa
 * triệt để: luôn đọc kích thước PIXEL THẬT của texture đã tải (`image.width`/
 * `height`) làm mẫu số, không đoán/hardcode — đúng với mọi file bất kể ai
 * xuất lại JSON ở độ phân giải nào sau này.
 */
export type AtlasVariant = 'std' | 'flipLight' | 'flipDark';

const SOURCES: Record<AtlasVariant, { png: string; json: string }> = {
  std: { png: '/card-texture/u-no-std.jpg', json: '/card-texture/u-no-std.json' },
  flipLight: { png: '/card-texture/u-no-flip-light.jpg', json: '/card-texture/u-no-flip-light.json' },
  flipDark: { png: '/card-texture/u-no-flip-dark.jpg', json: '/card-texture/u-no-flip-dark.json' },
};

interface SpriteRect { x: number; y: number; w: number; h: number; name: string }

export interface PhotoAtlas {
  variant: AtlasVariant;
  texture: THREE.Texture;
  /** true nếu tên sprite tồn tại trong atlas này (không thì phải fallback thủ công). */
  has(name: string): boolean;
  /** offset/repeat UV cho 1 sprite — set thẳng vào map.offset/map.repeat của material. */
  rect(name: string): { offset: THREE.Vector2; repeat: THREE.Vector2 } | null;
  /** Toàn bộ tên sprite — dùng để dựng sẵn material trước khi vào ván. */
  names(): string[];
}

const loaded = new Map<AtlasVariant, Promise<PhotoAtlas>>();
const loader = new THREE.TextureLoader();

/** Kích thước pixel THẬT của ảnh đã tải — không đoán, đọc thẳng từ element ảnh. */
function realImageSize(texture: THREE.Texture): { w: number; h: number } {
  const img = texture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = img?.naturalWidth || img?.width || 1;
  const h = img?.naturalHeight || img?.height || 1;
  return { w, h };
}

function buildAtlas(variant: AtlasVariant, texture: THREE.Texture, sprites: SpriteRect[]): PhotoAtlas {
  const index = new Map<string, SpriteRect>();
  for (const s of sprites) index.set(s.name, s);
  const { w: imgW, h: imgH } = realImageSize(texture);
  return {
    variant,
    texture,
    has: (name) => index.has(name),
    names: () => [...index.keys()],
    rect(name) {
      const s = index.get(name);
      if (!s) return null;
      return {
        offset: new THREE.Vector2(s.x / imgW, 1 - (s.y + s.h) / imgH),
        repeat: new THREE.Vector2(s.w / imgW, s.h / imgH),
      };
    },
  };
}

/** Tải 1 atlas ảnh thật (PNG + JSON song song), cache theo variant — chỉ tải 1 lần cho cả app. */
export function loadPhotoAtlas(variant: AtlasVariant): Promise<PhotoAtlas> {
  const hit = loaded.get(variant);
  if (hit) return hit;

  const { png, json } = SOURCES[variant];
  const promise = Promise.all([
    new Promise<THREE.Texture>((resolve, reject) => loader.load(png, resolve, undefined, reject)),
    fetch(json).then((r) => r.json() as Promise<SpriteRect[]>),
  ]).then(([texture, sprites]) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return buildAtlas(variant, texture, sprites);
  });
  loaded.set(variant, promise);
  return promise;
}

/**
 * Hook tải 1 atlas ảnh thật — gọi ở CHỖ CHUNG (Cards.tsx), không gọi trong
 * từng CardMesh (hàng chục instance) để khỏi tải/subscribe lặp lại.
 * `variant=null` -> không tải gì, trả null ngay (dùng khi chưa cần, vd đang
 * chơi bộ classic thì không cần load flipDark).
 */
export function usePhotoAtlas(variant: AtlasVariant | null): PhotoAtlas | null {
  const [atlas, setAtlas] = useState<PhotoAtlas | null>(null);
  useEffect(() => {
    if (!variant) return; // không setState(null) đồng bộ ở đây — xem gate ở return bên dưới
    let dead = false;
    loadPhotoAtlas(variant)
      .then((a) => {
        if (!dead) setAtlas(a);
      })
      .catch((err) => console.warn(`[photoAtlas] Tải atlas "${variant}" thất bại:`, err));
    return () => {
      dead = true;
    };
  }, [variant]);
  // Gate theo atlas.variant thay vì setState(null) khi variant đổi/tắt: tránh
  // trả nhầm atlas CŨ (vd đang chờ tải flipDark mà vẫn trả flipLight cache lại).
  return atlas && atlas.variant === variant ? atlas : null;
}

export function disposePhotoAtlases() {
  for (const p of loaded.values()) {
    void p.then((a) => a.texture.dispose()).catch(() => {});
  }
  loaded.clear();
}

/* ------------------------------------------------------- tên sprite theo lá bài */

/** Màu atlas dark dùng 'cyan' thay vì 'teal' của engine — chỉ khác tên gọi. */
const DARK_ATLAS_COLOR: Partial<Record<CardColor, string>> = { teal: 'cyan' };
const atlasColorName = (c: CardColor) => DARK_ATLAS_COLOR[c] ?? c;

/** Atlas nào (std/flipLight/flipDark) áp dụng cho ván hiện tại + mặt hiện tại. */
export function atlasVariantFor(deckType: DeckType, side: DeckSide): AtlasVariant {
  if (deckType !== 'flip') return 'std';
  return side === 'dark' ? 'flipDark' : 'flipLight';
}

/**
 * Tên sprite tương ứng 1 mặt bài (color+value) trong atlas ảnh thật.
 * Trả về null nếu atlas không có sprite này (vd: lá "0" ở bộ Flip — bộ ảnh
 * thật không có, phải fallback về atlas vẽ tay) — KHÔNG throw, để chỗ gọi
 * tự quyết định phương án dự phòng.
 */
export function resolvePhotoSprite(
  variant: AtlasVariant,
  color: CardColor,
  value: CardValue,
  chosenColor?: CardColor,
): string | null {
  if (variant === 'std') {
    if (color === 'wild') {
      const c = chosenColor && chosenColor !== 'wild' ? chosenColor : null;
      if (value === 'wild') return c ? `wild_draw_${c}` : 'wild_draw';
      if (value === 'wild4') return c ? `wild_draw_4_${c}` : 'wild_draw_4';
      return null;
    }
    if (/^\d$/.test(value)) return `${value}_${color}`;
    if (value === 'draw2') return `draw_2_${color}`;
    if (value === 'skip') return `skip_${color}`;
    if (value === 'reverse') return `reverse_${color}`;
    return null;
  }

  if (variant === 'flipLight') {
    if (color === 'wild') {
      const c = chosenColor && chosenColor !== 'wild' ? chosenColor : null;
      if (value === 'wild') return c ? `wild_draw_${c}` : 'wild_draw';
      if (value === 'wild2') return c ? `wild_draw_2_${c}` : 'wild_draw_2';
      return null;
    }
    // Bộ Flip thật không có lá "0" — engine.ts giờ không sinh lá này nữa (xem
    // deck.ts), nhưng giữ check ở đây phòng dữ liệu cũ/state stale từ trước bản vá.
    if (value === '0') return null;
    if (/^\d$/.test(value)) return `${value}_${color}`;
    if (value === 'draw1') return `draw_1_${color}`;
    if (value === 'skip') return `skip_${color}`;
    if (value === 'reverse') return `reverse_${color}`;
    if (value === 'flip') return `flip_${color}`;
    return null;
  }

  // flipDark
  const ac = atlasColorName(color);
  if (color === 'wild') {
    const c = chosenColor && chosenColor !== 'wild' ? atlasColorName(chosenColor) : null;
    if (value === 'wild') return c ? `wild_dark_${c}` : 'wild_dark';
    if (value === 'wildColor') return c ? `draw_until_dark_${c}` : 'draw_until_dark';
    return null;
  }
  if (value === '0') return null; // bộ ảnh thật không có lá 0 ở mặt Dark
  if (/^\d$/.test(value)) return `${value}_${ac}`;
  if (value === 'draw5') return `draw_5_dark_${ac}`;
  if (value === 'skipAll') return `skip_all_dark${ac}`; // asset đặt tên liền, không có dấu gạch dưới
  if (value === 'reverse') return `reverse_dark_${ac}`;
  if (value === 'flip') return `flip_dark_${ac}`;
  return null;
}

/** Tên sprite mặt sau lá bài — cả 3 atlas đều đặt ở cùng vị trí 'back_side'. */
export const PHOTO_BACK_NAME = 'back_side';
