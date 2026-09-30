# Layout patterns

Choose the smallest pattern that explains the material. A page may combine two or three patterns, but every section must earn its space. As a rough limit, a page holds about five tables, two decorative figures, and five sections; past that the structure, not the content, is too heavy.

## Narrative brief

Use for reports, recommendations, and meeting summaries.

1. Hero: kicker, title, one-sentence purpose, date or scope.
2. Table of contents in two columns when the page is read before a meeting.
3. Main sections: one claim per section with evidence directly below it.
4. Closing: decision, conclusion, or next action only when the source material calls for it.

## Comparison

Use a table when the same fields repeat across three or more options. Put evaluation criteria in the first column and options across the remaining columns. Highlight one recommendation only when the source supports it.

Wrap every table in `.table-wrap`. On phones the delivered page folds a table with few columns into stacked cards automatically, so do not hand-write a second mobile-only markup for the same data.

## Timeline or workflow

Use an ordered vertical timeline for events, phases, or dependent steps. Each entry has a short label, a date or state when available, and no more than one compact paragraph.

In travel itineraries, use a "departure → arrival" range only for time spent moving. Show milestones such as arrival or a start time as single times; "9:40 → 10:00 office" reads as if the arrival were 10:00.

## Paired question and answer

Use a two-column pair when the page distinguishes source material from commentary, a problem from a response, or a request from a decision. On mobile, stack each pair while preserving its left-to-right reading order.

When the page advises on someone else's material, separate what they presented from your advice with more than one cue at once (position, label, and color), and keep the two sides of each question and answer next to each other. Do not add unrequested "next steps" or proposals.

## Before and after

Use this for any difference between two versions: a revision, an old and new edition, a draft and its final version.

- Previous version on the left, new version on the right, so the reader compares at the same eye level. Stack only below roughly 46 rem.
- Show the same scope on both sides: the whole paragraph that changed, plus the neighboring paragraph when references cross it, and the heading it sits under.
- Mark only the changed words. For a full rewrite, mark nothing and say so in the card heading. One change per card.
- Keep unchanged items around the change so the reader sees where it happens in the flow. For an added or removed item, leave the other side with an explicit "not present" note rather than closing up the rows.
- Compare layouts, pages, and slides with images of the real thing on both sides, not a description.
- Keep both sides on white. Role comes from the pill label and the border; a sunk gray surface makes the before side look disabled.

## Requesting a decision

- Put each decision inside the item it concerns, in a red `.decide` box with the options and a recommendation. Do not collect decisions in a summary table at the end; the reader goes top to bottom once.
- Put a `.h-judge` label ("Decision 2/4") on the smallest heading that directly contains the box, inline after the heading text. The label marks the location, the box holds the content.
- A short count in the lead ("four decisions, in the red boxes below") is fine.
- Include the real material the decision is about: the full paragraph for text, a rendered image for layout or visuals. Do not ask for a judgment from a description.

## Review checklist

For pages where the reader works through items in order, add a "reviewed" checkbox to each card's body (not its band), gray the card out when checked (`opacity: .4; filter: grayscale(1)`), and keep the state in `localStorage` under a page-specific key with stable `data-id`s. The checkbox only tracks reading position; the user's feedback in chat is what decides each item.

## Pages presented while talking

For a page shown on screen during a conversation, use one column read from top to bottom, keep reference material expanded rather than collapsed, and highlight at most two to four passages per section.

## Monthly calendar

Use a calendar, not a table, for any plan with dates: events, trips, deadlines, production steps, releases.

1. Weeks start on Monday.
2. One month per full-width block, months stacked vertically.
3. Entry names sit inside the day cells, not in a list below the calendar.
4. Do not merge several days into one entry, especially across a week boundary.
5. Weekends and public holidays get a light warm background, with the holiday name in small text.
6. When an empty stretch is deliberate, say so.
7. Generate the cells with a calendar library (for Python, `calendar.monthrange`); hand-written grids get the leading blanks or the numbering wrong.
8. Only put confirmed items on the calendar. On a calendar, a proposal looks decided.

Only days with entries get a tall cell. Use at most three chip styles (main event, deadline, tentative). Moving plans onto a calendar often exposes weekday mistakes in the source; report them rather than silently fixing them.

Use this class contract, because the delivered page folds the grid into a dated vertical list on phones and keys off these names:

- `.cal-grid` on the seven-column grid, starting on Monday
- `.dow` on the weekday header cells
- `.day` on every date cell, plus `.pad` for leading and trailing blanks and `.has` for a day that holds an entry
- `.dn` for the date number, with a nested `<i>` for the weekday letter
- `.chip` for each entry inside a day

Scope every calendar rule under `.cal-grid`; a bare `.day` or `.dn` selector collides with ordinary tables elsewhere on the page. A rule that hides the weekday letter (`.cal-grid .day .dn i`) also hides a holiday label written as `.cal-grid .dn .hol`; write `.cal-grid .day .dn i.hol` with an explicit `display`.

## Time-axis calendar

For two to five days shown with times (an itinerary, an event day), draw columns per day with time running down, like a calendar app's multi-day view, instead of a table with time slots as rows.

- Blocks are sized by duration, so gaps read as free time. Show the full 24 hours when there are night or early-morning items.
- Place blocks with custom properties: `top: calc(var(--s) / 1440 * 960px)` and `height: calc((var(--e) - var(--s)) / 1440 * 960px)` in a 960 px column, with grid lines every 40 px (one hour).
- Scope events as `.gc-col .ev`. A bare `.ev { position: absolute }` also hits a monthly calendar chip with the same class and stretches it across the grid.
- Paint background zones with opaque colors, not `rgba()`, so contrast checks match what the eye sees.
- Across time zones, use the local time of where the person is and note the other zone inside the block.
- Keep all day columns on phones by narrowing the time column and the event font.

## Schedule coordination

When laying out a schedule someone sent, show why it has that shape:

- Draw leave and non-working periods as hatched background bands, so a task that looks like two weeks reads as a few working days plus a break.
- When several lines of work must meet at a deadline, add a separate diagram showing which can move earlier and which cannot.
- Repeat the critical path as one horizontal chain, with fixed lead times labeled in days.
- Pick up conditional options hidden in the message ("if this is done by the 10th, we can also work on the 12th").
- Let bar labels wrap (`white-space: normal`, auto height). An ellipsis silently cuts off the long names only. Check that each bar's `left + width` stays within 100%.

## Key figures

Use metric cards only when the numbers are independently meaningful. Keep the number large, the label short, and the explanation to one line. Do not turn ordinary prose into artificial metrics.

## Content rules

- Preserve source attribution and distinguish observed content from inference.
- Keep headings concrete; avoid generic labels such as "Overview" when a more specific claim is available.
- Remove empty-state filler, decorative status badges, redundant navigation, and "next steps" the user did not request.
- When information is dense, use a short lead followed by a table or list. Do not solve density by shrinking text.
