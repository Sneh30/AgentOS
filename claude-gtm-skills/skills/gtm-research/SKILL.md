---
name: gtm-research
description: Know a company completely. Opens by asking your goal and WHERE YOUR CONTEXT LIVES (HubSpot? Fathom? Slack? Gmail?), then routes to 4 sub-skills - account deep-dive & plan (external + your internal history with them), org chart (who runs it), tech-stack & wedge, competitive battlecard. Use for "tell me about <company>", "account plan for <company>", "org chart for <company>", "what's their tech stack", "battlecard for <competitor>", "how do we beat <X>", "research this account".
---

# gtm-research

One job: **know a company completely** - what's publicly true (Crustdata + web) AND what YOUR team already knows about them (CRM, calls, Slack, email). Most research skips the second half; that's where deals are actually won.

## STEP 0 - Context intake (always, before researching)

1. Read `config/gtm-config.md` + `config/persona-profile.md` (what we sell -> what's relevant).
2. **Ask where the context lives** (once per session, then remember): "Which of these do you have connected - HubSpot/CRM? Fathom/recorder? Slack? Gmail?" Use ONLY what's actually connected; degrade gracefully (external-only research still works, say what's missing).
3. Ask the goal (menu below) + which company.

## THE GOAL MENU

1. 📋 **Account deep-dive & plan** - everything about one target + how to attack it
2. 🗂️ **Org chart** - who runs it, who reports to whom (see `orgchart-playbook.md` in this folder - the full battle-tested pipeline)
3. 🛠️ **Tech stack & wedge** - what they run today + our opening
4. ⚔️ **Competitive battlecard** - how we beat a competitor

## Sub-skill 1 - Account deep-dive & plan

**A. External sweep (Crustdata + web):**
- `company_identify` -> `company_enrich` (by id, exact): size, funding, growth, revenue band
- `job_search` on the company: open roles = pains + investment areas; tech in job posts
- `crustdata_web_search` + news: last 90 days (funding, launches, exec moves, layoffs)
- `company_social_posts`: what THEY are talking about right now
- Key people snapshot (leadership in the function we sell to)

**B. Internal sweep (the differentiator - use whatever is connected):**
- **CRM (HubSpot)**: past/open deals with them, contacts we know, notes, why past deals died
- **Recorder (Fathom)**: search past calls with the account - their words, objections, promises
- **Slack**: search the account name - internal chatter, warm intros, who knows them
- **Gmail**: past threads with their domain - existing relationships
Summarize as "our history with them": who we know, what was said, where it stalled.

**C. Synthesize the ACCOUNT PLAN (this is the deliverable):**
- One-line read: what they do, where they're going, why now
- **Why we win here**: their pains (evidenced) mapped to what we sell
- **Who to talk to**: champion/economic-buyer hypotheses (or run the org chart)
- **Our history**: relationships + past context (from B)
- **Entry play**: first move, warm path if any, the opener angle
- **Risks**: incumbent, timing, past failed deal
- 90-day next steps, dated
Run the copy through the `humanizer` pass (no slop, no filler). Offer: deliver in chat, as a doc, or continue into org chart / outreach.

## Sub-skill 2 - Org chart
Follow `orgchart-playbook.md` in this skill folder EXACTLY - it is battle-tested (size-branch, The Org for real reporting, hand-read titles, curation, base64 photos, standalone HTML, headless-Chrome self-review). Do not improvise a different chart.

## Sub-skill 3 - Tech stack & wedge
1. `job_search` with descriptions (`compact:false`) - tools named in job posts are ground truth
2. `company_enrich` categories/competitors; engineering blog/docs pages via `web_fetch`; G2 profile
3. Classify vs us: **incumbent competitor** (displacement play + switching cost), **complement** (integrate/land-alongside), **gap** (greenfield)
4. Output: stack map with confidence per item (job-post-confirmed vs inferred) + THE WEDGE: the one specific opening, phrased as an opener the rep could say.

## Sub-skill 4 - Competitive battlecard
1. Profile the competitor (enrich + job_search = where they're investing + news 90 days + their social posts = current messaging)
2. Battlecard: their ICP & strengths (be honest - pretending they're weak gets reps killed), their gaps vs our differentiation, landmine discovery questions, top-3 objections + responses, traps to avoid
3. If it's for a live deal: which differentiators matter for THIS prospect's stated pains.

## Rules
- Internal context is half the job - always ask what's connected and sweep it. Never skip because it's "just research".
- Facts get sources (Crustdata / URL / call / CRM note). Inference gets labeled.
- Read-only on CRM/Slack/Gmail - research never writes.
- `humanizer` pass on every deliverable. No filler sections - if there's nothing real to say, cut the section.
- Hand off: -> `gtm-outreach` (first touch), -> `gtm-prospect` (lookalikes of this account), -> `gtm-deals` (if a deal exists).
