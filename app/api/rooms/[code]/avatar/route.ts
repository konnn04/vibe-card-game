import type { NextRequest } from 'next/server';
import { loadRoom, verify } from '@/src/server/room';
import { dbDel, dbSet } from '@/src/server/firebaseStore';
import { fail, json, readBody, type Identity } from '@/src/server/http';

/**
 * ẢNH ĐẠI DIỆN TỰ TẢI LÊN — bản TẠM, dùng chung trong đúng một phòng.
 *
 * Ảnh gốc nằm trong IndexedDB của máy người chơi, nên người khác không thể thấy.
 * Muốn cả bàn nhìn thấy nhau thì buộc phải có một bản nằm ở chỗ cả bàn đọc được.
 *
 * ĐỂ RIÊNG MỘT NHÁNH, KHÔNG nhét vào bản ghi phòng: `broadcast()` ghi lại toàn
 * bộ `publicRoom(room)` sau MỖI nước đi, nên avatar nằm trong đó sẽ được gửi
 * lại hàng chục lần mỗi ván dù chẳng bao giờ đổi. Ở nhánh riêng thì client
 * subscribe đúng một lần.
 *
 * Vòng đời: ghi lúc vào phòng, xoá lúc rời phòng, và vì nằm dưới
 * `rush/rooms/{code}/` nên vòng sweep xoá phòng (dbDel cả cây con) dọn nốt
 * trường hợp đóng tab thẳng.
 */
const PREFIX = 'data:image/webp;base64,';
/**
 * Trần dung lượng. Ảnh 128px WebP chỉ tầm 2–4KB; 32KB là rộng rãi mà vẫn chặn
 * được việc ai đó nhét một file vài MB vào rồi cả phòng phải tải.
 */
const MAX_CHARS = 32 * 1024;

export async function POST(req: NextRequest, ctx: RouteContext<'/api/rooms/[code]/avatar'>) {
  const { code } = await ctx.params;
  const body = await readBody<Identity & { image?: string | null }>(req);
  const { playerId = '', token = '', image } = body;
  const upper = code.toUpperCase();

  try {
    const room = await loadRoom(upper);
    if (!room) throw new Error('room-not-found');
    // Chỉ ghi được avatar CỦA CHÍNH MÌNH: khoá theo playerId đã xác thực, không
    // nhận id từ body, nên không ai đổi được mặt người khác.
    if (!verify(room, playerId, token)) throw new Error('unauthorized');

    const path = `rush/rooms/${upper}/avatars/${playerId}`;
    if (!image) {
      await dbDel(path);
      return json({ ok: true });
    }
    if (typeof image !== 'string' || !image.startsWith(PREFIX)) throw new Error('bad-image');
    if (image.length > MAX_CHARS) throw new Error('image-too-large');
    await dbSet(path, image);
    return json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'avatar-failed');
  }
}
