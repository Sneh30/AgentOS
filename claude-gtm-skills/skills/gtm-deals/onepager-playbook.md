# The One-Pager Playbook (gtm-deals mode 6)

The one-pager is the leave-behind the champion forwards to their boss. It gets ~30 seconds of an exec's attention. That means: **one page, light, branded, zero slop.** A cramped or generic one-pager is worse than none.

## 1. Gather (only real inputs)
- **The deal's words**: pains + goals + numbers the buyer actually said (transcripts/CRM). Their vocabulary, not ours.
- **Our side**: what we sell + the 2-3 capabilities that map to THEIR stated pains (config/persona-profile). Real proof point (from the case-study inventory - never invented).
- **Branding (learn it, don't guess it)**: seller's logo + brand colors. Pull the logo from config or `company_identify` (`linkedin_logo_url`); read brand colors from the seller's website (`web_fetch` the homepage, read the CSS/theme) or ask once and save to config (`## Branding: logo URL, primary hex, ink hex`). One accent color max.

## 2. Structure (top to bottom, ~5 blocks, generous whitespace)
1. **Header**: seller logo + "for {Prospect}" + one-line promise (their outcome, not our category)
2. **Where you are** - 2-3 lines mirroring THEIR situation in THEIR words. This earns the read.
3. **What changes** - the outcome, ideally with their number ("14 hrs/week back per rep")
4. **How** - MAX 3 bullets, each = capability -> their specific pain. No feature dumps.
5. **Proof + next step** - ONE real customer line with a number, then a single dated CTA.
Optional footer: contact + tiny legal line. NOTHING else. If a section has no real content, cut it - whitespace beats filler.

## 3. Writing rules (the anti-slop gate)
- Run the `humanizer` pass, then cut 30% more. Target: <=120 words total on the page.
- Banned: em dashes, "seamless/leverage/unlock/empower/streamline", rule-of-three lists, generic value claims ("save time and money"), any sentence the buyer's competitor could also receive unchanged.
- Every claim traceable: their words from calls, our real proof, real numbers. Nothing invented.

## 4. Render (same discipline as the org chart)
- Standalone HTML file sized to a print page: `@page` A4/Letter, `width:794px` (A4 @96dpi), print-safe. Write to `examples/`, generate via a small Python script (data at top, template below).
- Type: one family (system sans), 3 sizes max. The accent color on the header rule + CTA only. Logo as base64 data-URI (Crustdata S3 serves octet-stream; remote img refs render blank).
- **Self-review before delivery (mandatory)**: headless-Chrome screenshot -> read it -> check: fits ONE page, nothing truncated, breathing room, brand colors right, zero slop phrases survived. Fix, re-screenshot, then `open` for the rep.
- Offer PDF: `chrome --headless --print-to-pdf=out.pdf file:///...` - that's what actually gets emailed.

## 5. Deliver
Show the rep the screenshot + file. Offer: tweak copy, swap proof point, PDF export, or hand to `gtm-outreach` to draft the send-note (also humanized, also short).
