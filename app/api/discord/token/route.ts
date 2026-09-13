import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { code } = (await req.json()) as { code?: string };
    if (!code) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || '1459138901586219091';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientSecret) {
      return NextResponse.json(
        { error: 'DISCORD_CLIENT_SECRET is not configured on server' },
        { status: 400 },
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
