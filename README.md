# MORI — a little life of its own

A pocket-companion **design concept** and a working, local-first web playground.
The site preserves the original sage/lime identity, CSS-layered pebble device,
and authored pixel creature. It adds a useful, human-confirmed focus ritual.

There is **no manufactured hardware, conversational AI, microphone connection,
account, payment, signup, external API, or cloud database**. Reactions are scripted.
The browser experience is not an installable/offline PWA.

## Run locally

Use Node **22.12+** (Node 22 LTS or newer) and npm. Run from this repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. The server binds only to the local machine.

```sh
npm run build       # Production assets → website/dist/
npm run preview     # Serve that build at http://127.0.0.1:4173
```

Stop the dev server before starting preview; both use port 4173.
Fonts are packaged and self-hosted, with no Google Fonts requests. Their OFL
copyright notices and license ship in `website/public/font-licenses.txt`.
No environment variables or secrets are needed.

## What works

- Adopt/rename a Mori (trimmed, nonblank, up to 20 characters); choose sage,
  cream, or lavender. The old `mori-name` value is migrated when available.
- Feed, pet, and play using either the illustrated device or the playground.
  Distinct expressions and varied authored lines add persistent bond points.
  Room details unlock at 5, 15, and 30 points. There is no decay or streak penalty.
- Name one task, choose **5 / 15 / 25 minutes**, then explicitly start.
  Pause/resume and cancel are available. A running session saves its absolute
  deadline; a paused session saves its remaining time. Reloading or returning
  from a background tab reconciles against the clock, not interval counts.
- At expiry, **you** decide whether the task is done. Only an explicit yes saves
  a win and adds five bond points. Confirmation and session removal are one
  atomic state write, so repeated clicks/reloads do not reward twice.
- The clearly labelled **10-second preview** exercises the same timer/check-in
  without ever adding a real win, focus minutes, or bond points.
- Keep up to **24 recent wins** (task, confirmation date, actual selected timer
  minutes, excluding paused time). Totals describe retained wins, not a lifetime
  tally. Forgetting a win removes its task/date/minutes but keeps earned bond.
  Reset requires confirmation and clears the entire local world and timer.
- Native accessible dialogs and FAQ disclosures, keyboard controls, focus
  indicators, and a reduced-motion mode without scroll/idle/reaction animations.

## Persistence & privacy

`mori-world-v1` in this origin’s `localStorage` contains the companion name,
shell, interaction counts, bond, active session, and recent wins. Data is local
to **this browser and this site origin**: localhost, preview deployments, and
production are separate worlds. Nothing synchronizes between devices.
Task text is rendered with `textContent` and is never sent over the network.

Storage is written only on user changes, startup/migration, and timer expiry,
not on countdown ticks. Invalid records are normalized or discarded with a
visible recovery message. When storage is blocked or full, the experience
continues in memory with an explicit **“only in this tab”** notice; a reload
may then lose unsaved changes. Clearing browser data also clears your world.
The timer uses the device clock, not a server; manually changing that clock
can change when a running timer ends. It does not send background notifications.

## Checks

```sh
npm test                         # 13 Node builtin domain tests
npx playwright install chromium # One-time browser setup, if needed
npm run test:browser             # Chromium end-to-end smoke checks
npm run check                    # State tests + build + browser checks
git diff --check
```

If Chrome is already installed, use it instead of downloading Chromium:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

The single browser spec covers adoption, text-injection safety, distinct
interactions, preview/reload, pause/resume, confirmed real wins, cancellation,
forget/reset, storage failures, keyboard dialogs, self-hosted assets, and
320 / 390 / 768 / 1440px layouts. A Playwright-controlled clock tests full
5-minute sessions without waiting in real time.

Optional review screenshots (the directory must already exist):

```sh
mkdir -p /tmp/mori-review
MORI_SCREENSHOTS=1 PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

These write `/tmp/mori-review/mori-desktop.png` and
`/tmp/mori-review/mori-mobile.png`. Test reports and screenshots are not source.

## Repository map

```text
website/index.html          Semantic page, forms, and native dialogs
website/src/main.js         DOM/controller and explicit user actions
website/src/state.js        Pure normalization, focus/reward, and bond model
website/src/storage.js      Optional local storage and truthful save status
website/src/device.js       Original layered device and scroll study
website/src/creature.js     Original pixel art and authored reactions
website/src/styles.css      Responsive design and reduced-motion behavior
website/public/favicon.svg Local artwork
tests/state.test.js         Pure behavior tests
tests/browser.spec.js       One proportionate browser smoke suite
```

`MORI-product-hardware-and-YC-research.md` and `MORI-hardware-concept.svg`
are planning references, not shipped product promises. They can stay in a
private source repository, but are excluded from Vercel uploads and builds.

The original `website/.git` was promoted to the repository root, preserving
commit `0a9b100`. The old built page remains available in that history.
`mori.tar.gz` and `website/.openai/hosting.json` remain on disk as historical
artifacts, but are excluded from new source commits and deployment uploads.
Never commit archives, `.openai`, `.vercel`, `.env*`, `node_modules`, build
output, or test artifacts.

## Deploy from the repository root

The root `vercel.json` explicitly selects Vite, `npm ci`, `npm run build`, and
`website/dist` as the output directory. Use this repository’s **root**, not
`website`, as the Vercel project root. No rewrites or external services are
required; navigation uses section anchors.

Only the generated static output is public. `.vercelignore` also excludes
private research, old hosting metadata, archives, local configuration, and
test artifacts from deployment uploads. Security headers disable microphone,
camera, and geolocation permissions.

GitHub and production deployment links will be documented after publishing
and verification. No production deployment is implied by a local build.
