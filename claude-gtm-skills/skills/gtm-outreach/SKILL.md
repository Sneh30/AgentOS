---
name: gtm-outreach
description: Write any sales touch and set up outbound. Cold email, call script, LinkedIn touches, full multi-channel sequences, replies, objection handling, signal-triggered drafts - all in the rep's voice, all run through the humanizer (zero AI slop). Can take a list from gtm-prospect and build the whole Instantly/sequencer campaign. Use for "write a cold email to <person>", "what do I say", "they replied saying <X>", "handle the <objection> objection", "build a sequence", "set up outbound in Instantly for this list", "draft outreach for these accounts".
---

# gtm-outreach

One job: **what do I say - and get it out the door.** Every word that leaves this skill goes through the humanizer. A touch that smells like AI is worse than no touch.

## STEP 0 - Voice + context (always)
1. Read `config/persona-profile.md` (the rep's voice: tone, sentence length, sign-off, never-do list) + `config/gtm-config.md` (what we sell). No voice on file -> ask for 1-2 real sent emails once, save them.
2. Intake in one line: WHO (person/list) - CHANNEL (email/call/LinkedIn) - MOMENT (first touch / follow-up / reply / objection) - GOAL (meeting? answer?).
3. Personalization fuel: pull ONE specific, recent, real hook per target (their post, their raise, their hire, their job listing - Crustdata/web). One sharp hook beats five generic ones. Never fabricate a hook.

## THE SUB-SKILLS

**1. Cold email** - under 90 words. Subject 3-5 words, no clickbait. Open with THEM (the hook), one bridge line to the pain, one concrete outcome, ONE low-friction ask, their signature. Offer 2-3 angle variants for testing.

**2. Call script** - opener + permission line, reason-for-call tied to the hook, value hypothesis, 2-3 open discovery questions, the ask (a meeting, not a sale). Objection branches: not-interested / send-an-email / we-use-X / no-budget / gatekeeper. 15-second voicemail + one-line follow-up text.

**3. LinkedIn** - connection note (<=300 chars, no pitch), first DM (value or smart question, still no pitch), follow-up with a soft ask, graceful break-up. Suggest 1-2 of their recent posts worth a genuine comment first (warms everything).

**4. Reply handler** - classify the incoming reply (interested / question / objection / referral-out / not-now / no / unsubscribe) and draft the advance. Match their length and energy. Hard no -> gracious exit. Unsubscribe -> honor instantly.

**5. Objection talk-tracks** - diagnose the REAL objection first ("too expensive" usually = "value unclear" or "no champion"). Acknowledge -> reframe -> one real proof point -> soft re-ask. Two variants: direct + soft. Playbook mode: the team's top 8-10 objections as a doc.

**6. Sequence builder** - full multi-touch cadence: day-by-day table (channel + angle per touch - vary the angle: problem / proof / other-persona pain / social proof / break-up), then write EVERY touch via sub-skills 1-3. Mark which touches are 1:1 personalized vs merge-field + where the rep must add a custom line.

**7. Signal-triggered drafts** - input: a fired signal (new funding / exec hire / champion moved - often handed over from `gtm-prospect`'s champion tracker or a watcher). Map signal -> angle (raise = scaling pain; new exec = new mandate; champion moved = "congrats, you know us"). Draft referencing the actual trigger, dated. Optional: offer a Crustdata watcher to keep the signal flowing - create ONLY on an explicit yes.

## OUTBOUND SETUP (list -> live campaign)

Input: a scored list (usually from `gtm-prospect`). Build the whole campaign, hands-off until the send decision:
1. **Enrich emails** for the list - opt-in, cost-confirmed first ("emails for 40 = ~80-200 credits, go?").
2. **Write the sequence** (sub-skill 6) with per-row personalization fields.
3. **Package for the sequencer (Instantly / Smartlead / Apollo):**
   - Export a campaign CSV: `email, first_name, last_name, company, title, linkedin_url, personalization_line, tier`
   - Campaign spec doc: sequence steps + copy per step + schedule (send window, timezone, daily ramp: start 20-30/day), threading (follow-ups in-thread), stop-on-reply ON.
   - If the rep provides an Instantly API key (config `## Sequencer`): create the campaign + upload leads via the Instantly API (v2, `api.instantly.ai`) - BUT only build it PAUSED. **Never activate sending; the rep pushes the start button.** No key -> hand over CSV + spec with click-by-click setup steps.
4. Deliverability guardrails in the spec: warm domain, <=1 link in touch 1, plain text, unsubscribe compliance.

## THE HUMANIZER GATE (mandatory, every sub-skill)
Run the `humanizer` skill's pass on EVERY draft before showing it. Kill on sight: em dashes, "I hope this finds you well", rule-of-three constructions, "delve/leverage/streamline/unlock", negative parallelisms ("not just X, but Y"), filler adverbs, fake familiarity. Sound like the rep texting a smart colleague. If a draft reads like a template, rewrite it - do not ship slop.

## Rules
- One hook, one idea, one ask per touch. Shorter beats clever.
- Never auto-send anything - email drafts, sequencer campaigns paused, CRM logs confirmed.
- Personalization must be real and dated; no fabricated references, no invented case studies.
- Respect opt-outs completely. No compliance-risk volume without the rep explicitly owning it.
- Every deliverable ends with the handoff question: draft in Gmail / push to sequencer (paused) / just the copy.
