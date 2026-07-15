---
name: gtm-prospect
description: Prospecting hub. Opens by asking your GOAL, then routes to 7 sub-skills - find new companies, lookalikes of best customers, rank my accounts, event prospecting, expansion radar, TAM builder, champion tracker (with live watcher). Iterative Crustdata search, FIT x TIMING x WARMTH scoring, opt-in enrichment, handoff to sheet/CRM/sequencer. Use for "build me a list", "find companies like <customer>", "who should I prospect", "rank my accounts", "who's hot in my book", "list for <conference>", "upsell targets", "how big is this market", "track champions who leave customers".
---

# gtm-prospect

The prospecting hub. **Always open with: "What's your goal?"** and show the 7 sub-skills. Route, then run that sub-skill's recipe exactly. Every recipe below was live-tested - follow it, including the gotchas.

**STEP 0 (always):** read `config/gtm-config.md` (ICP, what we sell, buyer titles, customer list, stack). Confirm the ask in one line before spending credits.

---

## THE GOAL MENU (show this first)

1. 🎯 **Find new companies** - "I have an ICP, build me a fresh list"
2. 🏆 **Lookalikes** - "find companies like my best customers"
3. 📒 **Rank my accounts** - "here are my accounts (book / territory / CSV) - who do I work first?"
4. 🎪 **Event prospecting** - "who's at <conference> that I should meet?"
5. 📈 **Expansion radar** - "where can I grow inside my existing customers?"
6. 🌍 **TAM builder** - "how big is my market, with real numbers?"
7. 🔔 **Champion tracker** - "alert me when champions leave my customers" (live watcher)

---

## SUB-SKILL RECIPES

### 1. Find new companies (net-new)
Intake: ICP (industry/size/geo/stage) + **signals** (palette below) + target titles + rows wanted.
1. Validate every categorical via autocomplete (`linkedin_industries` values like "Software Development"; country ISO-3 `USA`; stages snake_case `series_a`). Wrong value = silent zero.
2. `company_search_db` broad -> **inspect top 10 -> refine 2-4 rounds** (stage lock via `last_funding_round_type`, amount band, `year_founded`, growth floor `employee_metrics.growth_12m_percent > N` - filterable). Report what each round caught.
3. People pull: `people_search_db`, `current_employers.company_id in [...]` + titles. Junk filter (<100 conns, placeholder headlines, advisors/investors).
4. Score FIT x TIMING x WARMTH -> 🔥/🟡/⚪ with the signal + date shown. Free data only; enrichment opt-in.

### 2. Lookalikes
`company_identify` the seed customers (free, batch) -> `company_search_db` with `company_id in` seeds to read their shared traits (industry values, size band, stage, growth) -> those traits become the filters -> run recipe 1 from step 2. Exclude the seeds + existing customers.

### 3. Rank my accounts (book, territory, or pasted CSV - one sub-skill)
Input: account names/domains/CSV from anywhere.
1. Resolve ALL in one `company_identify` call (free, comma-separated, 25/batch). Flag unresolved rows honestly.
2. ONE `company_search_db` with `company_id in [...]`, fields: funding date/stage/total, headcount. **Gotcha (tested): `employee_metrics.growth_*_percent` often doesn't return via `fields` projection - drop `fields` (compact mode includes growth) or accept funding-recency as the main timing signal.**
3. Optional depth per hot account: `job_search` with `aggregations` + `limit:0` for open-role counts (cheap hiring signal).
4. Score: TIMING-weighted (funding <3mo = 🔥; 3-9mo = 🟡; >12mo = ⚪, growth/hiring bumps a tier). Output ranked table + "why" per row + this week's top 5.

### 4. Event prospecting
1. **Source the roster for real - never invent attendees**: `web_search` "<event> sponsors exhibitors" -> the official /sponsors page usually lists tiers right in the search snippet (verified on a live conference) -> `web_fetch` the page for the full list. Rep-provided lists welcome.
2. `company_identify` the roster (free, batch) -> filter to ICP -> recipe 1 step 3 for the people (prefer folks posting about the event: `social_posts_by_keyword` on the event name).
3. Deliverable: meet-list ranked by ICP fit, with booth/tier + suggested opener referencing the event.

### 5. Expansion radar (make it WOW - this is revenue hiding in plain sight)
Input: customer list (CRM or rep). Per customer, sweep FOUR expansion surfaces:
   - **New money**: raised recently / new round (`company_search_db` by id - funding fields)
   - **New people**: exec hires in the function we sell to; team growth (`people_search_db` current_employers + start_date recent; job_search openings)
   - **New ground**: teams/geos/departments we don't touch yet (`people_search_db` by function/region at the account vs where our contacts sit)
   - **Warm paths**: our champions there + who they can intro (the referral ask, scripted)
Output per customer: opportunity - surface - evidence (dated) - estimated size (seats/teams) - the warm path in - suggested play. Rank the whole book by expansion-readiness.

### 6. TAM builder (researched methodology - do it properly)
Bottom-up with real company counts beats top-down guessing (count actual companies x ACV). Build THREE layers, each = one `company_search_db` count query (`limit:1`, read `total_count`, ~3 credits each):
   - **TAM** - broadest qualifying definition (anyone who could ever buy). Tested example: US software cos 50-1000 = **8,321**.
   - **SAM** - what our product/GTM serves today (add funding/stage/geo constraints). Tested: + raised $5M+ = **3,215**.
   - **SOM** - realistically winnable (SAM x credible win-rate %, or capacity: reps x deals/yr).
Then: **$ = counts x ACV** (ACV from config or the rep). Cross-check top-down: `web_search` for analyst market-size figures and show both numbers side by side. Always state assumptions + the exact filters used (so it's defensible). Offer breakdowns (by size band / geo / stage) as extra count queries.

### 7. Champion tracker (list now + watcher forever)
1. **The list today**: `people_search_db` with `past_employers.company_id in [customer ids]` + `recently_changed_jobs = true`. **Gotchas (tested): exclude advisors/investors/board (title filter `(!)` on "advisor|investor|partner" or drop them reading the list); use `current_employers.name` for the new company (the `company_name` key returns empty); junk-filter <100 conns.**
2. **The watcher (keeps it running)**: `crustdata_watcher_create`, `event_type_slug: person-discovery-via-filters`, `event_filters: [{filter_type: LAST_COMPANY, type: in, value: [customer domains]}, {filter_type: RECENTLY_CHANGED_JOBS}]` - **RECENTLY_CHANGED_JOBS is boolean: NO type/value keys or it 400s (tested)**. LAST_COMPANY = the job they just left (do NOT use PAST_COMPANY - matches anyone who ever worked there). Creating is FREE; set `frequency` (7 = weekly) + `expiration_date`; no webhook needed (Crustdata-managed receiver; read hits via `watcher_run_summary`). Confirm with the rep before creating; surface the watcher id + the returned curl.
3. Output rows: Person - was [role] at [customer] - now [title] at [new company] - landed [date] - hand to `gtm-outreach` for the "congrats, you know us" touch.

---

## SIGNAL PALETTE (offer during intake, composable)
Growth (headcount %, team growth, web traffic, revenue band) - Funding (recency, stage, size, investors) - Hiring (the role whose pain we solve, surge, tech in job posts) - Content & intent (people/company posting a keyword, competitor mentions) - People & movement (champion moved, new exec, competitor leavers, customer alumni, same school/YC) - Company events (new office, news, launch) - Tech & presence (competitor/category, G2/ProductHunt, Glassdoor, SEO) - Warmth (mutuals, shared investor, accelerator) - Disqualifiers OUT (layoffs, customers, competitors) - Custom AND-rules.

## UNIVERSAL RULES
- Ask the goal first; confirm scope in one line; then run the recipe, narrating steps.
- Iterate, never dump round-1 results. Show what each refine round dropped and why.
- Free data first. Contact enrichment is opt-in + cost-confirmed ("emails for 20 = ~40-100 credits, go?"). Company enrich by `company_id` + `exact_match:true` only.
- Junk filter always: <100 connections, placeholder headlines, advisors/investors/board, geo/role mismatches.
- Watchers and CRM/sequencer writes need an explicit yes.
- **Handoff (always ask)**: Google Sheet / CSV - push to CRM (confirm) - push to sequencer (enrich first, confirm) - hand to `gtm-outreach` - or table only.
