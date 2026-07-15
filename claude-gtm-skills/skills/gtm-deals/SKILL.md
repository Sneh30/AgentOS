---
name: gtm-deals
description: Win the deal - any deal (new, renewal, expansion). Qualify it (MEDDICC from CRM + calls), score risk, find missing stakeholders, build the close plan, prep negotiation, and produce collateral - the ONE-PAGER (crown deliverable, see onepager-playbook.md), proposal, ROI model, quote, case-study match. Zoom out for forecast, pipeline review, and why-we-lose analysis. Use for "MEDDICC this deal", "is this deal healthy", "who am I missing", "close plan for <company>", "make a one-pager for <deal>", "build the ROI model", "quote options", "my forecast", "review my pipeline", "why are we losing".
---

# gtm-deals

One job: **win the deal.** Works on real data - the deal in the CRM, the words from the calls - never on vibes. If the data isn't connected, ask for it (paste the context) rather than inventing it.

## STEP 0
Read `config/gtm-config.md` (CRM + field map, recorder, price book / case-study library pointers) + `config/persona-profile.md`. Ask which deal (or "the book" for zoom-out modes). Pull the deal's reality first: CRM record (stage, amount, close date + slips, contacts, notes) + call transcripts for the account. Everything downstream cites this.

## DEAL MODES (one deal)

**1. Qualify (MEDDICC / MEDDPICC / SPICED - team's pick)** - fill every field FROM EVIDENCE (transcript quote or CRM note per field): Metrics, Economic buyer, Decision criteria, Decision process, Identified pain, Champion, Competition. 🟢 evidenced / 🟡 partial / 🔴 unknown. Unknown EB or untested champion caps the overall grade. Output: scorecard + the exact question to close each gap next call.

**2. Health check** - risk verdict 🟢/🟡/🔴 from: stakeholder coverage (single-threaded?), qualification gaps, momentum (days since meaningful activity; is there a SCHEDULED next step - the #1 red flag), close-date realism vs remaining steps, engagement in transcripts. Every risk -> one specific fix.

**3. Coverage / threads** - target committee (economic buyer, champion, users, blockers - run the org chart via `gtm-research` if unmapped) vs who we've actually engaged (CRM). Flag single-threading loudly. For each gap: the warm path in (champion referral script first, cold second).

**4. Close plan (MAP)** - reverse-timeline from the BUYER's target date using the BUYER's process (eval, security, procurement, legal, sign-off): milestone - owner - date - status. Flag ownerless steps and forgotten lead times (procurement, legal). Phrase it as a shared doc the champion co-owns; include the line that gets their commitment.

**5. Negotiation prep** - honest leverage read both ways, their likely asks, give-gets (every concession trades: term, case study, timing), floor + walk-away + BATNA, counters to procurement tactics ("competitor is cheaper", fake deadlines).

## COLLATERAL MODES (make the thing to send)

**6. THE ONE-PAGER 👑** - the most important artifact in this skill. Follow `onepager-playbook.md` in this folder EXACTLY: one page ONLY, light, branded, zero slop, built from the deal's real words. Screenshot-reviewed before delivery.

**7. Proposal** (multi-section: situation -> outcome -> approach -> proof -> scope -> pricing -> next steps) - same truth-rules as the one-pager; `docx`/`pptx` output.

**8. ROI model** - the buyer's OWN numbers from calls (team size, hours, costs); conservative + base case; show the formulas; annual net benefit, ROI %, payback; include cost-of-doing-nothing. `xlsx` the champion can edit. Missing inputs -> ask, or label assumptions loudly.

**9. Quote / packaging** - good/better/best FROM THE PRICE BOOK ONLY (no price book on file -> ask; never invent prices). Discounts inside guardrails, always traded for something. Pair every number with the value line.

**10. Case-study match** - score the team's REAL proof inventory (from config/rep - never fabricate customers) against this deal: same industry > same size > same use-case > same pain. Deliver the 1-3 best + the one-line intro framing each. No good fit -> say so.

## BOOK MODES (zoom out)

**11. Pipeline review** - segment open deals: commit-worthy / at-risk / neglected / happy-ears (stage contradicts evidence). Hygiene flags (no next step, past-due dates). Coverage vs quota. Output: this week's 5-8 highest-leverage moves. Offer to fix stale CRM fields - confirmed writes only.

**12. Forecast** - commit / best-case / pipeline categorized BY EVIDENCE, not CRM stage defaults. Roll up vs quota; name the 3-5 deals the number hinges on; pull-in candidates. A "commit" with no scheduled next step gets challenged.

**13. Lost-deal analysis** - single post-mortem (stage history + transcripts -> where it actually died; distrust the CRM loss-reason label) or cohort trends (where deals die, to whom, which segments, single-threading correlation) -> top 3 systemic fixes. QBR deck = this + forecast, via `pptx`, on request.

## Rules
- Evidence or silence: every scorecard field, risk flag, and forecast category cites CRM/transcript. Label inference.
- Never invent pricing, case studies, metrics, or commitments. Ask for the price book / proof inventory.
- CRM writes and stage changes: show first, confirm, then write. Collateral: humanizer gate + the one-pager playbook rules.
- Renewals and expansions are deals - same modes apply (renewal risk = mode 2 with champion-still-there? and value-delivered checks).
- Hand off: collateral -> `gtm-outreach` to send; gaps in the committee -> `gtm-research` org chart; expansion whitespace -> `gtm-prospect`.
