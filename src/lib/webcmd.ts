// Second execution backend under the browser layer, alongside Firecrawl (browser.ts).
// Firecrawl is generic/unauthenticated; webcmd shells out to a local CLI that drives an
// authenticated browser profile for specific sites (LinkedIn, X) and returns clean JSON
// instead of an LLM parsing scraped markdown. Only works where gtm-os has local browser
// access (the desktop shell) — never available in a hosted/serverless deployment, so every
// call here degrades gracefully when the binary is missing.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WebcmdResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export function isWebcmdConfigured(): boolean {
  return process.env.WEBCMD_ENABLED === 'true';
}

async function runWebcmd(args: string[]): Promise<WebcmdResult> {
  if (!isWebcmdConfigured()) {
    return { success: false, error: 'webcmd not enabled — set WEBCMD_ENABLED=true (desktop shell only)' };
  }

  try {
    const { stdout } = await execFileAsync('webcmd', [...args, '-f', 'json'], { timeout: 30_000 });
    return { success: true, data: JSON.parse(stdout) };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { success: false, error: 'webcmd CLI not found on PATH' };
    }
    return { success: false, error: error?.stderr?.trim() || error?.message || 'webcmd call failed' };
  }
}

export async function webcmdLinkedinSearch(query: string): Promise<WebcmdResult> {
  return runWebcmd(['linkedin', 'search', query]);
}

export async function webcmdLinkedinPosts(profileOrCompany: string): Promise<WebcmdResult> {
  return runWebcmd(['linkedin', 'posts', profileOrCompany]);
}
