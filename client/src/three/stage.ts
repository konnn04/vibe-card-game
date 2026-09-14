import * as THREE from 'three';

/**
 * Stage = registry vị trí đích của từng lá bài + 1 vòng tween duy nhất.
 *
 * Vì sao không dùng spring của React cho từng lá:
 * 28 lá bay lúc chia bài => 28 component tự set state mỗi frame = 28 re-render/frame.
 * Ở đây mesh được điều khiển imperative qua ref trong 1 `useFrame`, React chỉ
 * re-render khi TẬP lá thay đổi (mount/unmount), không phải khi lá di chuyển.
 */
export interface FlightOpts {
  /** trễ trước khi bay (stagger chia bài) */
  delay?: number;
  /** độ cao cung parabol; 0 = trượt thẳng */
  arc?: number;
  /** thời gian bay (s) */
  dur?: number;
  /** lá vừa mount mà đã thuộc deck/discard -> đặt thẳng vào chỗ, không bay */
  snapIfFresh?: boolean;
}

interface Entry {
  obj: THREE.Object3D;
  tp: THREE.Vector3;
  tq: THREE.Quaternion;
  ts: number;
  delay: number;
  flight: { t: number; dur: number; from: THREE.Vector3; fromQ: THREE.Quaternion; fromS: number; arc: number } | null;
  fresh: boolean;
  /** Giây còn lại của cú RUNG báo "lá này không đánh được". */
  shake: number;
  /**
   * Đã có đích thật chưa. Lá vừa mount nằm tạm ở DECK_POS và lá đang chờ hết
   * `delay` đều BỊ ẨN cho tới khi thực sự bắt đầu bay — nếu không, người chơi
   * thấy lá "khựt đứng trong bộ bài một lúc rồi mới đánh ra".
   */
  armed: boolean;
}

const entries = new Map<string, Entry>();
const _v = new THREE.Vector3();

export function register(id: string, obj: THREE.Object3D) {
  const prev = entries.get(id);
  entries.set(id, {
    obj,
    tp: prev?.tp.clone() ?? obj.position.clone(),
    tq: prev?.tq.clone() ?? obj.quaternion.clone(),
    ts: prev?.ts ?? 1,
    delay: 0,
    flight: null,
    fresh: true,
    shake: 0,
    armed: prev?.armed ?? false,
  });
  if (!prev?.armed) obj.visible = false;
}

export function unregister(id: string) {
  entries.delete(id);
}

/**
 * VÁN MỚI -> DỰNG LẠI SÂN KHẤU NHƯ LÚC VỪA VÀO BÀN.
 *
 * Ván đầu tiên chia bài có animation vì mọi lá vừa mount: `fresh` + chưa
 * `armed`, nên chúng bị GIẤU rồi bay ra từ bộ bài theo nhịp lệch pha. Ván sau
 * (rematch / NEXT_ROUND) thì không: engine đánh số lá lại từ `c0` nên React
 * dùng lại đúng những mesh cũ, `entries` giữ nguyên `armed = true` và vị trí
 * của ván trước — lá nào tình cờ trùng đích thì setTarget thoát sớm ở nhánh
 * "không di chuyển", lá nào lệch thì hiện luôn rồi trượt sang chỗ mới. Kết quả
 * là ván sau bài cứ thế xuất hiện, mất hẳn màn chia bài.
 *
 * Ở đây kéo tất cả về bộ bài và bỏ cờ `armed`, để cùng một đoạn mã chia bài
 * chạy giống hệt nhau ở mọi ván.
 */
export function resetForNewRound(origin: THREE.Vector3) {
  for (const e of entries.values()) {
    e.obj.position.copy(origin);
    e.obj.visible = false;
    e.tp.copy(origin);
    e.flight = null;
    e.delay = 0;
    e.shake = 0;
    e.fresh = true;
    e.armed = false;
  }
}

/** Đặt vị trí tức thì (spawn lá mới ở deck, không bay từ gốc toạ độ). */
export function snap(id: string, p: THREE.Vector3, q: THREE.Quaternion, s = 1) {
  const e = entries.get(id);
  if (!e) return;
  e.obj.position.copy(p);
  e.obj.quaternion.copy(q);
  e.obj.scale.setScalar(s);
  e.tp.copy(p);
  e.tq.copy(q);
  e.ts = s;
  e.flight = null;
  e.fresh = false;
  e.armed = true;
  e.obj.visible = true;
}

/**
 * Đặt điểm XUẤT PHÁT cho lá vừa xuất hiện trên đống discard (bay từ tay người
 * đánh ra) — CHỈ áp dụng cho lá `fresh`, tức lá chưa từng được stage đặt vị trí.
 *
 * BUG CŨ (lỗi "Luna đánh lá 6 mà bài treo ở tụ bài của Luna, tới lượt mình
 * đánh nó mới bay ra"): điều kiện còn có thêm một phép ĐOÁN THEO TOẠ ĐỘ
 *     e.obj.position.x < -0.4 && Math.abs(e.obj.position.z) < 0.3
 * nhằm hỏi "lá này còn nằm ở chồng bài rút không?" (DECK_POS.x = -0.8). Nhưng
 * GHẾ BÊN TRÁI nằm đúng ở x ≈ -2.12, z ≈ 0 nên các lá giữa quạt bài của người
 * ngồi trái LỌT VÀO ĐÚNG vùng đó (ghế phải x = +2.12 thì không -> chỉ người
 * bên trái dính lỗi, đúng như quan sát).
 *
 * Hậu quả: effect trong Cards.tsx chạy lại ở MỌI lần re-render (rê chuột chọn
 * bài, đồng hồ, fx...), mỗi lần lại kéo lá ĐANG BAY về tay người trái và xoá
 * `e.flight`. Ngay sau đó setTarget thấy `e.tp` đã bằng đích từ lượt trước nên
 * `jump=false`, `moved=false` -> return, KHÔNG tạo chuyến bay mới. Lá bị ghim
 * tại tay người đánh cho tới khi ngừng re-render.
 *
 * Không cần đoán toạ độ nữa: `fresh` đã trả lời chính xác câu hỏi đó rồi.
 */
export function setSpawnOrigin(id: string, pos: THREE.Vector3, rotEuler?: THREE.Euler) {
  const e = entries.get(id);
  if (!e || !e.fresh) return;
  e.obj.position.copy(pos);
  if (rotEuler) e.obj.rotation.copy(rotEuler);
  e.fresh = false;
  e.flight = null;
}

export function setTarget(id: string, p: THREE.Vector3, q: THREE.Quaternion, s = 1, opts: FlightOpts = {}) {
  const e = entries.get(id);
  if (!e) return;
  if (e.fresh && opts.snapIfFresh) {
    snap(id, p, q, s);
    return;
  }

  // Đích có NHẢY HẲN sang vùng khác không (>0.8 đơn vị: từ tay ra đống discard,
  // đổi tay bài luật 0/7, bị rút về tay...)? Phải tính TRƯỚC khi ghi đè e.tp.
  const jump = e.tp.distanceToSquared(p) > 0.64;

  // Nếu lá đang xếp hàng chờ delay (chia bài / rút phạt dồn):
  // Cập nhật đích mới nhưng GIỮ NGUYÊN delay, không được xoá delay làm lá bài snap tức thì.
  if (e.delay > 0) {
    e.tp.copy(p);
    e.tq.copy(q);
    e.ts = s;
    if (opts.delay !== undefined && opts.delay > 0) {
      e.delay = opts.delay;
    }
    return;
  }

  // Đang bay dở mà đích chỉ NHÍCH NHẸ (xếp lại quạt bài):
  // chỉ cập nhật toạ độ đích, KHÔNG reset chuyến bay -> không "khựt khựt".
  if (e.flight && !jump) {
    e.tp.copy(p);
    e.tq.copy(q);
    e.ts = s;
    return;
  }

  // Đích nhảy hẳn -> huỷ delay/chuyến bay cũ, bay lại NGAY từ vị trí hiện tại.
  // LỖI CŨ: luôn return sớm khi đang bận, nên lá vừa đánh phải đợi hết chuyến
  // bay/delay trước đó mới nhúc nhích => "bài bay trễ cả lượt".
  // LƯỚI AN TOÀN: lá đang đứng XA đích mà không có chuyến bay lẫn delay nào ->
  // nó đã bị "bỏ rơi" (chuyến bay bị ai đó xoá giữa chừng, đích thì giữ nguyên
  // nên `jump`/`moved` đều false và hàm này sẽ return sớm, lá nằm chết tại chỗ).
  // Bắt lại và cho bay tiếp. Không sợ kích hoạt nhầm lúc chạy bình thường: lá
  // không bay chỉ được lerp những quãng ngắn (<0.35) nên không bao giờ cách
  // đích quá 0.8 đơn vị.
  const stranded = !e.flight && e.delay <= 0 && e.obj.position.distanceToSquared(p) > 0.64;

  if (jump || stranded) {
    e.delay = 0;
    e.flight = null;
  } else {
    const moved = e.tp.distanceToSquared(p) > 1e-6 || Math.abs(e.ts - s) > 1e-3 || e.tq.angleTo(q) > 1e-3;
    // "Đứng yên tại chỗ" = lá đã ở đúng nơi nó thuộc về -> phải HIỆN. Không có
    // dòng này, một lá đi qua setSpawnOrigin (fresh=false nhưng chưa armed) rồi
    // gặp đích trùng vị trí hiện tại sẽ thoát sớm và ẩn vĩnh viễn.
    if (!moved && !e.fresh) { e.armed = true; return; }
  }

  e.armed = true;
  const dist = e.obj.position.distanceTo(p);
  e.tp.copy(p);
  e.tq.copy(q);
  e.ts = s;
  e.delay = opts.delay ?? 0;
  e.fresh = false;

  // quãng đường xa => bay theo cung parabol; gần => chỉ smooth (sắp xếp lại quạt bài)
  if (dist > 0.35) {
    e.flight = {
      t: 0,
      dur: opts.dur ?? Math.min(0.55, 0.22 + dist * 0.08),
      from: e.obj.position.clone(),
      fromQ: e.obj.quaternion.clone(),
      fromS: e.obj.scale.x,
      arc: opts.arc ?? Math.min(1.0, dist * 0.22),
    };
  }
}

/**
 * Rung lá bài tại chỗ — phản hồi cho cú bấm KHÔNG hợp lệ.
 *
 * Vì sao cần: đo thực tế cho thấy bấm -> commit -> bài bay chỉ mất 2ms, KHÔNG
 * hề trễ. Cái người chơi tưởng là "bài kẹt một lúc mới ra" thực ra là bấm phải
 * lá không đánh được: engine lặng lẽ từ chối, màn hình không nhúc nhích, nên
 * phải bấm lá khác mới thấy ra bài. Rung + âm thanh trả lời ngay "lá này không
 * được", hết hiểu nhầm.
 */
export function shake(id: string) {
  const e = entries.get(id);
  if (e) e.shake = 0.32;
}

/**
 * Còn bao nhiêu lá ĐANG bay hoặc đang chờ tới lượt bay.
 *
 * Đây là "callback báo animation xong" mà hàng đợi nhịp (match.ts) cần: thay vì
 * tính nhẩm "28 lá × 55ms + thời gian bay" rồi chờ đủ chừng đó, nó chỉ việc hỏi
 * sân khấu "xong chưa?". Ngân sách tính sẵn chỉ còn là TRẦN an toàn phòng khi
 * có lá không bao giờ đáp.
 */
export function busyCount(): number {
  let n = 0;
  for (const e of entries.values()) if (e.flight || e.delay > 0) n++;
  return n;
}

export function has(id: string) {
  return entries.has(id);
}

const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/**
 * @param dt delta giây
 * @param smoothing tốc độ đuổi theo target khi không bay (mức đồ họa Thấp = số lớn hơn => tới đích nhanh, ít frame động)
 * @param linear ở mức Thấp: bỏ cung parabol, easing tuyến tính, thời gian ngắn
 */
export function tick(dt: number, smoothing: number, linear: boolean) {
  const k = 1 - Math.exp(-smoothing * dt);
  for (const e of entries.values()) {
    // Chưa có đích, hoặc đang xếp hàng chờ tới lượt bay -> GIẤU HẲN. Lá chỉ
    // xuất hiện đúng lúc nó bắt đầu bay, không bao giờ nằm chình ình ở chồng
    // bài rút rồi mới nhúc nhích.
    if (!e.armed || e.delay > 0) {
      if (e.delay > 0) e.delay -= dt;
      e.obj.visible = false;
      continue;
    }
    e.obj.visible = true;
    if (e.flight) {
      const f = e.flight;
      f.t += dt;
      const u = Math.min(1, f.t / (linear ? f.dur * 0.6 : f.dur));
      const w = linear ? u : easeInOutCubic(u);
      e.obj.position.lerpVectors(f.from, e.tp, w);
      if (!linear) e.obj.position.y += Math.sin(Math.PI * u) * f.arc;
      e.obj.quaternion.copy(f.fromQ).slerp(e.tq, w);
      e.obj.scale.setScalar(f.fromS + (e.ts - f.fromS) * w);
      if (u >= 1) e.flight = null;
      continue;
    }
    e.obj.position.lerp(e.tp, k);
    e.obj.quaternion.slerp(e.tq, k);
    if (e.shake > 0) {
      e.shake = Math.max(0, e.shake - dt);
      // 3 nhịp lắc ngang, biên độ tắt dần theo thời gian còn lại
      e.obj.position.x += Math.sin(e.shake * Math.PI * 18) * e.shake * 0.22;
    }
    const s = e.obj.scale.x;
    e.obj.scale.setScalar(s + (e.ts - s) * k);
  }
}

/** Lá đang bay? Dùng để hoãn phát SFX/HUD tới khi bài đáp xuống. */
export function isFlying(id: string) {
  const e = entries.get(id);
  return !!e && (!!e.flight || e.delay > 0);
}

export function worldPosition(id: string, out: THREE.Vector3) {
  const e = entries.get(id);
  if (!e) return out.set(0, 0, 0);
  return out.copy(e.obj.position);
}

export function clearStage() {
  entries.clear();
}

export const tmp = { v: _v };
