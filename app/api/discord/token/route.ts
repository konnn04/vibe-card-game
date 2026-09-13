import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { code } = (await req.json()) as { code?: string };
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    /*
     * KHÔNG đoán client id mặc định.
     *
     * Trước đây chỗ này và src/lib/discord.ts mỗi nơi đoán một app id KHÁC
     * NHAU. Bình thường không lộ vì biến env có thật; nhưng chỉ cần quên truyền
     * NEXT_PUBLIC_* lúc build (biến công khai được nhúng vào gói lúc build, khai
     * lúc chạy là muộn) thì client xin code với app A còn server đổi code với
     * app B — OAuth hỏng kèm một thông báo chẳng liên quan gì tới nguyên nhân.
     * Thiếu cấu hình thì phải BÁO THẲNG, đừng đoán.
     */
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_DISCORD_CLIENT_ID is not configured (must be set at BUILD time)' },
        { status: 500 },
      );
    }
    if (!clientSecret) {
      return NextResponse.json(
        { error: 'DISCORD_CLIENT_SECRET is not configured on server' },
        { status: 500 },
      );
    }

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error_description || data.error || 'Token exchange failed' },
        { status: response.status },
      );
    }

    return NextResponse.json({ access_token: data.access_token });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
