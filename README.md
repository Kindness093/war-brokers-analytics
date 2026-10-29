# War Brokers Analytics

An unofficial community weapon-analysis site using Canadian English and a shared charcoal, red, orange and yellow visual system. The armoury contains 23 main weapons, organised into collapsible groups. Other weapon slots have reference lists; player and leaderboard pages retain their planned-feature content.

## Run locally

Node.js 20+ and Python 3 are required for building; there are no package dependencies.

    npm start

Open http://localhost:4173/ . Keep the process running for local daily collection. Set `WB_DISABLE_SCHEDULER=1` for a preview without collection. The server binds to loopback.

## Weapon data and models

`data/weapons.json` contains weapon reference facts and range values. All 23 wiki range-chart images were visually inspected on October 29, 2026. Exact image URLs and transcriptions are in `data/wiki-range-chart-sources.json`; original research images and attribution are in `research/range-charts/`. Numeric falloff follows the labelled endpoints and straight lines on these charts. These are wiki reference values, not a current game-build audit.

Shotgun damage curves describe full nine-pellet volleys. Probabilities use a manual independent-pellet scenario; API hit/fired ratios are not applied as pellet probabilities. Crossbow has no headshot bonus. Sniper Rifle predictions stop at the chart's 1219.2 m projectile limit, before its theoretical damage plateau. Launcher graphs measure distance from an explosion, not shooter range. Grenade Launcher graph maximum (125) and infobox person damage (130) are recorded separately. Rifle-style TTK and engagement probabilities are suppressed for explosives.

Health is fixed at 375 HP. Charts support two axes, selectable point data, ten-decimal hover values, source-based falloff, and non-overshooting interpolation of dense calculated TTK values. STK jumps remain. The first shot occurs at time zero; uniform firing excludes projectile travel. Burst timing, attachments, target movement, correlated spread and shell-by-shell reloads are not verified.

Engagement outputs include time-target kill probability, one-magazine probability, median/90th-percentile TTK, expected shots to kill including misses, expected kills per magazine, required accuracy for a target mean TTK and aim-improvement benefits. Magazine size is editable and updates magazine probabilities, kills and reload-aware timing. Each kill resets the target and discards overkill. Reload duration replaces the normal firing gap at a magazine boundary. Quantiles exceeding 20,000 shots are unavailable rather than extrapolated.

## Accuracy collection

The public API has individual profiles and rankings, not a complete bulk player dump. Collection enumerates four public lifetime rankings, deduplicates UIDs, fetches profiles at five-second intervals and calculates equal-player means for every weapon from each response. Missing/impossible counters are excluded; measured zero accuracy remains valid. UID inputs deduplicate and average successful lookups automatically.

At midnight UTC a local running server starts or resumes collection. Progress and the last completed baseline persist in `.data/`, which is ignored by Git and excluded from the deployed site. Public rate limits mean a full ranking-discoverable census may take multiple days. It cannot guarantee every registered player or a freshly completed census each day. Previous completed averages are retained. AR temporarily defaults to the owner's supplied public player accuracy/headshot rates; other weapons default to explicit manual aim settings until their own averages exist.

The hosted site uses GitHub Pages with direct browser WBAPI lookups, subject to CORS, availability and the same public rate limit. `.github/workflows/daily-accuracy.yml` runs at midnight UTC (GitHub scheduling may delay it), resumes checkpointed collection for up to about 4h50 per run, caches private working state, and commits only completed numerical aggregates. Large censuses can span many daily runs. The Pages workflow republishes the latest aggregate; it never publishes the UID enumeration/checkpoint. GitHub Actions caches should not contain secrets.

## Editing and deployment

- `templates/weapon.html`: shared weapon markup.
- `weapon-page.mjs`: shared interactions.
- `ar-page.css` and `theme.css`: styling.
- `combat.mjs` and `weapon-engine.mjs`: calculation models.
- `scripts/build-weapons.py`: generates all weapon pages and the armoury.
- `scripts/build-static.mjs`: packages only public site files into `_site/`, supporting GitHub project subpaths.

Build with `node scripts/build-static.mjs`. Run checks with `npm test`. `.github/workflows/pages.yml` tests, builds and deploys through GitHub Pages on pushes to main and after collection workflows complete.

Use Canadian English in site copy (armoury, colour, centre, labelled, modelled); preserve standard HTML/CSS/API identifiers. Documents use en-CA.
