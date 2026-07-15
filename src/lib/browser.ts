// The browser layer — Firecrawl promoted to a first-class agent capability (not just
// knowledge ingest). browser_search/browser_scrape are registered as built-in tools in
// tools-enhanced.ts so they participate in the same CapabilityPolicy + replanning loop
// as every other tool.
import { scrapeUrl } from './firecrawl';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2';
const FIRECRAWL_API_KEY = process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY;

export interface BrowserSearchResult {
  success: boolean;
  results?: { title: string; url: string; description?: string }[];
  error?: string;
}

export async function browserSearch(query: string, limit = 5): Promise<BrowserSearchResult> {
  if (!FIRECRAWL_API_KEY) {
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { success: false, error: error.error || 'Firecrawl search error' };
    }

    const data = await response.json();
    const items = data.data?.web || data.web || data.data || [];
    return {
      success: true,
      results: items.map((r: any) => ({
        title: r.title || r.metadata?.title || r.url,
        url: r.url,
        description: r.description || r.markdown?.slice(0, 200),
      })),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface BrowserScrapeResult {
  success: boolean;
  markdown?: string;
  title?: string;
  error?: string;
}

export async function browserScrape(url: string): Promise<BrowserScrapeResult> {
  const result = await scrapeUrl(url);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || 'Failed to scrape URL' };
  }
  const title = Array.isArray(result.data.metadata?.title)
    ? result.data.metadata!.title[0]
    : result.data.metadata?.title;
  return { success: true, markdown: result.data.markdown, title };
}
