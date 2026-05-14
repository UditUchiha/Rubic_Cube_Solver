import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // Vercel max; actual limit is the 120s internal solver timeout


export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body.cubeState !== 'string') {
    return NextResponse.json({ success: false, error: 'Missing cubeState' }, { status: 400 });
  }

  const { cubeState } = body;

  if (cubeState.length !== 54) {
    return NextResponse.json(
      { success: false, error: 'cubeState must be 54 characters' },
      { status: 400 }
    );
  }

  const backendUrl = process.env.RENDER_API_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { success: false, error: 'Solver backend not configured' },
      { status: 503 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const upstream = await fetch(`${backendUrl}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cubeState }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'Solver timed out (120s)' }, { status: 408 });
    }
    return NextResponse.json({ success: false, error: 'Cannot reach solver server' }, { status: 503 });
  }
}
