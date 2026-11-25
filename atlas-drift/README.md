# Atlas Drift

A map-based geography game inspired by Farflung. Five prompts, one pin per prompt, and more distance for less obvious correct answers. Includes unlimited Purdue-generated expeditions, a practice bank, a daily trail, difficulty controls, answer review, sharing, saved progress, and browser-local statistics.

## Run locally

Requires Node 22.13+.

```powershell
npm install
npm run dev
```

Open the Local URL printed by the server (normally http://localhost:5173).

## Connect Purdue GenAI Studio

1. In https://genai.rcac.purdue.edu, open Settings → Account → API Keys and create a key.
2. Copy `.env.example` to `.dev.vars`. Add the key and the **exact API model ID** your account can access. Purdue documents `GET https://genai.rcac.purdue.edu/api/models` for model discovery.
3. Set `GAME_SECRET` to a stable random string of at least 32 characters. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
4. Optionally set `GENAI_BACKEND=vllm` or `ollama` according to the model's serving backend; this requests schema-constrained output. Omit it for prompt-only JSON output, which is still validated.
5. Restart the dev server. The footer will show the connection is configured and the Purdue AI guide will become selectable. This status means configuration is present; a successful generated expedition confirms API access.

For the hosted app, set these same names as production runtime secrets with Sites. Local files are not uploaded. Do not put keys in client code or commit them. See [Purdue's API guide](https://docs.rcac.purdue.edu/services/genai/api/).

Each new AI expedition calls Purdue once to generate five prompts and the complete accepted-country/point lists. Invalid JSON, unknown or duplicate countries, unsupported point values and missing top-tier answers are rejected. A failed generation displays an error and can be retried; it does not silently start a practice game. Purdue may return JSON `null` for rate limits; this is handled explicitly.

## Checks

```powershell
node node_modules/typescript/bin/tsc --noEmit
node scripts/test.mjs
npm run build
```

## Files

- `app/page.tsx`: game flow, home/game/results panels, dialogs.
- `app/world-map.tsx`: the SVG map. Pan, zoom and pinch write transforms straight to the DOM (no React re-render per frame); the land layer is memoised; the view fits the accepted answers on reveal.
- `app/country-search.tsx`: accessible country combobox (aliases, accents and keyboard support).
- `app/globals.css`: design tokens (OKLCH, light and dark), layout and motion.
- `app/api/`: configuration status, game generation and scoring endpoints.
- `lib/expedition.ts`: Purdue requests and authenticated encryption of answer tables.
- `lib/game.ts`: validation, deterministic daily selection, scoring rules and tier colours.
- `lib/bank.ts`: ten original practice prompts.
- `PLAN.md`: architecture, implemented scope, and remaining production work.

## Limitations

AI-generated facts, source URLs and completeness of answer lists are not independently verified. Rarity values estimate how unexpected an answer is; they do not use actual player data. Daily mode uses the curated bank and repeats over time. History and daily attempt restrictions apply to the current browser, not an account. Saved games expire after seven days; rotating the game secret invalidates them. The clock is enforced by the browser and is not suitable for a competitive leaderboard. API throttling is isolate-local, not distributed. Keep the hosted app private until durable access controls, rate limiting and factual grounding are in place for any broader audience.

Map boundaries are illustrative and do not adjudicate sovereignty. Country selection uses the 193 UN member states plus Palestine and Vatican City. Territories represented on the map are mapped to their parent country where supported; disputed/unrecognized regions are not selectable. Microstate dots and the country selector provide access to countries too small for this map resolution.

## Data attribution

- World shapes: [world-atlas](https://github.com/topojson/world-atlas), ISC license, derived from public-domain [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). Bundled as `public/world.json`.
- Country registry: [mledoze/countries](https://github.com/mledoze/countries), ODbL-1.0. The derived country registry remains available in `lib/countries.json` under ODbL-1.0; see `DATA-LICENSE.md`.
- Typefaces: Bricolage Grotesque and Geist Mono, self-hosted via Fontsource, under the SIL Open Font License. System-font fallbacks are included.
- This is an independent project; it is not affiliated with Farflung LLC or Purdue University.
