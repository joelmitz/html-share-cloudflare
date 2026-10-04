---
name: create-html
description: Create a polished, self-contained, responsive HTML briefing from notes, research, comparisons, plans, or reports. Use when the user asks to turn content into a readable HTML page, visual brief, dashboard, comparison, timeline, or shareable report, including Japanese requests such as 「見やすいHTMLにして」 or 「HTMLでまとめて」.
---

# Create HTML

Turn the user's content into one complete HTML file that is calm, readable, and ready to share. Keep the information primary; styling should make the structure easier to scan.

## Workflow

1. Confirm the source material, audience, and purpose from the conversation and local files. Do not invent facts to fill empty sections.
2. Decide the information structure before styling. Prefer a short narrative, comparison table, timeline, or paired layout over a grid of generic cards. Read [layout-patterns.md](references/layout-patterns.md) when the page has multiple content types, a schedule, a revision, or a decision to request.
3. Copy [brief-template.html](assets/brief-template.html) as the starting point. Keep its stylesheet whole and add only the parts this content needs; do not write a new stylesheet and then patch in the template's tokens. Remove unused components and replace every `{{PLACEHOLDER}}`. [design-rules.md](references/design-rules.md) explains why each rule in the stylesheet exists.
4. Write a single self-contained `.html` file. Keep CSS and small SVG illustrations inline. Do not require a build step, JavaScript framework, CDN, external font, or analytics.
5. Run the checks below and fix every NG line.
6. When the page uses a mechanism the template does not have (a calendar, a new grid, content in the hero), render it at desktop width and around 390 px and run [render-checks.md](references/render-checks.md). Look at one screenshot yourself; passing numbers are not the same as having seen the page.

## Design contract

- Light mode. One deep-blue gradient as the base, neutral text and lines, gold as the only accent, used as points rather than surfaces. Do not color-code sections with extra hues.
- The gradient appears in five places only: the full-width hero, the 72 px bar on each section divider, the section numbers, the table header, and card header bands. Bands never nest: a table or Before/After inside a card uses a white header with a small pill label.
- Main content about 940 px wide, body text at least 15 px, line height around 1.85.
- Use Japanese system fonts first: `-apple-system`, `BlinkMacSystemFont`, `"Hiragino Sans"`, `"Yu Gothic UI"`, `sans-serif`.
- Tables have no vertical rules and no `min-width`. On phones the delivered page folds narrow tables into stacked cards, so avoid `white-space: nowrap` on long cells and never shrink text to make a table fit.
- Use semantic headings in order, visible focus styles, sufficient color contrast, and descriptive link text.
- Keep decorative icons minimal. Prefer CSS shapes or inline SVG to emoji-heavy decoration.

## Writing rules

- Write the body as a declarative report: plain statements and noun phrases, not conversational or polite spoken style. Phrase open questions as statements in a list, and do not write headings as questions. The only exception is text the user will send or read aloud as-is.
- Give the main topic the most space. Each core item gets its own section with a figure and a line of reasoning (current problem, approach, status, next step). Do not spend three figures on background and leave the main items as bullet points in one card.
- Do not put backstory, excuses, or rejected options in leads, captions, or table cells. A row says what changed and how; the reasons belong in the working notes, not the page.
- Do not make the reader go through the same list twice. If the sections explain items one by one, drop those items from any overview table and use a short diagram or two lines of orientation instead. Do not end with a recap of the same list.
- Add facts, numbers, and rows freely, but do not add things the reader must decode first: visual codes that need a legend once there are three or more, abstract identifiers such as `S1`/`S2` or `A`/`B`, or the same number restated in several units. Pick one form for each fact.
- Show numbers as a chart with few series plus a short table of the key values (about five rows).
- Add the day of the week to every date, including dates in tables and both ends of a range (`3/2（月）〜3/6（金）`). Compute weekdays with code, never by hand, and recheck weekdays copied from existing material. Calendar grids are the exception because the column already shows the weekday.
- Start the `<title>` with the specific scope of this page so it can be told apart in a list of similar pages. Put the same scope in the file name.
- When updating a page after feedback, replace it with the current round only. Keep earlier figure or image comparisons, folded, because the page is the only place those can be compared.
- A page meant to be handed to a third party as-is contains only the proposal itself. Reasons, comparisons, and verification tables go to the user in chat, not on that page.
- Never put the user's own commitments, requests to other people, or decisions they have not made into a page others will read.

## Figures

Count figures before delivery. A page with no `<svg>` or `<img>` should be reconsidered once:

| Content | Figure |
|---|---|
| Dates, deadlines, phases | Date cards on a time axis, grouped by week or month |
| A day's timetable | One horizontal timeline with evenly spaced times and blocks sized by duration |
| Steps or stages | Left-to-right steps with arrows; undecided steps drawn dashed |
| System structure, data flow, responsibility boundaries | Boxes and arrows with a dashed boundary (required; see below) |

- Do not draw what reads better as text: a restated bullet list, a list of decided and open items, or a two-option comparison (use Before/After).
- Do not draw a figure that is really a table. For a pattern comparison, repeat the same drawing and highlight only what changes.
- About two to four figures per page. Explanatory structure diagrams do not count toward the limit of roughly five tables and five sections.
- Anything unconfirmed or inferred is drawn dashed and labeled as such inside the figure. A figure reads as certain even when the text hedges.
- A figure supports the text; do not delete the text because a figure now exists.
- For architecture and data flow, a figure is mandatory, one figure per point. Each diagram needs a boundary line for who owns what, a one-line role under every product name, a label on every arrow saying what flows, and, for readers used to another platform, the equivalent they know. Do not substitute a table, ASCII art, or prose.
- Use inline SVG with a `viewBox`, `<text>` for labels, one shared `<marker>` for arrows, and only the page's color tokens. Keep every shape inside the `viewBox`; the checker verifies this.

## Required checks

Run the static checker on every page, including pages produced by another generator:

```bash
node skills/create-html/scripts/check-html.mjs <file.html>
```

- It must print `OK`. Read the `WARN` lines too; a missing figure is a warning, not a pass.
- Name files explicitly. A shell glob that matches nothing can abort the command and look like a clean result.
- Do not edit generated HTML with regular-expression replacements. Nested tags stop non-greedy patterns early and silently unbalance the markup. Regenerate the page from its data instead.
- When reusing CSS from another page, copy only the rules, not the `<style>` tags around them.

Before delivery also:

- Confirm there are no secrets, credentials, private URLs, real IP allowlists, personal data, customer names, or internal-only identifiers unless the user explicitly supplied and authorized them for this output.
- Treat `noindex` and a hard-to-guess URL as discovery controls only, never as access control.
- Confirm images have useful `alt` text, links work, and `scrollWidth` does not exceed the viewport.
- Keep the page around 1 MB or less. Reduce the number of embedded images before their resolution; images meant to be read stay full width.

If the user also asks to share or publish the result, complete the HTML first, show any generated image for review, then use the repository's sharing workflow.
