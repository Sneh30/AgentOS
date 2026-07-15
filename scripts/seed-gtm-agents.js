// Seeds the GTM Agent Library with template rows derived from claude-gtm-skills/.
// Run once against a fresh database: node scripts/seed-gtm-agents.js
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// One template per claude-gtm-skills/skills/gtm-* workflow (gtm-onboard is a one-time
// setup skill, not a recurring agent, so it's not seeded here).
const TEMPLATES = [
  {
    name: 'Prospect Finder',
    description: 'Build a fresh list of companies matching your ICP and rank them by fit.',
    goal_template: 'Find companies matching this ICP: {icp_description}. Rank the top {count} by fit and timing signals.',
    toolkits: ['linkedin', 'apollo'],
    input_schema: {
      icp_description: { type: 'string', description: 'Who you sell to' },
      count: { type: 'number', description: 'How many companies to find', optional: true },
    },
    trigger: 'manual',
    status: 'active',
    source: 'template',
  },
  {
    name: 'Account Researcher',
    description: 'Know a target account completely — external signals plus your team\'s internal history with them.',
    goal_template: 'Research {company_name} completely: recent news, tech stack, org chart, and any CRM history we have with them.',
    toolkits: ['salesforce', 'hubspot'],
    input_schema: {
      company_name: { type: 'string', description: 'Target company' },
    },
    trigger: 'manual',
    status: 'active',
    source: 'template',
  },
  {
    name: 'Meeting Prep',
    description: 'Pre-call brief: company + person context, internal history, talking points.',
    goal_template: 'Prep a brief for my meeting with {person_name} at {company_name}: their background, recent company news, our CRM history, and 3 talking points.',
    toolkits: ['googlecalendar', 'hubspot', 'salesforce'],
    input_schema: {
      person_name: { type: 'string', description: 'Who the meeting is with' },
      company_name: { type: 'string', description: 'Their company' },
    },
    trigger: 'manual',
    status: 'active',
    source: 'template',
  },
  {
    name: 'Outreach Drafter',
    description: 'Draft a cold email or LinkedIn touch for a target account, personalized off a real recent signal.',
    goal_template: 'Draft a first-touch outreach message to {person_name} at {company_name} about {product_name}, referencing one specific recent signal (a post, hire, or news item).',
    toolkits: ['linkedin', 'gmail'],
    input_schema: {
      person_name: { type: 'string', description: 'Recipient' },
      company_name: { type: 'string', description: 'Their company' },
      product_name: { type: 'string', description: 'What we sell' },
    },
    trigger: 'manual',
    status: 'active',
    source: 'template',
  },
  {
    name: 'Deal Qualifier',
    description: 'MEDDICC-qualify an open deal from CRM data and flag the biggest risk.',
    goal_template: 'Qualify the deal with {company_name} using MEDDICC against our CRM record and flag the single biggest risk to closing.',
    toolkits: ['salesforce', 'hubspot'],
    input_schema: {
      company_name: { type: 'string', description: 'The deal / account name' },
    },
    trigger: 'manual',
    status: 'active',
    source: 'template',
  },
  {
    name: 'LinkedIn Mention Finder',
    description: 'Find LinkedIn posts mentioning your product — structured search via webcmd, not a browser-agent loop.',
    goal_template: 'Find LinkedIn posts mentioning {product_name} from the last {lookback_days} days.',
    toolkits: ['webcmd:linkedin'],
    input_schema: {
      product_name: { type: 'string', description: 'Product or brand to search for' },
      lookback_days: { type: 'number', description: 'How many days back to search', optional: true },
    },
    trigger: 'schedule',
    schedule: '0 9 * * *',
    status: 'active',
    source: 'template',
  },
  {
    name: 'Lead Enricher',
    description: 'Enrich a list of leads with verified emails and firmographic data.',
    goal_template: 'Enrich these leads with verified email addresses and company data, then log them to the CRM: {lead_list}.',
    toolkits: ['apollo', 'hubspot'],
    input_schema: {
      lead_list: { type: 'string', description: 'Names/companies to enrich, one per line' },
    },
    trigger: 'manual',
    status: 'active',
    source: 'template',
  },
];

async function main() {
  for (const template of TEMPLATES) {
    const { data: existing } = await supabase
      .from('gtm_agents')
      .select('id')
      .eq('name', template.name)
      .eq('source', 'template')
      .maybeSingle();

    if (existing) {
      console.log(`Skip (already seeded): ${template.name}`);
      continue;
    }

    const { error } = await supabase.from('gtm_agents').insert(template);
    if (error) {
      console.error(`Failed to seed ${template.name}:`, error.message);
    } else {
      console.log(`Seeded: ${template.name}`);
    }
  }
}

main().then(() => process.exit(0));
