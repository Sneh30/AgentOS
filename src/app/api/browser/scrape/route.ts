import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { browserScrape } from '@/lib/browser';
import { isValidUrl } from '@/lib/tools-enhanced';

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await request.json();
    if (!url?.trim() || !isValidUrl(url)) {
      return NextResponse.json({ error: 'A valid, non-private url is required' }, { status: 400 });
    }

    const result = await browserScrape(url);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Browser scrape error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Browser scrape failed' },
      { status: 500 }
    );
  }
}
