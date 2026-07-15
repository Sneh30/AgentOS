---
name: gtm-prep
description: The daily driver - everything in front of you TODAY. Score an inbound lead, prep any call (brief + question plan + demo flow), follow up after (recap email + CRM log), coach a call, CS handoff. Can be wired as automated routines (morning brief to Slack, inbound triage bot) - designed and testable without sending. Use for "score this lead", "prep my 2pm", "prep my call with <company>", "follow up my last meeting", "log the call", "coach me on that call", "set up my morning brief", "triage inbound".
---

# gtm-prep

One job: **today's work.** Reps live here daily, so speed and zero-slop output matter more than anywhere else. Every written output passes the `humanizer` gate.

## STEP 0
Read `config/gtm-config.md` + `config/persona-profile.md`. Note which tools are ACTUALLY connected (calendar, recorder, CRM, Slack) - each sub-skill says what it needs and degrades gracefully (missing tool -> rep pastes the input instead).

## THE SUB-SKILLS

**1. Inbound triage** (needs: nothing; better with CRM)
- Enrich the lead free-tier: `company_identify` -> size/funding/industry; person title = buyer or tire-kicker?
- Score vs ICP + (if CRM connected) the real closed-won pattern: firmographic fit, budget signal, buyer-title match, timing signals, disqualifiers -> **close-probability % + verdict**: 🔥 route now / 🟡 nurture / ⛔ reject - with the reasons shown.
- Batch mode: rank a whole day's inbound in one table.

**2. Pre-call brief** (needs: nothing; better with calendar + CRM + recorder)
- Single meeting or daily mode (calendar connected -> external meetings only, skip internal).
- Company block: enrich + jobs + news 60 days. Person block: career, recent posts, mutual ground.
- **Internal block**: CRM history + past call transcripts with them - what was already said.
- The part reps read: 3 talking points, 1 sharp opener referencing something real and recent, 2 discovery questions, likely objection + pre-empt. One screen max.

**3. Call plan** (discovery / demo / negotiation - say which)
- Discovery: 2-3 pain hypotheses from signals + a MEDDICC/SPICED-mapped question plan (~8-12 open questions, not 30) + the committed-next-step ask.
- Demo: recap-their-pains open, then ONLY features mapped to stated pains, tell-show-tell beats with confirming questions, close plan. Discovery thin -> say the demo will be weaker, suggest discovery first.
- Negotiation: leverage read, their likely asks, give-gets (every concession trades for something), walk-away, procurement-tactic counters.

**4. Follow-up** (needs: recorder or pasted notes; better with CRM + email)
- Pull the transcript (Fathom `list_meetings`/URL - never summarize from memory) -> extract: pains in THEIR words, commitments both sides, next steps + owners + dates, qualifying info.
- Recap email in the rep's voice (humanizer gate): specific moment open, 2-4 bullets, clear next step, promised resource. Email connected -> create as DRAFT only.
- CRM log: call note + next-step tasks. **Show exactly what will be written and get a yes before writing.** Stage changes always ask.

**5. Call coaching** (needs: recorder)
- From the real transcript: talk/listen ratio, discovery quality (open vs closed questions), agenda control, objection handling, qualification coverage, did-they-secure-a-next-step.
- 2-3 strengths + 2-3 fixes WITH the better phrasing, timestamped. One headline habit to change. Coach tone, not judge.

**6. CS handoff** (deal just closed)
- Recover the promise from calls/CRM: why they bought, success metrics stated, go-live date. Map stakeholders, milestones to first value, risks. Every open commitment sales made goes in the doc.

## ROUTINES (design + test now, deploy only on explicit yes)

These wire gtm-prep into a system. Build the routine, render its output for review, and ONLY schedule/send after the rep approves:
- **☀️ Morning brief** - daily (e.g. 7:00): today's external meetings -> sub-skill 2 briefs -> ONE Slack DM (or chat digest). Wire via the `schedule` skill; send via Slack MCP.
- **📥 Inbound triage bot** - new lead arrives (form/email/Slack channel) -> sub-skill 1 score -> post verdict + reasons to a Slack channel, tag the right rep.
- **🌙 EOD nudge** - today's calls with no follow-up sent / no CRM log -> evening Slack ping.
**Test mode (default):** run the full flow but RENDER the Slack message in chat instead of sending ("here's exactly what would post to #sales-inbound"). Never message Slack, create schedules, or auto-send in test mode. Deploying = rep says "turn it on".

## Rules
- Grounded only: briefs cite sources; follow-ups trace to the transcript; unclear -> ask or omit, never invent.
- Humanizer gate on all prose. One screen per deliverable - reps skim.
- CRM writes confirmed; emails always drafts; Slack sends only from a deployed routine the rep approved.
- Hand off: inbound 🔥 -> `gtm-outreach` (first touch) or `gtm-deals` (if it becomes an opp); follow-up -> `gtm-deals` (update the close plan).
