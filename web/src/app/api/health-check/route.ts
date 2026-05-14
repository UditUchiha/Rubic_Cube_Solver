import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const backendUrl = process.env.RENDER_API_URL;
  if (!backendUrl) {
    return NextResponse.json({ status: 'backend_not_configured' }, { status: 503 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s probe
    const res = await fetch(`${backendUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ status: 'ok', backend: data });
  } catch {
    // Intentionally swallow — this is just a fire-and-forget warm-up ping
    return NextResponse.json({ status: 'warming_up' }, { status: 200 });
  }
}
