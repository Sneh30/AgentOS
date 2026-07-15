# ClaudeGTM: Team Config

> Copy this file to `config/gtm-config.md` and fill it in (or run the `gtm-onboard` skill,
> which will do it for you interactively). Every ClaudeGTM skill reads this file first to
> learn *your* stack, so nothing is hardcoded. Leave a field as `none` if you don't use it.

## Stack

| Capability            | Tool the team uses            | MCP / how to reach it                                  |
|-----------------------|-------------------------------|--------------------------------------------------------|
| Company + people data | Crustdata                     | `crustdata_*` MCP tools (always available in ClaudeGTM)|
| CRM                   | HubSpot                       | HubSpot MCP (`get_crm_objects`, `search_crm_objects`…) |
| Email                 | Gmail                         | Gmail MCP (`create_draft`, `search_threads`…)          |
| Call recorder         | Fathom                        | Fathom MCP (`list_meetings`, `get_meeting_transcript`) |
| Calendar              | Google Calendar               | Calendar MCP / Gmail-linked calendar                   |
| Cold sequencer        | Instantly                     | Instantly API (see `## Sequencer` below)               |
| Messaging             | Slack                         | Slack MCP (`slack_send_message`…)                      |

> If a capability's MCP isn't connected, the skill will still run: it just produces a
> draft/output for the rep to paste in manually, and flags what it couldn't do.

## Company

- **We sell:** <one line: product + category>
- **Website:** <url>
- **Primary competitors:** <comma-separated>
- **Categories/keywords for competitive & trigger monitoring:** <...>

## ICP (used by inbound-lead-triage, list-building)

- **Firmographics:** headcount `<range>`, industries `<...>`, geos `<...>`
- **Funding stage:** `<seed / A / B / growth / any>`
- **Tech-stack / hiring signals that mean "good fit":** `<...>`
- **Disqualifiers (auto-reject):** `<...>`
- **Titles we sell to (economic buyer / champion / user):** `<...>`

## Voice (used by meeting-followup, trigger-outreach, proposal-one-pager)

- **Default sender name & title:** `<...>`
- **Tone:** `<e.g. direct, warm, no fluff, short sentences>`
- **Signature block:** `<...>`
- **Things to never do:** `<e.g. no "I hope this finds you well", no emojis, no "circle back">`
- **2-3 example emails in my voice (paste below or link):**
  ```
  <paste a real sent email or two here so drafts match how you actually write>
  ```

## Sequencer (used by trigger-outreach)

- **Tool:** Instantly / Smartlead / Apollo / none
- **How to push a lead in:** `<API key env var, campaign ID, or "draft only: I add manually">`

## CRM field map (used by meeting-followup, lost-deal-analysis, inbound-lead-triage)

- **Deals object + stage field:** `<...>`
- **Where call notes go:** `<note object / activity / property>`
- **Closed-won / closed-lost stage names:** `<...>`
