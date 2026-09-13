'use client';
import stdAtlas from '@/public/card-texture/u-no-std.json';
import flipLightAtlas from '@/public/card-texture/u-no-flip-light.json';
import flipDarkAtlas from '@/public/card-texture/u-no-flip-dark.json';

/**
 * Cắt MỘT lá bài ra khỏi atlas ảnh thật, cho UI 2D (menu, hướng dẫn chơi).
 *
 * Toạ độ lấy thẳng từ file .json đi kèm ảnh (import trực tiếp, không chép tay).
 * Kích thước ảnh là số THẬT của file, KHÔNG suy từ max(x+w) trong json — đó chỉ
 * là biên nội dung, lệch với khổ ảnh nên từng cắt lệch hết cả cỗ bài.
 *
 * Cắt bằng background-position theo PIXEL chứ không phần trăm: phần trăm chỉ
 * đúng khi tỉ lệ khung hiển thị trùng khít tỉ lệ ô sprite — một ràng buộc ngầm
 * rất dễ vỡ khi đổi kích thước thẻ.
 */
export type AtlasId = 'std' | 'flipLight' | 'flipDark';

interface AtlasFrame { x: number; y: number; w: number; h: number; name: string }

const ATLASES: Record<AtlasId, { src: string; w: number; h: number; frames: AtlasFrame[] }> = {
  std: { src: '/card-texture/u-no-std.jpg', w: 2048, h: 2048, frames: stdAtlas as AtlasFrame[] },
  flipLight: { src: '/card-texture/u-no-flip-light.jpg', w: 4096, h: 4096, frames: flipLightAtlas as AtlasFrame[] },
  flipDark: { src: '/card-texture/u-no-flip-dark.jpg', w: 4096, h: 4096, frames: flipDarkAtlas as AtlasFrame[] },
};

export function hasSprite(atlas: AtlasId, name: string): boolean {
  return ATLASES[atlas].frames.some((f) => f.name === name);
}

export function CardPhoto({
  atlas, name, height, className, style,
}: {
  atlas: AtlasId;
  name: string;
  height: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const a = ATLASES[atlas];
  const f = a.frames.find((s) => s.name === name);
  if (!f) return null;
  const scale = height / f.h;
  return (
    <div
      className={className}
      style={{
        width: f.w * scale,
        height,
        backgroundImage: `url(${a.src})`,
        backgroundSize: `${a.w * scale}px ${a.h * scale}px`,
        backgroundPosition: `${-f.x * scale}px ${-f.y * scale}px`,
        backgroundRepeat: 'no-repeat',
        ...style,
      }}
    />
  );
}
