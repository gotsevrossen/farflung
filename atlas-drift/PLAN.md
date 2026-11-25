# Atlas Drift implementation plan

Build an independent Farflung-inspired geography game with an atlas visual theme and fresh Purdue-generated expeditions. Original branding, UI copy, and question bank; no original code or game data is copied.

## Implemented in the first version

- World map with 195 selectable sovereign countries, zoom, pan, small-country markers, keyboard controls and a country-name selector.
- Five prompts per expedition, one country per prompt, distance scoring across five rarity levels, explanation and full answer reveal after each pin.
- Results at camp, per-round review, clipboard sharing and browser-local journal.
- Difficulty: borders, selected country names/search, and an optional 60-second deadline that continues across reloads.
- Handwritten practice bank, unlimited shuffled practice expeditions and a deterministic shared daily route with browser-local attempt tracking.
- Purdue AI mode: fresh generation for every new expedition, including all accepted countries, their point values, rules, explanations and suggested sources. No silent substitution of practice questions on an AI failure.
- Server-side validation and scoring. Answer tables are encrypted in an expedition token and do not appear in the public question payload.
- Responsive survey-chart interface (docked prompt panel, full-bleed map, light and dark themes), native dialogs, keyboard and pinch-zoom map controls, reduced-motion support and persistent progress.
- Map performance: pan/zoom bypass React rendering, the land layer is memoised and the costly SVG drop-shadow filter is gone. Map data repaired (antimeridian NaN and wedge artifacts) and trimmed to ~210 KB gzipped.

## Architecture

React + TypeScript via Vinext/Vite, deployed as a Cloudflare Worker with Sites. Version one uses encrypted game tokens rather than a database, and browser storage for progress and statistics. All Purdue requests happen on the server. The private hosted app's access boundary protects the account API key; rate throttling is best-effort per Worker isolate.

Generation is one batched request per expedition, validated against the question schema and canonical country registry. Prompt instructions require exhaustive answer sets and precise definitions. Each accepted country receives 500, 1,000, 2,000, 3,500, or 5,000 points. Rarity is an AI/editorial estimate, not observed player frequency. No assumption is made that an AI-supplied URL has been fetched or facts verified.

## Setup and validation

1. Configure the Purdue API key, exact model ID, and stable game secret.
2. Run type checking, scoring/validation/token tests, a production build, and HTTP checks of the actual API.
3. Exercise all five rounds, wrong answers, timeout behavior, reload, settings and narrow layouts where browser automation is available.
4. Publish the initial private version and verify the deployment status.

## Follow-on work

- Ground generation in a maintained geographic dataset or a curated Purdue Workspace knowledge base; independently verify answer completeness before publishing a competitive daily challenge.
- Add durable server storage for cross-device progress, globally enforced daily attempts, cached AI daily question sets, generation history, and distributed rate limits before public multi-user rollout.
- Add accounts, shared leaderboards and a moderated answer-correction workflow if desired. The original game's support/rulings service is not reproduced by a local report button.
- Expand the practice bank; the initial ten-question bank repeats over multiple games.

## Reference

Gameplay: https://farflung.game/how-to-play/

Purdue integration: https://docs.rcac.purdue.edu/services/genai/api/
