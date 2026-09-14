'use client';
import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { mulberry32 } from '@u-no/game-engine';
import { COLOR_HEX } from './atlas';
import { TABLE_R } from './layout';
import { gfxOf, useSettings } from '@/src/lib/settings';
import { themeMeta, type BgTheme } from '@/src/lib/themes';
import { REVERSE_MS } from '@/src/state/timeline';
import { useMatch } from '@/src/state/match';

/**
 * Bảng màu mặt bàn KHÔNG khai ở đây nữa: nó là một phần của chủ đề nền
 * (src/ui/themes.tsx). Bàn 3D và cảnh nền CSS phải luôn cùng một chủ đề — tách
 * làm hai bảng thì thêm chủ đề mới là chắc chắn quên sửa một bên.
 */

/**
 * Texture mặt bàn: gradient tròn vẽ 1 lần trên canvas (rẻ hơn shader, 1 texture).
 * Canvas offscreen (không gắn vào DOM) nên dựng thẳng trong useMemo là an toàn —
 * không cần useState/useEffect chỉ để gán 1 giá trị tính toán thuần từ `skin`.
 */
function useTableTexture(skin: BgTheme) {
  const tex = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const s = themeMeta(skin).table;
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size * 0.46, size * 0.04, size / 2, size / 2, size * 0.52);
    g.addColorStop(0, s.inner);
    g.addColorStop(0.36, s.mid);
    g.addColorStop(1, s.outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // vòng tròn trang trí như mock (2 đường mảnh)
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,170,.35)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.47, 0, Math.PI * 2);
    ctx.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [skin]);

  // Chỉ dọn dẹp GPU texture cũ khi đổi skin/unmount — không setState trong effect.
  useEffect(() => () => tex?.dispose(), [tex]);

  return tex;
}

export function TableTop({ skin }: { skin: BgTheme }) {
  const graphics = useSettings((s) => s.graphics);
  const gfx = gfxOf(graphics);
  const s = themeMeta(skin).table;
  const tex = useTableTexture(skin);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={gfx.shadows}>
        <circleGeometry args={[TABLE_R, 64]} />
        {gfx.standardMaterial ? (
          <meshStandardMaterial map={tex ?? undefined} roughness={0.9} metalness={0.02} />
        ) : (
          <meshBasicMaterial map={tex ?? undefined} />
        )}
      </mesh>
      <NeonRim color={s.rim} spin={graphics !== 'low'} />
    </group>
  );
}

/** Viền kem quanh bàn — mesh emissive mỏng, không dùng box-shadow CSS. */
function NeonRim({ color, spin }: { color: string; spin: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.z += dt * 0.06;
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
      <ringGeometry args={[TABLE_R * 0.995, TABLE_R * 1.028, 96, 1]} />
      <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.75} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Ánh sáng: point light đổi màu theo màu đang hiệu lực (wild -> cả bàn đổi tông). */
export function Lights({ skin }: { skin: BgTheme }) {
  const graphics = useSettings((s) => s.graphics);
  const gfx = gfxOf(graphics);
  const activeColor = useMatch((s) => s.state?.activeColor ?? 'red');
  const side = useMatch((s) => s.state?.side ?? 'light');
  const target = useMemo(() => new THREE.Color(COLOR_HEX[activeColor] ?? '#ffffff'), [activeColor]);
  const point = useRef<THREE.PointLight>(null);

  useFrame((_, dt) => {
    if (point.current) point.current.color.lerp(target, Math.min(1, dt * 3));
  });

  // Mặt Dark phải TỐI HƠN cho ra không khí, nhưng 0.5 thì bài cũng chìm theo
  // và không đọc nổi mặt số. Nền tối đã do bgColor (#06030D) lo rồi, ánh sáng
  // chỉ cần hạ nhẹ.
  const dim = side === 'dark' ? 0.82 : 1;
  return (
    <>
      <ambientLight intensity={themeMeta(skin).table.ambient * dim} />
      <directionalLight
        position={[2, 6.5, 3.5]}
        intensity={0.75 * dim}
        castShadow={gfx.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <pointLight ref={point} position={[0, 2.4, 0]} intensity={side === 'dark' ? 13 : 5} distance={11} decay={2} />
    </>
  );
}

/** Particle lấp lánh giữa bàn — 1 Points (1 draw call), tắt hẳn ở mức Thấp. */
export function Sparkles({ count, color }: { count: number; color: string }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = mulberry32(0x5eed); // deterministic: giữ render thuần
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * TABLE_R * 0.85;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.06 + rnd() * 0.8;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);

  useFrame((st, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.05;
    const m = ref.current.material as THREE.PointsMaterial;
    m.opacity = 0.3 + Math.sin(st.clock.elapsedTime * 1.6) * 0.1;
  });

  if (!count) return null;
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color={color} size={0.04} transparent opacity={0.35} depthWrite={false} sizeAttenuation />
    </points>
  );
}

/**
 * Vòng mũi tên chỉ chiều đánh — MESH 3D NẰM PHẲNG TRÊN MẶT BÀN.
 *
 * VÌ SAO KHÔNG DÙNG <Html> NỮA: drei <Html> vẽ ra một lớp DOM NẰM TRÊN canvas
 * WebGL, nên mũi tên LUÔN đè lên bài bất kể xa gần — không có chiều sâu để so.
 * Hồi vòng còn rộng (r=2.32) thì nằm ngoài vùng bài nên không lộ; vừa thu vòng
 * lại và phóng to mũi tên là đè ngay lên quạt bài. Vẽ bằng mesh đặt ở y=0.02
 * thì depth test tự lo: bài luôn nổi cao hơn mặt bàn nên luôn che mũi tên.
 *
 * Bản mesh ĐẦU TIÊN (đã bỏ) từng bị méo ở chiều nghịch vì đảo chiều bằng
 * `scale.x = direction` — mirror làm hỏng cả winding lẫn hình. Ở đây đảo chiều
 * bằng cách CỘNG 180° vào góc yaw, không mirror gì cả, nên không thể méo.
 *
 * Toán: 8 mũi tên quanh bàn tại góc a=i·2π/8, vị trí (sin a, cos a)·r (cùng
 * công thức seatPos). Hình chevron dựng trong mặt phẳng XY hướng +Y; xoay
 * -90° quanh X để nằm xuống bàn thì +Y thành -Z. Yaw θ biến -Z thành
 * (-sin θ, -cos θ). Tiếp tuyến theo chiều a tăng dần là (cos a, -sin a), giải
 * ra θ = a - 90°. direction=-1 thì cộng thêm 180°.
 */
const RING_COUNT = 8;
/**
 * Bán kính vòng: phải nằm GIỮA đống bài ở tâm (deck x=-0.8, discard x=0.45 kèm
 * jitter ±0.24 -> bán kính tối đa ~0.9) và quạt bài của người chơi (r≈2.12).
 */
const RING_RADIUS = 1.72;
/** Một vòng quay đủ 360° mất bao lâu (giây) — chậm, chỉ để gợi ý chiều. */
const RING_SPIN_SECONDS = 26;

/** Chevron dẹt hướng +Y, to ngang ngửa bề ngang lá bài (CARD_W = 0.62). */
function chevronGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.28);
  shape.lineTo(0.26, -0.2);
  shape.lineTo(0, -0.04);
  shape.lineTo(-0.26, -0.2);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
const CHEVRON_GEO = chevronGeometry();

/**
 * Nhịp lật mũi tên khi có ai đánh lá đổi chiều. Tổng thời gian (một mũi tên lật
 * xong + độ trễ của mũi tên cuối) phải NẰM GỌN trong REVERSE_MS — đó là ngân
 * sách hàng đợi dành cho bước này, tràn ra là bước sau đè lên giữa chừng.
 */
const FLIP_DUR_S = 0.34;
const FLIP_STAGGER_S = REVERSE_MS / 1000 - FLIP_DUR_S;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function DirectionRing({ direction, active, color = '#FFE1AA' }: { direction: 1 | -1; active: boolean; color?: string }) {
  const points = useMemo(
    () =>
      Array.from({ length: RING_COUNT }, (_, i) => {
        const a = (i * Math.PI * 2) / RING_COUNT;
        return {
          pos: [Math.sin(a) * RING_RADIUS, 0.02, Math.cos(a) * RING_RADIUS] as [number, number, number],
          yaw: a - Math.PI / 2,
          phase: i / RING_COUNT,
        };
      }),
    [],
  );

  const ringRef = useRef<THREE.Group>(null);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const armRefs = useRef<(THREE.Group | null)[]>([]);

  /* ── LẬT MŨI TÊN KHI ĐỔI CHIỀU ────────────────────────────────────────────
   * Trước đây hướng mũi tên là một biểu thức thuần trong JSX
   * (`rotation-y={yaw + (direction === 1 ? 0 : π)}`), nên đổi chiều là cả vòng
   * NHẢY 180° trong đúng một khung hình: không ai kịp thấy chuyện gì vừa xảy ra,
   * chỉ thấy vòng mũi tên đột nhiên khác đi.
   *
   * Giờ giữ hướng trong ref và quay nó bằng tay ở useFrame, lệch pha theo chỉ số
   * mũi tên nên cú lật CHẠY VÒNG quanh bàn như đô-mi-nô — đọc được ngay là
   * "chiều chơi vừa đảo", và chạy trên chính vòng lặp có sẵn, không thêm state
   * nào để React phải render lại.
   */
  const flipFrom = useRef(direction);
  const flipAt = useRef(-1);
  const shown = useRef(direction);

  useFrame((st) => {
    const now = st.clock.elapsedTime;
    if (shown.current !== direction) {
      flipFrom.current = shown.current;
      shown.current = direction;
      flipAt.current = now;
    }

    const g = ringRef.current;
    if (g) g.rotation.y = ((now / RING_SPIN_SECONDS) * Math.PI * 2) * direction;

    const base = active ? 0.62 : 0.4;
    for (let i = 0; i < points.length; i++) {
      const m = matRefs.current[i];
      if (m) {
        const wave = 0.5 + 0.5 * Math.sin((now / 4.2 - points[i].phase) * Math.PI * 2);
        m.opacity = base * (0.45 + 0.55 * wave);
      }

      const arm = armRefs.current[i];
      if (!arm) continue;
      const from = flipFrom.current === 1 ? 0 : Math.PI;
      const to = direction === 1 ? 0 : Math.PI;
      // Mũi tên thứ i bắt đầu lật muộn hơn một chút -> cú lật chạy vòng quanh bàn.
      const t = flipAt.current < 0
        ? 1
        : clamp01((now - flipAt.current - points[i].phase * FLIP_STAGGER_S) / FLIP_DUR_S);
      arm.rotation.y = points[i].yaw + from + (to - from) * easeInOutCubic(t);
    }
  });

  return (
    <group ref={ringRef}>
      {points.map((p, i) => (
        <group key={i} position={p.pos} ref={(g) => { armRefs.current[i] = g; }}>
          <mesh rotation-x={-Math.PI / 2} geometry={CHEVRON_GEO} renderOrder={-1}>
            <meshBasicMaterial
              ref={(m) => { matRefs.current[i] = m; }}
              color={color}
              transparent
              opacity={0.5}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}


