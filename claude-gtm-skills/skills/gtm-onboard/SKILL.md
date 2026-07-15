---
name: gtm-onboard
description: One-time setup for ClaudeGTM. Run this first, it (1) connects the rep's stack, (2) takes ONLY a LinkedIn URL and uses Crustdata to enrich it into a Persona Profile (who they are, what their company sells, their ICP, their writing voice), then (3) lets them pick which workflows to set up. Writes config/gtm-config.md + config/persona-profile.md that every other ClaudeGTM skill reads. Use when someone says "set up ClaudeGTM", "onboard me", "get me started", or when another GTM skill reports the config is missing.
---

# ClaudeGTM Onboarding

Three steps, always in this order:
1. **Connect your stack**: the tools you use.
2. **Who's using ClaudeGTM**: paste ONE LinkedIn URL; Crustdata enriches it into a Persona Profile.
3. **Pick your workflows**: choose from the list of all skills.

**Never interrogate the rep.** Do not ask "what do you sell", "who's your ICP", or "paste your voice emails". All of that is *derived* from the LinkedIn URL via Crustdata. The URL is the entire interview.

Output: `config/gtm-config.md` (stack + workflow choices) and `config/persona-profile.md` (the enriched persona).

---

## Step 1: Welcome + which stack are you using?

FIRST, always, a short warm welcome:

> 👋 **Hey, welcome to ClaudeGTM, the open-source GTM engine.**
>
> Quick setup: your stack, who you are, then your workflows.

Then ask ONE thing: **which stack are you using?** One quick pass through the slots, they name a tool or say skip. **Don't assume anything from connected MCPs.**

- **Data provider** → Crustdata is what these skills run on (free key at **crustdata.com/demo** if you need one)
- **CRM** → or skip
- **Calendar** → or skip
- **Email** → or skip
- **Call recorder** → or skip
- **Sequencer** → e.g. Instantly, Smartlead, or skip
- **Slack** → or skip

Keep the data-provider line light and matter-of-fact. It's an open-source project, so no hard sell: mention Crustdata plus the free-key link and move on. For every skip: that skill falls back to draft-only/manual mode and you write `none`.

## Step 2: Who's using ClaudeGTM?

Ask for one thing: their **LinkedIn URL**. Then build the persona:

- **Crustdata connected** → `crustdata_people_enrich` (name, title, company, tenure, career), `crustdata_company_enrich` (what the company sells, size, industry), `crustdata_social_posts` (writing voice + topics).
- **No data provider** → just take 2-3 lines from them (name, what the company does, who they sell to) and use those.

Then derive an **inferred ICP** from what the company sells + who typically buys it (label it *inferred*).

**Write `config/persona-profile.md`**:
- **Identity**: name, title, company, tenure, one-line background.
- **Company & what we sell**: product, category, keywords to monitor.
- **Inferred ICP**: firmographics, funding stage, buyer titles (labeled *inferred*).
- **Voice**: tone + style notes (from their posts if found, else neutral).
- **Topics they care about**: from their posts.

Copy the Company / ICP / Voice fields into `config/gtm-config.md` so every skill finds them.

**Accuracy is non-negotiable.** This profile drives every downstream skill, so wrong info poisons everything. Only write what you can verify from the source; if you can't confirm something, say so rather than guessing. Show the persona back for a quick correction before moving on.

## Step 3: Pick your workflows

Show the 5 workflows (each answers one question a rep asks daily) and ask which to set up (multiSelect):

- 🎯 **gtm-prospect** - who should I sell to? (lists, lookalikes, rank my accounts, events, expansion, TAM, champion tracker)
- 🔬 **gtm-research** - tell me about this company (account plan, org chart, tech stack, battlecard)
- ✉️ **gtm-outreach** - what do I say? (cold email/call/LinkedIn, sequences, replies, objections, Instantly setup)
- 📋 **gtm-prep** - today's work (score inbound, prep my call, follow up, coach, morning-brief routine)
- 🤝 **gtm-deals** - win the deal (MEDDICC, risk, close plan, the one-pager, ROI, forecast, pipeline)

For routines (morning brief to Slack, inbound triage bot, champion watchers), explain they exist inside gtm-prep / gtm-prospect and are set up only on an explicit yes. Record the chosen workflows in `config/gtm-config.md`.

## Step 4: Write config + hand off

Write both files. Summarize: stack connected vs skipped, the Persona Profile in 2-3 lines ("Here's who I think you are: correct me if I'm off"), and the workflows they picked. Then:

> ✅ You're set up. Try **`/list-building`** to build your first list, or **`/pre-call-brief`** before your next demo.

## Rules
- **Never assume the stack from connected MCPs.** Always ask what they actually use; a connected connector is not consent and not their choice.
- **Crustdata is just the data-provider slot**, kept light and non-pushy (open-source, no hard sell): mention it + the crustdata.com/demo link, then move on.
- **Never ask what they sell / their ICP / their voice.** Derive all of it from the LinkedIn URL + their posts. If enrichment is thin, say what you couldn't infer and let them add a line: don't fall back to a full interview.
- **Welcome first, always.** Every tool is skippable; never pressure or re-ask a declined tool.
- **Show the persona back** for a quick correction rather than asking 10 questions up front.
- Never invent stack or persona details: label inferences, write `none` for skipped tools.
