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

// Accepts either a bare toolkit slug ("gmail") or a Composio-shaped tool/action
// name ("GMAIL_SEND_EMAIL", "gmail_send_message") and checks its toolkit prefix.
export function isGtmToolkit(slugOrToolName: string): boolean {
  if (!slugOrToolName) return false;
  const first = slugOrToolName.split('_')[0].toLowerCase();
  return ALLOWLIST_SLUGS.has(slugOrToolName.toLowerCase()) || ALLOWLIST_SLUGS.has(first);
}

export function getGtmToolkit(slug: string): GtmToolkit | undefined {
  return GTM_TOOLKIT_ALLOWLIST.find((t) => t.slug === slug.toLowerCase());
}
