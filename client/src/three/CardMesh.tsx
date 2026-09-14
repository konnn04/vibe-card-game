'use client';
import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { PhotoAtlas } from './photoAtlas';
import { CARD_H, CARD_W, DECK_POS } from './layout';
import { has, register, unregister } from './stage';

/**
 * Hình chữ nhật bo góc dùng làm mặt lá bài (thay PlaneGeometry sắc cạnh).
 *
 * UV phải khớp ĐÚNG quy ước PlaneGeometry của three.js: u = (x+w/2)/w và
 * **v = (y+h/2)/h** — tức v=1 ở ĐỈNH lá, v=0 ở ĐÁY.
 *
 * BUG CŨ (đã gây lật DỌC toàn bộ mặt trước, vd số "2" thành "2" lộn ngược):
 * tôi viết nhầm v = 1-(y+h/2)/h vì đọc source PlaneGeometry mà bỏ sót chi
 * tiết nó đẩy vertex với Y ĐẢO DẤU (`vertices.push(x, -y, 0)`) — chính dấu
 * âm đó khiến hàng iy=0 (uv.v=1) rơi vào ĐỈNH chứ không phải đáy. Với
 * texture.flipY=true (mặc định three.js) thì v=1 ứng với ĐỈNH ảnh nguồn, nên
 * công thức cũ map đỉnh lá vào đáy ảnh -> lật dọc.
 *
 * Lỗi này khó phát hiện vì các chữ số gần đối xứng dọc (3, 8) trông vẫn
 * "đúng", và ở MẶT SAU nó tự triệt tiêu (mặt sau nhìn từ phía đối diện qua
 * phép quay 180° quanh trục X cũng là 1 phép lật dọc) — nên mặt sau trông
 * đúng trong khi mặt trước sai.
 */
function roundedRectGeometry(w: number, h: number, r: number, segments = 4): THREE.BufferGeometry {
  const x = -w / 2;
  const y = -h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);
  const geo = new THREE.ShapeGeometry(shape, segments);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  uv.needsUpdate = true;
  return geo;
}

// 1 geometry dùng chung cho TOÀN BỘ lá bài (không tạo geometry mới mỗi lá)
const CARD_RADIUS = 0.045;
const GEO = roundedRectGeometry(CARD_W, CARD_H, CARD_RADIUS);

type MatKind = 'basic' | 'standard';
// Chỉ 2 loại material thật sự được tạo (basic/standard, đều có .map) — khai kiểu
// cụ thể để dispose texture khi dọn cache mà không cần ép kiểu `any`.
type CardMaterial = THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
const matCache = new Map<string, CardMaterial>();

/**
 * Mặt sau lá bài: KHÔNG xoay mesh (dùng chung geometry với mặt trước), chỉ đổi
 * `side: THREE.BackSide` để nó tự hiện khi camera nhìn từ phía sau — cách này
 * không có phép quay cục bộ nào để cộng dồn sai theo góc ghế (yaw).
 *
 * Nhưng mặt sau được nhìn từ phía ĐỐI DIỆN của cùng 1 mặt phẳng: giữa họ góc
 * mặt trước (pitch ≈ -90°) và mặt sau (pitch ≈ +90°) chênh đúng 180° quanh
 * trục X — tức 1 phép LẬT DỌC trên màn hình. Vì vậy mặt sau phải bù lại bằng
 * cách lật riêng trục V trong không gian UV (giữ nguyên U — lật U sẽ thành soi
 * gương trái-phải, sai kiểu khác).
 */
function flipUvV(map: THREE.Texture, offset: THREE.Vector2, repeat: THREE.Vector2) {
  map.repeat.set(repeat.x, -repeat.y);
  map.offset.set(offset.x, offset.y + repeat.y);
}

/**
 * Material tạm khi atlas ảnh thật CHƯA tải xong — một màu phẳng tối, dùng
 * chung cho mọi lá. Trước đây chỗ này rơi về bản vẽ tay bằng canvas; giờ ảnh
 * thật phủ 100% nên chỉ cần một tấm nền trung tính trong vài trăm ms đầu.
 *
 * PHẢI LÀ HAI MATERIAL RIÊNG, không phải một cái rồi sửa `side` mỗi lần gọi.
 * Bản cũ dùng đúng một material và ghi đè `loadingMat.side` theo tham số — mà
 * material đó được CẢ BÀN dùng chung, nên lần gọi cuối cùng quyết định hướng
 * mặt cho tất cả: chỉ cần một lá xin mặt sau là mọi lá đang xin mặt trước cũng
 * lật thành BackSide và biến mất khỏi tầm nhìn, và ngược lại.
 */
const placeholderMats: Partial<Record<'front' | 'back', CardMaterial>> = {};
function placeholderMaterial(isBack: boolean): CardMaterial {
  const key = isBack ? 'back' : 'front';
  let mat = placeholderMats[key];
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color: '#1B1220', side: isBack ? THREE.BackSide : THREE.FrontSide });
    placeholderMats[key] = mat;
  }
  return mat;
}

/** Material từ atlas ẢNH THẬT (crop bằng UV, không redraw canvas) — cache theo variant+tên sprite. */
function photoMaterial(atlas: PhotoAtlas, name: string, kind: MatKind, isBack = false): CardMaterial | null {
  const rect = atlas.rect(name);
  if (!rect) return null;
  const ck = `photo:${atlas.variant}:${kind}:${name}:${isBack ? 'b' : 'f'}`;
  const hit = matCache.get(ck);
  if (hit) return hit;
  const map = atlas.texture.clone();
  if (isBack) flipUvV(map, rect.offset, rect.repeat);
  else { map.repeat.copy(rect.repeat); map.offset.copy(rect.offset); }
  const side = isBack ? THREE.BackSide : THREE.FrontSide;
  const mat =
    kind === 'standard'
      ? new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0, side })
      : new THREE.MeshBasicMaterial({ map, side });
  matCache.set(ck, mat);
  return mat;
}

/**
 * DỰNG SẴN MATERIAL CHO CẢ ATLAS, một lần, ngay khi atlas vừa tải xong.
 *
 * Mỗi lá lần đầu xuất hiện đều phải tạo material + bản sao texture của riêng
 * nó. Bình thường không đáng kể, nhưng nó rơi đúng vào khoảnh khắc RÚT BÀI /
 * ĐÁNH BÀI — tức đúng lúc đang có animation chạy, nên tốn bao nhiêu là thấy
 * bấy nhiêu. Bộ Flip nặng gấp đôi vì mỗi lá cần material cho CẢ HAI mặt thật.
 *
 * Dồn hết chi phí đó về lúc tải atlas (màn loading), nơi chậm vài ms không ai
 * nhận ra. Chỉ tạo đối tượng JS — texture GPU vẫn dùng chung một bản của atlas,
 * nên không tốn thêm VRAM.
 */
export function warmCardMaterials(atlas: PhotoAtlas, standard: boolean) {
  const kind: MatKind = standard ? 'standard' : 'basic';
  for (const name of atlas.names()) {
    photoMaterial(atlas, name, kind, false);
    photoMaterial(atlas, name, kind, true);
  }
}

export function clearCardMaterialCache() {
  for (const [key, mat] of matCache.entries()) {
    if (!key.includes(':custom:')) mat.map?.dispose();
    mat.dispose();
  }
  matCache.clear();
}

const GLOW_GEO = roundedRectGeometry(CARD_W + 0.07, CARD_H + 0.07, CARD_RADIUS + 0.035);

export interface CardMeshProps {
  id: string;
  standard: boolean;
  shadows: boolean;
  /** 'both' = render cả 2 mặt, 'back' = chỉ render mặt sau */
  sides: 'both' | 'back';
  isMe?: boolean;
  interactive?: boolean;
  dimmed?: boolean;
  playable?: boolean;
  /** Chữ phím tắt nổi trên đầu lá (vd "S" cho lá đánh chen được). */
  hotkey?: string;
  /** Viền sáng kiểu ĐÁNH CHEN (jump-in, ngoài lượt) -> màu khác để phân biệt. */
  jumpIn?: boolean;
  layerIndex?: number;
  spawnPos?: THREE.Vector3;
  spawnRot?: THREE.Euler;
  cardColor?: string;
  /** Atlas ảnh thật (nếu đã tải xong) + tên sprite tương ứng mặt trước/sau.
   *  Thiếu atlas HOẶC atlas không có sprite này -> tự rơi về faceKey/backKey vẽ tay. */
  photoAtlas?: PhotoAtlas | null;
  photoFaceName?: string | null;
  /** Atlas RIÊNG cho mặt sau — dùng khi mặt sau không cùng atlas với mặt trước
   *  (đặc thù Ú Nô Flip: mặt sau bài đối thủ là atlas của MẶT CÒN LẠI, vd đang
   *  ở Light thì mặt sau tra trong atlas Dark). undefined -> dùng chung `photoAtlas`. */
  photoBackAtlas?: PhotoAtlas | null;
  photoBackName?: string | null;
  onHoverColor?: (c: string | null) => void;
  /** Báo lên Cards.tsx CHÍNH LÁ nào đang hover — để layout dạt bài lân cận + nhấc theo Y (không phải Z cục bộ). */
  onHoverCard?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}

export function CardMesh({
  id, standard, shadows, sides, isMe, interactive, dimmed,
  playable, jumpIn, hotkey, layerIndex, spawnPos, spawnRot, cardColor,
  photoAtlas, photoFaceName, photoBackAtlas, photoBackName, onHoverColor, onHoverCard, onSelect,
}: CardMeshProps) {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const glowMesh = useRef<THREE.Mesh>(null);
  const kind: MatKind = standard ? 'standard' : 'basic';

  // BẢO MẬT CHỐNG GIAN LẬN: Chỉ khi isMe=true hoặc sides='both' (discard pile) mới được load/render mặt trước
  const canShowFace = isMe || sides === 'both';
  const front = useMemo(() => {
    if (!canShowFace) return null;
    const photo = photoAtlas && photoFaceName ? photoMaterial(photoAtlas, photoFaceName, kind) : null;
    return photo ?? placeholderMaterial(false);
  }, [canShowFace, kind, photoAtlas, photoFaceName]);
  const back = useMemo(() => {
    const backAtlas = photoBackAtlas !== undefined ? photoBackAtlas : photoAtlas;
    const photo = backAtlas && photoBackName ? photoMaterial(backAtlas, photoBackName, kind, true) : null;
    return photo ?? placeholderMaterial(true);
  }, [kind, photoAtlas, photoBackAtlas, photoBackName]);

  // Vàng = tới lượt mình đánh bình thường. Xanh lơ = ĐÁNH CHEN ngoài lượt
  // (trùng y hệt lá trên đống) — hai việc khác hẳn nhau nên không dùng chung màu.
  const activeGlowColor = playable ? (jumpIn ? '#49D8F0' : '#FFD34D') : undefined;
  const glowMat = useMemo(() => {
    if (!activeGlowColor) return null;
    return new THREE.MeshBasicMaterial({ color: activeGlowColor, transparent: true, opacity: 0.85 });
  }, [activeGlowColor]);

  useEffect(() => {
    return () => {
      glowMat?.dispose();
    };
  }, [glowMat]);

  // useFrame bên dưới mutate .opacity mỗi frame để nhấp nháy — React Compiler
  // chặn mutate trực tiếp giá trị useMemo trả về (react-hooks/immutability) VÀ
  // chặn luôn việc ghi ref ngay trong render, nên đồng bộ trong effect (chạy
  // ngay sau commit, sớm hơn nhiều so với useFrame tick kế tiếp).
  const glowMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  useEffect(() => {
    glowMatRef.current = glowMat;
  }, [glowMat]);

  const registeredRef = useRef(false);

  useEffect(() => {
    const g = group.current;
    if (!g || registeredRef.current) return;
    registeredRef.current = true;

    // Chỉ gán toạ độ ban đầu nếu lá bài chưa có trong stage
    if (!has(id)) {
      if (spawnPos) {
        g.position.copy(spawnPos);
        if (spawnRot) g.rotation.copy(spawnRot);
        else g.rotation.set(Math.PI / 2, 0, 0);
      } else {
        g.position.copy(DECK_POS);
        g.rotation.set(Math.PI / 2, 0, 0);
      }
    }
    register(id, g);

    return () => {
      unregister(id);
      registeredRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Nhấp nháy viền vàng khi playable/màu active của Wild. Việc "nhấc lá lên khi
  // hover" KHÔNG còn xử lý cục bộ ở đây nữa — đã chuyển lên layout dùng chuột
  // (Cards.tsx + layout.ts fanTransform) để nhấc đúng trục Y thế giới và dạt
  // bài lân cận, thay vì trục Z cục bộ của lá (vốn bị nghiêng theo phối cảnh
  // cầm bài nên "nổi lên" chéo, khó đọc bài — đúng lỗi người dùng báo).
  useFrame((st) => {
    const glowMat = glowMatRef.current;
    if (glowMesh.current && glowMat) {
      const pulse = 0.45 + 0.45 * Math.sin(st.clock.elapsedTime * 6.5);
      glowMat.opacity = pulse;
    }
  });

  const baseOrder = layerIndex !== undefined ? 20 + layerIndex : (dimmed ? 0 : 2);

  return (
    <group ref={group}>
      {/* Nhãn phím tắt nổi trên đầu lá — chỉ 1 lá có tại một thời điểm nên
          không sợ tốn: Html của drei là lớp DOM riêng, luôn nằm trên bài nên
          đọc được kể cả khi lá bị lá khác đè. */}
      {hotkey && (
        <Html position={[0, CARD_H * 0.72, 0]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className="label"
            style={{
              display: 'grid', placeItems: 'center',
              minWidth: 26, height: 26, padding: '0 6px', borderRadius: 8,
              fontSize: 14, fontWeight: 800,
              background: 'linear-gradient(135deg,#49D8F0,#1B72C4)',
              color: '#08131A',
              border: '2px solid rgba(255,255,255,.85)',
              boxShadow: '0 3px 10px rgba(0,0,0,.6)',
              animation: 'pulseGlow 1.4s ease-in-out infinite',
            }}
          >
            {hotkey}
          </div>
        </Html>
      )}
      <group ref={inner}>
        {/* Viền phát sáng nhấp nháy báo hiệu lá bài có thể đánh hoặc màu active của Wild */}
        {glowMat && (
          <mesh
            ref={glowMesh}
            geometry={GLOW_GEO}
            material={glowMat}
            position={[0, 0, sides === 'both' && !isMe ? 0.003 : -0.002]}
            renderOrder={baseOrder + (sides === 'both' && !isMe ? 1 : -1)}
          />
        )}
        {canShowFace && front && (
          <mesh
            geometry={GEO}
            material={front}
            castShadow={shadows}
            renderOrder={baseOrder}
            onPointerOver={interactive ? (e) => {
              e.stopPropagation();
              onHoverCard?.(id);
              if (cardColor && onHoverColor) onHoverColor(cardColor);
              document.body.style.cursor = 'pointer';
            } : undefined}
            onPointerOut={interactive ? () => {
              onHoverCard?.(null);
              if (onHoverColor) onHoverColor(null);
              document.body.style.cursor = 'auto';
            } : undefined}
            onPointerDown={interactive && onSelect ? (e) => { e.stopPropagation(); onSelect(id); } : undefined}
          />
        )}
        <mesh
          geometry={GEO}
          material={back}
          position={[0, 0, -0.005]}
          castShadow={shadows}
          renderOrder={baseOrder - 1}
          onPointerOver={interactive && sides !== 'both' ? (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; } : undefined}
          onPointerOut={interactive && sides !== 'both' ? () => { document.body.style.cursor = 'auto'; } : undefined}
          onPointerDown={interactive && sides !== 'both' && onSelect ? (e) => { e.stopPropagation(); onSelect(id); } : undefined}
        />
      </group>
    </group>
  );
}
