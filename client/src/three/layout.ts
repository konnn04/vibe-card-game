import * as THREE from 'three';

export const CARD_W = 0.62;
export const CARD_H = 0.92;
export const TABLE_R = 2.75;

export const DECK_POS = new THREE.Vector3(-0.8, 0.05, 0.05);
export const DISCARD_POS = new THREE.Vector3(0.45, 0.05, 0.05);

export type Zone = 'deck' | 'hand' | 'discard';

/** Ghế j (0 = mình) nằm quanh bàn: j=0 dưới (gần camera), tăng theo chiều kim đồng hồ. */
export function seatAngle(j: number, n: number): number {
  return (j * Math.PI * 2) / Math.max(n, 1);
}

export function seatPos(j: number, n: number, radius = 2.45): THREE.Vector3 {
  const a = seatAngle(j, n);
  return new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius);
}

/** Chuyển index người chơi trong engine -> index ghế hiển thị (mình luôn ở dưới). */
export function seatIndex(playerIdx: number, myIdx: number, n: number): number {
  return ((playerIdx - myIdx) % n + n) % n;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

export interface Transform { p: THREE.Vector3; q: THREE.Quaternion; s: number }

/** Góc nghiêng (rad, tính từ mặt phẳng nằm ngang) của bài trong tay — dùng chung
 *  cho fanTransform VÀ để tính baseY an toàn (không cho mép lá chìm dưới mặt bàn). */
const SELF_TILT = 1.05;
const OPP_TILT = 0.22;

/**
 * baseY tối thiểu để mép THẤP của 1 lá nghiêng góc `tilt` không chìm dưới mặt
 * bàn (y=0). Lá là PlaneGeometry cao CARD_H, tâm tại baseY; khi xoay quanh
 * trục X một góc pitch = ±(π/2 - tilt) so với nằm phẳng, mép cách tâm theo Y
 * một khoảng (CARD_H/2)*cos(pitch)... nhưng viết trực tiếp theo tilt cho gọn:
 * độ lệch Y của mép so với tâm = (CARD_H/2) * cos(π/2 - tilt) = (CARD_H/2)*sin(tilt).
 * Tính bằng công thức (không hardcode số) để tilt/CARD_H đổi thì baseY tự đúng theo,
 * tránh lặp lại đúng bug cũ (baseY không được cập nhật khi tilt/CARD_H đổi).
 */
function safeBaseY(tilt: number, margin: number): number {
  return (CARD_H / 2) * Math.sin(tilt) + margin;
}

export interface FanOpts {
  self: boolean;
  faceUp: boolean;
  customProgress?: number;
  layerOrder?: number;
  /** progress (CHƯA nhân spread) của lá đang được hover trong CÙNG bàn tay —
   *  dùng để các lá lân cận dạt ra 2 bên nhường chỗ. */
  hoverProgress?: number;
  /** true nếu CHÍNH lá này đang hover -> nhấc theo trục Y thế giới + phóng to + đẩy nhẹ ra trước. */
  isHovered?: boolean;
}

/**
 * Vị trí 1 lá trong quạt bài (fan).
 * Quạt = cung tròn: mỗi lá lệch góc tăng dần quanh trục Y, lá ngoài lùi về tâm bàn
 * một chút -> nhìn như cầm bài thật. Toàn bộ tính bằng công thức, không hardcode.
 */
export function fanTransform(
  seatJ: number,
  seatCount: number,
  i: number,
  count: number,
  opts: FanOpts,
): Transform {
  const a = seatAngle(seatJ, seatCount);
  const self = opts.self;

  /**
   * BÁN KÍNH CUNG QUẠT.
   *
   * Quạt của MÌNH nới từ 2.85 lên 4.2. Bề ngang quạt = sin(t)·R·2, nên muốn
   * rộng ra thì có hai đường: tăng góc t, hoặc tăng R. Tăng góc là đường sai —
   * sin() bẹt dần khi t lớn, nên hai đầu quạt bị dồn cục lại còn giữa thì thưa,
   * càng nhiều bài càng lệch. Tăng R thì khoảng cách giữa các lá giãn ĐỀU.
   *
   * Đổi lại, mọi số đo tính bằng GÓC ở dưới (perCard, maxSpread, lực dạt khi
   * hover) đều phải chia lại theo tỉ lệ R — nếu không thì tay 7 lá cũng bị xoè
   * toác ra như tay 30 lá.
   */
  const R = self ? 4.2 : 1.6;
  // Quạt bài ĐỐI PHƯƠNG phải xoè đủ rộng để ĐỌC ĐƯỢC TỪNG LÁ, không chỉ để
  // đếm số lá. Ở bộ Ú Nô Flip, mặt úp của bài đối thủ CHÍNH LÀ mặt thật còn
  // lại của lá đó — cả điểm hay của luật Flip nằm ở chỗ nhìn bài úp của đối
  // thủ để lên chiến thuật; xoè chật thì thông tin đó coi như mất.
  //
  // Cách chọn số (t là GÓC, khoảng cách thật trên bàn = sin(t)*R, R=1.6):
  //   cũ 0.06 rad -> 0.06*1.6 ≈ 0.096 đơn vị/lá, mà lá rộng CARD_W=0.62
  //   -> chỉ hé 15% bề ngang, số ở góc lá bị lá kế bên đè mất.
  //   nay 0.11 rad -> ≈ 0.176 đơn vị/lá ≈ 28% bề ngang, vừa đủ hở góc chỉ số.
  // Lá i lớn hơn nằm ĐÈ LÊN (layerIndex = i trong Cards.tsx) nên phần hở là
  // MÉP TRÁI của mỗi lá — đúng chỗ in chỉ số góc trên-trái.
  // maxSpread 1.0 rad: tối đa 10 lá hiển thị -> bề ngang quạt ≈ 2.3 đơn vị,
  // hai ghế cạnh nhau cách sqrt(2)*2.12 ≈ 3.0 nên vẫn không chạm nhau.
  // Độ xòe quạt (spread):
  // Quạt bài của mình (self) co dãn theo số lá bài thật sự trong tay:
  // - Ít bài (2-5 lá): độ dài tối thiểu vừa vặn ở giữa (~1.2 - 1.4 đơn vị).
  // - Nhiều bài: dãn dần theo số lá, chạm trần tối đa (~3.9 đơn vị) để các lá luôn xếp sát nhau, không bao giờ hở khoảng trắng.
  let spread = 0;
  if (count > 1) {
    if (self) {
      const targetWidth = Math.min(3.9, Math.max(1.2, 0.45 + count * 0.16));
      spread = targetWidth / R;
    } else {
      const perCard = 0.11;
      const minSpread = 0.35;
      const maxSpread = 1.0;
      spread = Math.min(maxSpread, Math.max(minSpread, perCard * (count - 1)));
    }
  }

  // Cho phép tuỳ biến tiến độ progress t từ bộ điều khiển Accordion gom cụm màu
  const progress = opts.customProgress !== undefined
    ? opts.customProgress
    : (count <= 1 ? 0 : (i / (count - 1)) - 0.5);

  let t = progress * spread;

  // Dạt 2 bên khi có 1 lá khác trong tay đang hover — nhẹ nhàng nhường chỗ,
  // không dạt quá mạnh làm rách quạt bài tạo khoảng trống
  if (self && !opts.isHovered && opts.hoverProgress !== undefined) {
    const tHover = opts.hoverProgress * spread;
    const d = t - tHover;
    const dist = Math.abs(d);
    const REPEL_RADIUS = count > 10 ? 0.18 : 0.25;
    const REPEL_MAX = count > 10 ? 0.016 : 0.035;
    if (dist < REPEL_RADIUS) {
      const falloff = 1 - dist / REPEL_RADIUS;
      const dir = d !== 0 ? Math.sign(d) : (progress >= opts.hoverProgress ? 1 : -1);
      t += dir * falloff * falloff * REPEL_MAX;
    }
  }

  // Toạ độ theo cung quạt: lx theo phương ngang; người chơi không dùng cos(t)-1 để tránh bài giữa nhô lên vòm
  const lx = Math.sin(t) * R;
  const lz = self ? 0 : (Math.cos(t) - 1) * R * 0.25;
  // Quạt bài CỦA MÌNH đẩy ra xa tâm hơn -> nằm THẤP hơn trên màn hình, chừa
  // khoảng trống phía trên cho thanh nút hành động (kể cả khi lá đang hover
  // nhô lên cũng không chạm tới nút).
  const dist = self ? 2.78 : 2.12;

  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const px = sin * dist;
  const pz = cos * dist;
  // xoay offset fan theo hướng ghế
  const ox = lx * cos + lz * sin;
  const oz = -lx * sin + lz * cos;

  // Cung xòe quạt: góc nghiêng pitch, yaw và roll nhẹ nhàng quanh trục Z để các lá bài xòe đều không đâm xuyên
  const tilt = self ? SELF_TILT : OPP_TILT;
  const pitch = opts.faceUp ? -Math.PI / 2 + tilt : Math.PI / 2 - tilt;
  const yaw = a - t * 0.12;
  const roll = self ? -t * 0.14 : 0; // lá trái hơi nghiêng trái, lá phải hơi nghiêng phải
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);

  // YÊU CẦU: Z-index tăng dần đều từ trái qua phải (lá phải đè lên lá trái, layerRank tăng đơn điệu theo i)
  const layerRank = opts.layerOrder !== undefined ? opts.layerOrder : i;
  const baseY = self ? safeBaseY(SELF_TILT, 0.18) : safeBaseY(OPP_TILT, 0.05);
  /**
   * Mỗi lá nhích lên/ra trước một nấc so với lá trước để thứ tự đè luôn rõ.
   * Nấc thì cố định mà SỐ LÁ thì không: 40 lá × 0.015 = 0.6 đơn vị, cả nửa
   * quạt bên phải bị kéo vọt lên và trồi hẳn về phía camera — quạt méo thành
   * hình cầu thang. Giới hạn TỔNG độ chênh thay vì giới hạn từng nấc: tay ít
   * bài giữ nguyên cảm giác cũ, tay nhiều bài tự bẹt lại cho phẳng.
   */
  const rungs = Math.max(1, count - 1);
  const depthZ = self ? layerRank * Math.min(0.015, 0.30 / rungs) : 0;
  const elevationY = layerRank * Math.min(0.010, 0.20 / rungs);
  // Bài nhiều thì thu nhỏ thêm chút nữa: quạt đã rộng hết cỡ, phần hở của mỗi
  // lá chỉ còn cách này để nới ra. Sàn 0.74 là mức vẫn đọc được chỉ số.
  const scale = self ? Math.max(0.74, 0.96 - Math.max(0, count - 10) * 0.012) : 0.58;

  // Lá đang hover: CHỈ nhấc theo trục Y thế giới — KHÔNG động vào Z, KHÔNG
  // phóng to (phóng to khiến lá đè rộng hơn lên lá lân cận, nhìn như bị tăng
  // z-index/thứ tự đè — người dùng yêu cầu bỏ). Chỉ còn viền phát sáng
  // (CardMesh) làm chỉ báo lá đang hover/có thể đánh.
  // Giảm từ 0.34 -> 0.2: nhấc quá cao dịch chuyển lá ra khỏi vị trí màn hình
  // dưới con trỏ chuột, khiến pointerOut tự kích hoạt ngay khi vừa hover xong
  // rồi lá rơi xuống lại kích hoạt hover lại — chớp liên tục ("mất luôn" khi
  // hover, đúng lỗi báo, nhất là lá ở biên quạt). Kết hợp với debounce tắt
  // hover ở Cards.tsx để hết hẳn hiện tượng chớp.
  const hoverLift = opts.isHovered ? 0.2 : 0;

  return {
    p: new THREE.Vector3(
      px + ox,
      baseY + elevationY + hoverLift,
      pz + oz + depthZ,
    ),
    q: _q.clone(),
    s: scale,
  };
}

/** Bài trong chồng deck: úp, chồng cao dần, lệch góc nhẹ deterministic. */
export function deckTransform(k: number): Transform {
  _e.set(Math.PI / 2, ((k * 37) % 11) * 0.004, 0, 'YXZ');
  return { p: new THREE.Vector3(DECK_POS.x, 0.03 + k * 0.008, DECK_POS.z), q: _q.setFromEuler(_e).clone(), s: 1 };
}

/**
 * Đống bài đã đánh: lệch góc + offset ngẫu nhiên nhưng DETERMINISTIC theo pileIndex.
 *
 * `height` tăng dần theo thứ tự đánh (lá mới nhất luôn có height cao nhất — xem
 * Cards.tsx). Camera nhìn CHÉO GÓC từ trên xuống (không phải top-down), nên độ
 * "gần camera" phụ thuộc CẢ y (cao hơn) LẪN z (offset ngẫu nhiên XZ_JITTER).
 * Bug cũ: r()*0.14 (mỗi trục lệch tối đa ±0.07, 2 lá độc lập nên chênh nhau
 * tới 0.14) lớn hơn NHIỀU bước Y mỗi lớp (0.012) — 2 lá cạnh nhau dễ bị đảo
 * z-order do jitter thắng, khiến lá mới nhất trông như nằm SAU lá cũ. Sửa bằng
 * cách đảm bảo DISCARD_Y_STEP luôn lớn hơn hẳn mức chênh XZ tối đa có thể có
 * giữa 2 lá bất kỳ (= chính DISCARD_XZ_JITTER, vì mỗi trục random trong
 * [-JITTER/2, JITTER/2], 2 lá độc lập nên chênh tối đa đúng bằng JITTER).
 */
// Trục X gần như VUÔNG GÓC hướng nhìn camera (camera nhìn chéo góc từ trên,
// hướng nhìn nghiêng về -Z/-Y) -> lệch X hầu như không ảnh hưởng thứ tự chiều
// sâu, có thể để rất rộng cho chồng bài trông tự nhiên/tản ra thay vì như xếp
// thẳng 1 cột dọc. Trục Z gần trùng hướng nhìn nên PHẢI giữ nhỏ hơn hẳn
// DISCARD_Y_STEP (xem discardTransform cũ: lệch Z quá lớn từng làm lá mới nhất
// trông như nằm SAU lá cũ do đảo chiều sâu).
const DISCARD_X_JITTER = 0.24;
const DISCARD_Z_JITTER = 0.05;
const DISCARD_Y_STEP = 0.07; // > DISCARD_Z_JITTER -> đảm bảo thứ tự lớp không bao giờ bị lệch

export function discardTransform(pileIndex: number, height: number): Transform {
  const r = (n: number) => {
    const x = Math.sin(pileIndex * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x) - 0.5;
  };
  _e.set(-Math.PI / 2, r(1) * 0.9, 0, 'YXZ');
  return {
    p: new THREE.Vector3(
      DISCARD_POS.x + r(2) * DISCARD_X_JITTER,
      0.035 + height * DISCARD_Y_STEP,
      DISCARD_POS.z + r(3) * DISCARD_Z_JITTER,
    ),
    q: _q.setFromEuler(_e).clone(),
    s: 1,
  };
}
