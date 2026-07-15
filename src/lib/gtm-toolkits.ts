// The GTM toolkit allowlist. gtm-os only ever connects/searches/executes these Composio
// toolkits — no general-purpose app access. Slugs match Composio toolkit slugs (lowercase).
export interface GtmToolkit {
  slug: string;
  name: string;
  category: 'crm' | 'email_calendar' | 'social' | 'enrichment' | 'comms' | 'docs';
}

export const GTM_TOOLKIT_ALLOWLIST: GtmToolkit[] = [
  { slug: 'salesforce', name: 'Salesforce', category: 'crm' },
  { slug: 'hubspot', name: 'HubSpot', category: 'crm' },
  { slug: 'pipedrive', name: 'Pipedrive', category: 'crm' },
  { slug: 'gmail', name: 'Gmail', category: 'email_calendar' },
  { slug: 'outlook', name: 'Outlook', category: 'email_calendar' },
  { slug: 'googlecalendar', name: 'Google Calendar', category: 'email_calendar' },
  { slug: 'linkedin', name: 'LinkedIn', category: 'social' },
  { slug: 'twitter', name: 'Twitter/X', category: 'social' },
  { slug: 'apollo', name: 'Apollo', category: 'enrichment' },
  { slug: 'clearbit', name: 'Clearbit', category: 'enrichment' },
  { slug: 'slack', name: 'Slack', category: 'comms' },
  { slug: 'googlesheets', name: 'Google Sheets', category: 'docs' },
  { slug: 'notion', name: 'Notion', category: 'docs' },
];

const ALLOWLIST_SLUGS = new Set(GTM_TOOLKIT_ALLOWLIST.map((t) => t.slug));

// A second, non-Composio auth family: sites driven by webcmd's local authenticated browser
// profile instead of OAuth (see src/lib/webcmd.ts). Coexists with the Composio entries above
// rather than replacing them — e.g. `linkedin` (Composio, OAuth, transactional) vs
// `webcmd:linkedin` (webcmd, browser-profile, read-heavy feed/search). An agent's `toolkits`
// array can list either or both.
export const WEBCMD_TOOLKIT_ALLOWLIST: GtmToolkit[] = [
  { slug: 'webcmd:linkedin', name: 'LinkedIn (webcmd)', category: 'social' },
];

const WEBCMD_ALLOWLIST_SLUGS = new Set(WEBCMD_TOOLKIT_ALLOWLIST.map((t) => t.slug));

export function isWebcmdToolkit(slug: string): boolean {
  return WEBCMD_ALLOWLIST_SLUGS.has(slug.toLowerCase());
}

// The webcmd site slug a given `webcmd:<site>:<command>` tool name belongs to, e.g.
// "webcmd:linkedin:search" -> "webcmd:linkedin".
export function webcmdSiteOf(toolName: string): string {
  const parts = toolName.split(':');
  return parts.slice(0, 2).join(':');
}

// Accepts a bare Composio toolkit slug ("gmail"), a Composio-shaped tool/action name
// ("GMAIL_SEND_EMAIL", "gmail_send_message"), a webcmd toolkit slug ("webcmd:linkedin"),
// or a webcmd tool name ("webcmd:linkedin:search") and checks it against both allowlists.
export function isGtmToolkit(slugOrToolName: string): boolean {
  if (!slugOrToolName) return false;
  const lower = slugOrToolName.toLowerCase();
  if (lower.startsWith('webcmd:')) return isWebcmdToolkit(webcmdSiteOf(lower));
  const first = lower.split('_')[0];
  return ALLOWLIST_SLUGS.has(lower) || ALLOWLIST_SLUGS.has(first);
}

export function getGtmToolkit(slug: string): GtmToolkit | undefined {
  return GTM_TOOLKIT_ALLOWLIST.find((t) => t.slug === slug.toLowerCase());
}
