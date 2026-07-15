
# Org Chart Playbook (gtm-research mode 2)

Produce an org chart that looks like a real org chart: **CEO at the top, connector lines down to their leaders, each leader's people nested underneath.** Photo + name + clean title on every card. Output is a **standalone HTML file** opened in the browser (never an inline widget - it can't load photos and can't lay out a wide tree).

The whole job is: get the RIGHT people, the RIGHT structure, and RENDER it cleanly. Do all three or it's worthless.

Read `config/gtm-config.md` for what the rep sells (helps pick the relevant department). If missing, proceed with defaults.

## Step 1 - Identify + calibrate

- `crustdata_company_identify` (free) → company_id, `employee_count_range`, logo. Size drives the flow.
- **Web-search the company** (`crustdata_web_search`) to learn how it's actually run: flat or hierarchical? title-inflated ("everyone's a VP") or flattened ("everyone's a Member of Technical Staff")? A "VP" at a 40-person startup ≠ a "VP" at a bank. This calibrates what titles mean here.

## Step 2 - Scope + depth

- **Small (≤ ~50):** map the whole company. No questions.
- **Big (> ~50):** do NOT dump everyone. Show the departments, ask which one they want (default to the one they sell into), or offer the **top exec layer** across the company. Also ask depth: exec-only / through managers / deep.

## Step 3 - Get the REAL structure (this is where charts live or die)

1. **Anchor the top from authoritative sources, NEVER by connection count.** Sorting people by LinkedIn connections is garbage - a viral BDR outranks the CFO. Instead:
   - **The Org** (`theorg.com/org/<company>`) - fetch it. It publishes *actual reporting relationships* and org sizes ("354 in org"). This is the reporting skeleton.
   - Annual report / leadership page / "deep dive" articles - name the true exec team.
2. **Pull the people from Crustdata** (`crustdata_people_search_db`, `compact:false` to get photos): the senior layer (CXO/VP/Director), filtered on `current_employers.company_id`. Big pulls spill to a file - jq-extract name/title/photo/linkedin/seniority.
3. **Merge:** The Org gives the structure + real names; Crustdata gives photos (`profile_picture_permalink`, loads anywhere), LinkedIn (`flagship_profile_url`), titles. Match people by normalized name.

## Step 4 - Curate the people who matter (do NOT dump everyone)

For a 10k-person company the honest answer to "who matters" is the **~50-80 leaders you can verify and name** - not every profile the API returns. To build the tree:

- **Read every title yourself - never keyword regex.** Regex mis-files everything ("Group Chief Banking Officer" is not a regional CEO; "Head of Lending" is a business line, not Risk). Dump all names+titles, read them, hand-place each person.
- **Nest by title-scope containment:** breadth of scope = seniority. Group/Global > region > country > sub-team. "Group Head of Risk - Credit" sits under the CRO; "Head of Retail Credit Risk" sits under *him*; "GM Germany" sits under "Head of Country Branches". This is what makes it a tree, not a flat department list.
- **Clean every title by hand.** Raw LinkedIn strings are junk ("CISO - Gerente Senior de Seguridad de la Información" → "CISO"). Short, human, consistent.
- **Only use the title at the target company_id.** People carry side-company / advisory / board titles - ignore those, never stamp a "Co-Founder" from a different company onto this role.
- **Drop the unverifiable and the noise:** **profiles with < 100 LinkedIn connections** (fake/inactive/mis-tagged), placeholder headlines ("--", ".", one-word junk), obvious geographic/role mismatches, investors/advisors, and vague-title profiles you can't confidently place ("Director", bare "Partner"). A smaller, correct, readable chart beats a big messy one - every time.

## Step 5 - Render as a standalone HTML file

Classic top-down org tree in one self-contained HTML file (write to `examples/`, open with `open`):
- **CEO card at top** → thin connector line down → horizontal rail → **department-lead cards in a row** → a vertical spine under each → **that leader's people stacked and connected beneath them.**
- Each card: circular **photo**, **name**, one clean **title**, links to LinkedIn. Company logo + title in a top bar.
- **EMBED every photo as a base64 data-URI** (download the `profile_picture_permalink`, base64 it, inline it). Do NOT use remote `<img src>` URLs: Crustdata's S3 serves photos as `binary/octet-stream`, which browsers refuse to render as images, so remote refs show blank even though the file "worked" in a headless screenshot (which had them cached). Base64 = always renders + truly self-contained. Keep an `onerror` → initials fallback for the few profiles with no photo.
- Loads **fit-to-width** so the whole structure is visible at once; +/- and Fit buttons; clean thin gray connectors; white cards; one accent color for the root. No rainbow columns, no headcount badges, no clutter.
- The current `examples/revolut-orgchart.html` is the reference template - reuse its layout/CSS and swap the data.

Generate it with a small Python script that holds the curated hierarchy as data and emits the HTML (keeps the structure editable and re-runnable).

## Step 6 - SELF-REVIEW before showing (mandatory)

Never show a chart you haven't looked at. The preview server is sandbox-blocked; use headless Chrome instead:
```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/shot.png --window-size=1680,1050 --hide-scrollbars "file:///…/chart.html"
```
Read the screenshot. Check: titles not truncated, no overlap, tree reads top-to-bottom, photos loaded, nothing off-screen. Fix what's wrong, re-screenshot, and only then `open` it for the user. Designing blind is why this took 10 tries once - don't.

## Rules
- A flat "exec + list of their department" is a directory, not an org chart. Build **nesting** (managers with reports under them).
- Structure from authoritative sources (The Org / filings), people+photos from Crustdata. Never rank importance by follower/connection count.
- Curate to the verifiable few; drop what you can't confidently place. No fabricated people, titles, or reporting lines - label any inferred edge as inferred.
- Output is always a standalone HTML file with real photos, self-reviewed via screenshot first.
