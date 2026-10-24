# MORI — your AI, within reach

[Live site](https://mori-drab.vercel.app) · [GitHub repository (private)](https://github.com/HohJD/mori)

A quiet **voice and text workspace for AI**. One screen, one pixel Mori, three
provider choices, and a place to talk or type. Warm ivory/forest by day,
charcoal/lime by night. The detailed pocket-device **design concept** and local
companion/focus ritual live in their own views, not below a long marketing page.
The live URL above is the published site; local changes appear there only after
an owner-authorized deployment.

**AI needs owner unlock and a configured server route.** The linked Vercel
project has verified **OpenAI `openai/gpt-5.4-nano` through AI Gateway using its
OIDC identity**, without an additional OpenAI API key. This does not establish
Claude/Gemini availability or verify native browser voice. Unconfigured routes
truthfully show “Needs setup”; configuration alone never proves a connection
healthy, and Mori does not generate demo replies or fabricate usage. See
[AI connection setup and limitations](docs/AI_CONNECTIONS.md).

Mori uses provider APIs, **not** ChatGPT/Claude/Gemini app subscriptions or their
chat history. This first version supports three providers, not every AI agent.
There are no email/calendar tools, arbitrary account integrations, payments,
waitlist, cloud transcript database, or manufactured device. It is not an
installable/offline PWA.

## Run locally

Use Node **22.12+** (Node 22 LTS or newer) and npm. Run from this repository root:

```sh
npm ci
npm run dev -- --port 4175
```

Open **http://127.0.0.1:4175**. The server binds only to the local machine.
The Vite **dev** server includes same-origin `/api` middleware. An unconfigured
server is safe to explore: the console shows setup guidance, while the local
world, hardware studio, and themes work without secrets.

To enable AI, follow [docs/AI_CONNECTIONS.md](docs/AI_CONNECTIONS.md). The
one-time `npm run setup:ai` helper creates a private owner access code without
overwriting an existing private settings file. Keep the code **server-side**
and enter it only in Mori’s Settings dialog to unlock. Choose either route:

- **Linked Vercel project / verified OpenAI Gateway:** retain the owner code in
  `.env.ai.local` and explicitly opt in:
  ```sh
  MORI_GATEWAY_PROVIDERS=openai npm run dev -- --port 4175
  ```
  The server uses the linked project's OIDC identity, loaded privately from
  `.env.local` during local development and supplied by Vercel on deployment.
  This route uses `openai/gpt-5.4-nano`; **no additional OpenAI API key is needed**.
  OIDC presence alone does not opt a provider in. Local identity can expire;
  follow the connection guide for authorized refresh rather than exposing tokens.
- **Direct provider APIs:** configure the desired provider's API key and the
  owner code on the server, then use the normal dev command. A direct key always
  takes precedence for that provider; failures never trigger a different route,
  model, or paid provider automatically.

Only the OpenAI nano Gateway route is verified for the current account.
**Claude and Gemini still need their own direct keys**, unless the owner later
obtains eligible Gateway access and explicitly enables those providers. Their
Gateway models were denied by the current free-tier account. Gateway eligibility,
credits, and budgets can change; Mori does not purchase credits or upgrade plans.

No provider key entry belongs in the webpage. Do not paste real codes, keys, or
OIDC tokens into chat, source control, or public logs, and do not prefix server
secrets with `VITE_`. Consumer chat subscriptions and history do not automatically
connect through either route.

```sh
npm run build       # Production assets → website/dist/
npm run preview -- --port 4176 # Static build review only, NOT the local AI API
```

The package’s default dev/preview port is 4173; these explicit ports avoid
interrupting an unrelated project. Check listener ownership before reusing a port.
Use the dev server or the deployed serverless API for functional AI testing,
not Vite’s static preview.
Fonts are packaged and self-hosted, with no Google Fonts requests. Their OFL
copyright notices and license ship in `website/public/font-licenses.txt`.
The 3D studio uses exactly pinned **Three.js 0.186.1** and **GSAP 3.15.0**
(including ScrollTrigger). Software notices ship in
`website/public/software-licenses.txt`; GSAP uses its standard no-charge license.

## A small workspace

- **Talk** is the default view (`/`, `#talk`, or the legacy `#top`). The logo
  always returns here. Talk, the composer and Send fit the first screen, including
  a compact 320×568 window; there is no empty transcript panel before a reply.
- **Device** (`#inside`) and **Your world** (`#play`, with `#wins` for saved wins)
  are quiet header links, including on mobile. These are same-document hash
  views, not separate pages or a routing framework. Inactive views are natively
  `hidden` and `inert`: no home-page height and no stray keyboard stops.
- Fresh deep links, reload, and browser back/forward reveal the destination
  before scrolling. Navigation does not wait on fonts or 3D imports to scroll
  again later. An unknown hash safely shows Talk.
- **Activity** reveals exact models, response timing, replies and usage.
  **Settings** holds read-aloud, owner unlock/lock, AI connections and expandable
  help/privacy. The everyday screen has one human status, not a metrics dashboard.
  Native dialogs and the small disclosures support keyboard use and focus return.

### Talk, switch, do

- Provider selection, separate conversation
  logs, a multiline composer, clear connection states, and **New conversation**
  work with mouse, touch, or keyboard. Enter sends; Shift+Enter adds a line.
- **Write / Summarise / Plan** are the three common shortcuts. **More** holds
  **Ask / Translate / Explain**, the current mode’s help and **Use an example**.
  All six modes select real request instructions; examples fill an editable draft.
  Selecting an action or switching providers never sends a made-up request.
- **Talk** explicitly starts one turn of browser speech recognition, adds the
  final words to the draft, and sends to the selected, unlocked provider.
  Recognition ends before optional browser read-aloud begins. The mic does
  not restart after the reply. This is native browser dictation + text AI +
  speech synthesis, **not** a branded realtime voice session or paid speech API.
- Voice is capability-detected. Unsupported speech, denied microphone
  permission, no speech, and browser speech-network errors have typing fallbacks.
  No microphone is requested on load. Browser speech may process audio off-device.
- **Stop** appears while busy. It ends recognition and playback and aborts waiting
  for an AI request. Provider switching, New conversation, leaving Talk for
  another view, and leaving the page also cancel. Returning to Talk keeps each
  provider’s draft, mode and history in memory, without restarting or sending.
  Late/cancelled replies cannot appear in another provider’s chat or add metrics.
  Cancellation cannot guarantee that a provider has not already processed a request.
- The original illustrated three-button device is under **Try the three-button
  idea** in Device. **Stop/back · Talk · Switch agent** still work; Talk returns
  to the visible workspace before starting. Its screen follows assistant events,
  not companion/timer renders.
- **Settings → AI connections** checks server configuration. **Unlock Mori**
  appears on the locked workspace and opens the native owner form. It uses a server-set
  HttpOnly session cookie, and locks access again. The access code is never
  persisted in browser storage or echoed into the page. “Ready to try” means
  configured and unlocked, **not** verified healthy; only a received response
  earns “Replied this visit.” Expired access asks for a new unlock.
- **Activity** shows the selected model, completed replies this page visit,
  the last measured request-to-complete-response round trip (not first-token
  latency), and provider-reported tokens. Missing usage is unknown or explicitly
  incomplete, not zero. Partial responses are identified and not counted as
  completed replies. New conversation does not reset visit metrics.
- Messages are safe plain text with preserved line breaks, not rendered HTML or
  model-supplied markup. Configured message/count/total-character limits are
  checked before sending. Duplicate sends are blocked; requests time out after
  30 seconds. Errors keep the editable draft and offer manual retry, never an
  automatic switch to a different paid provider.

### Your little world

- Adopt/rename a Mori (trimmed, nonblank, up to 20 characters); choose sage,
  cream, or lavender. The old `mori-name` value is migrated when available.
- Feed, pet, and play using the **local habitat** controls.
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
- Native accessible dialogs and help disclosures, keyboard controls, focus
  indicators, and a reduced-motion mode without scroll/idle/reaction animations.
- Full light/dark palettes, with an accessible sun/moon action in the header.
  The first visit is light; an explicit choice is remembered separately
  from the companion. Resetting a Mori does **not** reset the theme.

## Inside the little device

The **Hardware studio** (`#inside`) is a design illustration, not manufactured
hardware, CAD, a production schematic, or a released BOM. Proposed parts are
grounded in the research document; fit, specifications, safety, and battery life
are not validated. Inspecting a proposed microphone or radio does not activate
anything; the independent web console can use browser voice only when invited.

- Native downward scroll moves through **assembled → opening → exploded
  inspection → closing → assembled**. Scrolling upward reverses the same absolute
  transforms. A scrubbed GSAP ScrollTrigger timeline controls a native sticky
  stage (420svh desktop / 380svh mobile); there is no wheel interception or
  scroll-jacking. Both closed ends have identical model and camera transforms.
- **Assembled** seeks to the closed end; **Exploded** seeks to the inspection
  portion. The labelled range also works with arrow, Home, and End keys. Selecting
  a component opens the model first, then highlights that actual part.
- All **16** numbered selectors expose a name, function, and proposed material:
  enclosure, bumper, lens, display/touch/flex, tactile buttons, PCB, compute/radio,
  motion sensor, microphone, physical mute, speaker/amplifier, haptics, protected
  battery, USB-C/power system, rear shell/lanyard, and assembly/fasteners.
  Small screens use the same complete native select and previous/next controls.
- **Look closer** isolates and enlarges the selected group, including its
  subcomponents. **See all parts** returns to the exploded view. The nearby
  **Back to Talk** link and sticky header always let you leave the study.
- The seed-shaped model, cutout enclosure, screen's original MORI pixels, board
  traces, chips, RF shield, metallic battery, speaker, ribbon cable, contacts,
  and fasteners are generated locally. Lighting uses a procedural room environment,
  not remote assets. Shell colors and both themes update the live scene.
- The inspector is initialized only when Device opens. Three.js, the model, and
  GSAP load only when that visible studio approaches the viewport. Talk and Your
  world never load them. Leaving Device removes its scroll trigger and cancels
  rendering, even if an import is still in flight. Returning reuses the inspector
  and scene, resizes, and safely refreshes a single active trigger.
  Rendering is demand-driven, stops offscreen/in a hidden tab, and caps pixel
  ratio at 1.7. Resize, theme, selection, and shell changes invalidate a frame;
  there is no endless GPU render loop. Geometry/material/texture resources and
  ScrollTriggers have explicit cleanup.
- Reduced motion shows a static exploded study with instant manual controls and
  no long pinned scroll span. Short windows use the same naturally flowing,
  manually inspectable layout rather than clipping the controls. Preference
  changes are supported while the page is open.
- Unsupported/lost WebGL or a failed lazy import keeps a detailed, local SVG
  study and the same component inspector available. The companion and timer
  and AI console do not depend on the 3D module loading.

## Persistence & privacy

AI conversations and drafts are kept separately per provider in **page memory
only**, with no persistence by default. A request sends that provider’s current
conversation to `/api/chat`, then to the selected provider from the server,
directly or through the explicitly enabled Vercel AI Gateway route. This app
does not store server transcripts; the provider and, when used, Gateway may
process or retain data under their own policies. No other model provider
silently receives a switched chat.
**New conversation** clears only the selected history and draft.

Browser recognition may send audio to the browser’s speech service. Read-aloud
uses browser speech synthesis, whose implementation depends on the browser.
Voice testing uses controlled fakes, never the user’s microphone.

`mori-world-v1` in this origin’s `localStorage` contains only the companion name,
shell, interaction counts, bond, active session, and recent wins. Data is local
to **this browser and this site origin**: localhost, preview deployments, and
production are separate worlds. Nothing synchronizes between devices.
Local focus-task text is rendered with `textContent` and is never sent to AI.
`mori-theme` contains only the explicit `light` or `dark` appearance preference.
It is not part of `mori-world-v1`; blocked storage still permits a temporary
in-memory theme choice, and an unchosen theme is always light.

Storage is written only on user changes, startup/migration, and timer expiry,
not on countdown ticks. Invalid records are normalized or discarded with a
visible recovery message. When storage is blocked or full, the experience
continues in memory with an explicit **“only in this tab”** notice; a reload
may then lose unsaved changes. Clearing browser data also clears your world.
The timer uses the device clock, not a server; manually changing that clock
can change when a running timer ends. It does not send background notifications.

## Checks

```sh
node --test tests/state.test.js   # Pure local-companion domain checks
npm run test:api                  # Server API tests; no paid inference
npm test                         # Both Node suites
npx playwright install chromium # One-time browser setup, if needed
npm run test:browser             # Starts an owned dev server on 4175 by default
npm run check                    # Node tests + build + browser checks
git diff --check
```

If Chrome is already installed, use it instead of downloading Chromium:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
# Or use a dev server you have already started and verified:
MORI_BASE_URL=http://127.0.0.1:4175 PLAYWRIGHT_CHANNEL=chrome npm run test:browser -- --workers=2
```

`MORI_BASE_URL` skips Playwright’s server startup, so the caller is responsible
for the specified server. The asset check compares the exact selected origin;
it does not allow third-party assets.

The browser spec adds **mocked API-contract checks** for missing setup,
unlock success/failure/expiry/lock, mode payloads, provider-isolated histories,
plain-text replies, real-response metrics, unknown/partial usage, new chat,
limits, retry, network errors, and cancellation even when a stale transport
ignores abort. Injected Web Speech fakes verify explicit start, one-turn final
transcripts, read-aloud, stop/switch/view-exit/pagehide cleanup, unsupported browsers, and
permission/no-speech/network errors. **These do not verify actual provider
inference, model availability, real microphone permissions, or device audio.**
A separate, bounded owner-approved **UI integration check** verified unlock,
one real OpenAI nano Gateway reply with positive reported usage/timing, and
provider-isolated history when switching to unavailable Claude and back. It
used the linked project's OIDC identity, not an additional OpenAI API key.
That evidence is specific to this route and account, not all providers or future
availability. Native microphone permissions and device audio still need a
separate explicit real-device check; no paid provider request is needed for the
automated suite.

Retained tests cover adoption, text-injection safety, distinct
interactions, preview/reload, pause/resume, confirmed real wins, cancellation,
forget/reset, storage failures, keyboard dialogs, self-hosted assets, and
320 / 390 / 768 / 1440px layouts in both themes (including 320×568 first-screen
controls). View checks cover hidden content/tab order, progressive disclosure,
deep links, reload/back/forward, retained drafts and cancelled hidden voice.
Hardware checks exercise actual WebGL draws and
mesh transforms (including identical closed renders and reverse scroll), all
16 selectors, isolated close-ups, short mobile windows, live reduced-motion
cleanup, theme/shell sync, AA UI text contrast, system/blocked-storage preferences,
and import/context-loss/unsupported-WebGL fallbacks. A Playwright-controlled
clock tests full 5-minute sessions without waiting in real time.
For resource-constrained machines, append `-- --workers=2` to the browser command.

Optional review screenshots (the directory must already exist):

```sh
mkdir -p /tmp/mori-simple-review
MORI_SCREENSHOTS=1 PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

These write `/tmp/mori-simple-review/mori-desktop.png` and
`/tmp/mori-simple-review/mori-mobile.png`. Test reports and screenshots are not source.

## Repository map

```text
website/index.html          Semantic page, forms, and native dialogs
website/src/main.js         DOM/controller and explicit user actions
website/src/navigation.js   Hidden hash views, anchors, disclosure focus handling
website/src/assistant.js    Provider-isolated chat, connection gate, metrics
website/src/voice.js        Cancellable one-turn native browser speech
website/src/assistant.css   Quiet workspace, responsive controls, Settings/Activity
website/src/state.js        Pure normalization, focus/reward, and bond model
website/src/storage.js      Optional local storage and truthful save status
website/src/device.js       Original interactive device, now disclosed in Device
website/src/hardware.js     Lazy studio controller, GSAP timeline, inspector
website/src/hardware-model.js  Procedural Three.js parts, lighting, disposal
website/src/hardware-fallback.js  Detailed local SVG alternative
website/src/hardware-parts.js  Shared proposed-component descriptions
website/src/hardware.css    Responsive sticky studio and static alternatives
website/src/theme.js        Persisted light/dark theme controller
website/src/theme.css       Full light/dark palettes and component overrides
website/public/theme-init.js  Blocking pre-paint appearance bootstrap
website/src/creature.js     Original pixel art and authored reactions
website/src/styles.css      Responsive design and reduced-motion behavior
website/public/favicon.svg Local artwork
tests/state.test.js         Pure behavior tests
tests/browser.spec.js       UI/voice contract tests + hardware/theme/local world
server/                    Server-only configuration, sessions, provider adapters
api/[route].js             Serverless API entry
scripts/dev-api.mjs        Same-origin Vite dev API middleware
docs/AI_CONNECTIONS.md     Private owner setup, API behavior, limitations
```

`MORI-product-hardware-and-YC-research.md` and `MORI-hardware-concept.svg`
are original planning references, not shipped product promises. The current
voice-first mission supersedes their older focus-first recommendation without
rewriting the original research. They can stay in a
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
`website`, as the Vercel project root. The deployed same-origin `/api` routes
are also required for AI. Navigation uses section anchors.

The generated web assets and API routes are public endpoints; provider secrets
remain server-only and AI requests require the owner’s configured access gate.
`.vercelignore` also excludes
private research, old hosting metadata, archives, local configuration, and
test artifacts from deployment uploads. Security headers allow microphone use
only for this origin and disable camera/geolocation. A successful static build
is not evidence that AI credentials are configured or that inference works.

The Vercel project `hohjds-projects/mori` is connected to `HohJD/mori`.
Pushes to `main` deploy to production at https://mori-drab.vercel.app.
