function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (typeof window !== 'undefined') return '';
    console.warn(`Missing environment variable: ${name}`);
    return '';
  }
  return value;
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
  clerkSecretKey: process.env.CLERK_SECRET_KEY || '',

  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModel: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',

  googleApiKey: process.env.GOOGLE_API_KEY || '',
  googleModel: process.env.GOOGLE_MODEL || 'gemini-flash-latest',
  googleApiUrl: process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/',

  ollamaApiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:cloud',

  composioApiKey: process.env.COMPOSIO_API_KEY || '',
  composioBaseUrl: process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev',
  composioProjectName: process.env.COMPOSIO_PROJECT_NAME || 'anymind-main',

  hydraDbApiKey: process.env.HYDRA_DB_API_KEY || '',
  hydraDbDatabase: process.env.HYDRA_DB_DATABASE || 'anymind',
  hydraDbCollection: process.env.HYDRA_DB_COLLECTION || 'anymind',

  firecrawlApiKey: process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY || '',

  githubToken: process.env.GITHUB_TOKEN || '',
} as const;

export function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function hasLlmConfig(): boolean {
  return !!(env.openrouterApiKey || env.googleApiKey);
}

export function hasComposioConfig(): boolean {
  return !!env.composioApiKey;
}

export function hasFirecrawlConfig(): boolean {
  return !!env.firecrawlApiKey;
}
