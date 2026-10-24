# MORI: product, hardware, and YC research

Research date: 24 October 2026. Prepared for the AI-agent Tamagotchi concept in this chat.

**Recommendation:** build a small, camera-free, expressive companion for adult students and desk workers. Its first useful job is helping someone begin and finish a focus session. Its emotional appeal comes from persistent personality, small shared memories, tactile interaction, and a miniature world that develops through use.

This is a product and engineering feasibility brief, not a completed electrical design, factory quotation, market-size study, or guarantee of YC admission. Competitor specifications are manufacturer claims, not independently tested performance. All proposed dimensions, budgets, metrics, and schedules below are planning assumptions unless explicitly sourced. Research uses public manufacturer, government, and YC materials; it does not include customer interviews or hands-on hardware testing.

## 1. What exists today

The working landing page is stored in `outputs/mori/dist/index.html` within this chat's workspace. It is a buildless HTML page containing CSS, JavaScript, inline SVG character art, a CSS 3D layered device, and scroll animation. Naming is saved in browser local storage. Feeding, petting, and playing use scripted responses.

There is currently no conversational model connection, hardware firmware, CAD, PCB, shared account, cloud memory, payment flow, or manufacturing-ready device. The illustrated enclosure is an artistic concept. It does not establish that its internal geometry or components will fit.

The hosted version is [MORI](https://mori-pocket-soul-jiada.eager-snipe-8751.chatgpt.site), currently owner-private. Do not treat visits to this private page as market validation.

## 2. The opportunity and the hard question

“A cute object that talks with AI” is already a category. The opportunity is to create a repeatable relationship and useful ritual that survives beyond the first week.

Proposed initial customer: adults who already enjoy cozy games, desk collectibles, or virtual pets and struggle to start self-directed work. Recruit narrowly from one community first. Do not assume everyone who likes the design will pay for hardware or subscribe.

Proposed job: “Help me start the task I keep putting off, stay with me quietly, and make finishing feel good.” This is a product hypothesis, not an established productivity or mental-health benefit.

Candidate positioning:

> MORI is a pocket AI companion that remembers your small wins and turns focused work into a shared adventure.

The useful loop is: tell it one intention → it proposes a short session → you approve → it quietly works alongside you → you report completion → you both earn a small story moment. A standalone timer can do the timing; MORI has to prove that the character and memory improve repeat use enough to justify the device.

A broader company could eventually sell a persistent character system across pocket devices, desktops, and licensed physical characters. That expansion is a hypothesis. Start by proving one companion is wanted; a platform is premature before that.

## 3. Competitive landscape

| Product | What its maker describes | What MORI should learn | Differentiation to test |
|---|---|---|---|
| Tamagotchi Paradise | Zoom-based care, many possible creatures, device-to-device docking interactions | Growth, discovery, collecting, and rituals can create depth without open-ended chat | Personal memories and useful collaboration, while keeping an actual game loop |
| LivingAI AIBI | Portable companion, facial recognition/photos, offline commands, online Q&A, weather and reminders | Portability plus AI conversation is already offered | Camera-free design, instant local reactions, a specific repeatable daily use |
| LivingAI EMO | Desktop movement, touch, expressive reactions, voice and camera features | Embodiment and animation are substantive product features | Pocket size and lower mechanical complexity; do not compete on locomotion |
| EnergizeLab Eilik | Touch and vibration responses, expressive face, motorized body | Timing, animation, and physical feedback can be delightful before adding an LLM | Memory that changes future interactions and a useful focus ritual |

Sources: [Tamagotchi Paradise](https://tamagotchi-official.com/jp/series/paradise/), [AIBI](https://living.ai/aibi/), [EMO](https://living.ai/emo/), [Eilik](https://www.energizelab.com/eilik/).

Price anchors observed in LivingAI's store: AIBI Pocket **US$249**, EMO **US$279**, and EMO GO HOME **US$369**. These are displayed prices, not landed UK prices; discounts, shipping, and taxes may differ. These establish competitors' asking prices, not MORI's willingness-to-pay. [LivingAI store](https://living.ai/store/)

Bandai's original Japanese Paradise announcement lists an approximately 73 × 76 × 31.5 mm body. Eilik's official page lists a 108 × 105 × 133 mm body and 230 g weight. They illustrate two different choices: portable toy versus desk robot. MORI should choose the portable category deliberately. [Bandai launch specification](https://www.bandainamco.co.jp/files/E38090WEBE383BBHDE585B1E69C89E38091E38397E383ACE38.pdf), [Eilik specifications](https://www.energizelab.com/eilik/)

Do not claim a defensible advantage from “better design” alone. Test whether memory, personality, or tactile presence causes more retained use than a scripted pet and a phone-only version. A commodity language model and an ESP32 are not a moat.

## 4. What MORI should look and feel like

Keep the existing sage/lime art direction, but evolve the shell into an original asymmetric pebble or seed rather than copying another company's recognizable enclosure, characters, or interface. MORI is a working name; trademark and industrial-design clearance remain open.

**Industrial-design targets, subject to CAD and component fit:** approximately 75 × 65 × 28 mm; under 100 g; 1.69–1.9-inch color display; rounded perimeter; recessed lens; three tactile buttons; small lanyard attachment; USB-C at the bottom; physical microphone-mute switch on the side. A flat back or removable passive stand lets the same object live on a desk.

Use a matte PC/ABS shell with a replaceable silicone bumper. Avoid specifying a soft-touch coating before checking abrasion, oils, aging, and cleaning performance. Start with sage; make cream and lavender later only if demand justifies inventory. Use screws for prototype assembly and service access. Battery replacement should be a planned service operation, not require destroying the shell.

The screen should depict a creature living in a room, not only two eyes on black. Its room is the visible record of your shared history: a little desk, a plant, a souvenir from a completed project. A small number of meaningful objects is more legible than an inventory packed with decorations.

Design the front and back together. Leave room for the speaker cavity, microphone port and acoustic gasket, PCB antenna keep-out, battery expansion allowance, fasteners, strain relief, and regulatory markings. Keep metal, magnets, and the battery away from the antenna's required clearance. A rendering cannot substitute for this packaging work.

**On-device interaction:** left = back/cancel; center = select/pat, hold to talk; right = next/play. Label the hold-to-talk gesture during onboarding. Touch is a bonus, not the only way to operate the product. A hardware mute should physically disable the microphone signal or supply, with a state indicator that matches actual recording capability.

## 5. How to make it cute and fun

Cuteness needs behavioral authorship. Random chat and a large animation count are insufficient.

| Trigger | Character response | Implementation |
|---|---|---|
| Pick up | Looks upward, blinks, steadies itself | IMU event plus authored animation |
| Pat | Leans into touch, closes eyes, tiny purr pulse | Touch/button event and haptic pattern |
| Begin focus | Pulls out a tiny notebook and sits beside you | Local timer and focus animation |
| Finish a task | Celebrates the specific accomplishment | Verified completion event plus optional short AI line |
| Return after an absence | Welcomes you warmly, shows a harmless discovery | Local elapsed-time event; no guilt penalty |
| Set it in its stand | Makes a little nest and rests | Manual sleep or later dock detection |
| No network | Keeps playing and timing; explains that conversation is unavailable | Offline state machine |
| Low battery | Gets sleepy and asks for charging clearly | Fuel-gauge threshold; never confuse mood with battery |

Start with 12–16 well-made states: idle, curious, happy, shy, sleepy, listening, thinking, speaking, focused, celebrating, surprised, offline, charging, and low battery. Give each a clear silhouette and transitions. Use a small anticipation movement before a larger reaction, short pauses, eye direction, and rare surprises. Schedule quiet-time behavior so it never becomes a notification machine.

A proposed reaction budget: local acknowledgment within 100 ms; begin the appropriate visible reaction within 150 ms. These are engineering targets to measure, not measured results. Never wait for a network round trip to acknowledge a pat.

Use a stable character profile: for example, curious, gently mischievous, fond of tiny rocks, and a little proud of badly drawn maps. Tone can vary with state; core traits should not randomly change each conversation. Growth should reveal preferences and animations, not make the pet abruptly unrecognizable.

Three small games are enough for the first prototype: a tilt-controlled seed-catching game, a three-button rhythm game, and hide-and-seek inside the room. Keep rounds under about a minute. Reward participation without daily streak anxiety. Do not make the pet die, become ill, or claim suffering because someone was busy or stopped paying.

Use short creature sounds for ordinary interaction and optional intelligible speech for useful conversation. Avoid voice on every action. Add a quiet mode and adjustable volume. If testing shows the creature is more charming without human speech, preserve that option.

## 6. Functionality: what to build first

| Capability | First prototype | Later, only after evidence |
|---|---|---|
| Offline personality | Authored animation, games, simple state, sound | More environments and seasonal stories |
| Memory | Explicitly saved name, preferences, active goal, recent wins | Cross-device continuity and richer retrieval |
| Conversation | Push-to-talk, short turns, transparent network status | Wake word and better interruption handling |
| Useful agent action | Propose/start/cancel a local focus timer; store an approved goal | Calendar read access, then narrowly approved writes |
| Progress | A room object or story event earned from a real completed session | Cooperative quests |
| Setup | Phone-assisted Wi-Fi provisioning; clear reset and recovery | Better account migration and multi-device setup |
| Privacy | Hardware mute, memory view/edit/delete, short retention | Export and additional region controls |
| Social | None needed to validate first product | Mutual opt-in companion visits and moderated sharing |

The distinction between an agent and a chatbot is a bounded action loop. Example: “Help me start my essay” → ask for one concrete milestone → propose 15 minutes → obtain confirmation → start a timer → check back once → save completion if confirmed. Use typed tool calls such as `propose_focus`, `start_timer`, `cancel_timer`, and `remember_preference`. Validate arguments and permissions in application code. Do not give an LLM direct GPIO, firmware-update, payment, or arbitrary messaging access.

Defer cameras, motors, GPS, cellular, health monitoring, a public marketplace, and unrestricted third-party agents. These multiply power, manufacturing, privacy, and support requirements without establishing the core relationship.

## 7. Hardware strategy

### Prototype A: validate touch, character, and focus

Use **Waveshare ESP32-S3-Touch-LCD-1.69** plus a printed shell. Its official repository describes 16 MB flash, 8 MB PSRAM, a 240 × 280 display, capacitive touch, an IMU, an RTC, and battery management. This is a practical integrated starting point. [Waveshare official hardware/software repository](https://github.com/waveshareteam/ESP32-S3-Touch-LCD-1.69/)

Verify the exact board revision and schematic before ordering or wiring. Waveshare documentation contains CST816D/T references; do not assume every batch has identical touch hardware. Start from the BSP and demo for the purchased board. The onboard buzzer is not a general-purpose speech playback system. [Waveshare wiki](https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-1.69)

Begin USB-powered. Add a supplier-documented protected battery only after checking the connector polarity, maximum charge current, cell capacity, thermistor arrangement, and board power behavior. Do not add a second charger in parallel with an onboard charger.

### Prototype B: validate voice independently

Use **ESP32-S3-Korvo-2** with its supported audio stack and display option on the bench. It has two microphones and is intended for voice-interface development. Treat it as an audio proof of concept, not a board guaranteed to fit the proposed shell. [Espressif Korvo-2](https://www.espressif.com/en/dev-board/esp32-s3-korvo-2-en)

The **XIAO ESP32S3 Sense** is another small experimental board: the manufacturer lists a microphone, 8 MB PSRAM, 8 MB flash, and a US$13.99 price. It is not a complete pet: display, speaker system, power design, and interface pin planning remain. Its camera is unnecessary for this concept. [Seeed product](https://www.seeedstudio.com/XIAO-ESP32S3-Sense-p-5639.html)

A Raspberry Pi Zero 2 W can accelerate a Linux prototype if that matches the team's expertise, but its 65 × 30 mm board, Linux storage/boot, and power integration require a separate packaging assessment. Its 512 MB RAM is not a reason to promise a capable local conversational LLM. Prefer ESP32 for the eventual low-power character device. [Raspberry Pi specifications](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)

### Integrated custom PCB: candidate parts, not a released BOM

| Subsystem | Proposed choice | Purpose and integration work |
|---|---|---|
| Controller/radio | ESP32-S3 module variant with approximately 16 MB flash and 8 MB PSRAM | Local graphics/audio/networking. Verify exact order code, reserved memory pins, module footprint, antenna requirements and lifecycle |
| Display | 1.69–1.9-inch ST7789-family IPS module, around 240 × 280 | SPI graphics, controllable backlight; select actual FPC, glass dimensions and supplier |
| Touch | Controller supplied with chosen display, or separate capacitive pad | Petting and menu interaction; test bumper thickness and moisture effects |
| Motion | BMI270 candidate; use onboard QMI8658C in the Waveshare prototype | Pickup/tilt detection; interrupts, orientation calibration and low-power mode |
| Microphone | Infineon IM69D128S PDM candidate | One near-field mic for push-to-talk; port, gasket, clocking and acoustic tests |
| Speaker output | MAX98357A I2S class-D amp plus matched miniature speaker | Choose impedance/power rating to actual supply and cavity; volume-limit in firmware |
| Haptics | DRV2605L plus a matched LRA | Gentle purr and acknowledgment; calibrate drive voltage and resonant behavior |
| Battery | Supplier-documented protected 1-cell Li-ion/polymer, initially 800–1,200 mAh target | Exact cell shape, discharge rate, protection and temperature sensing remain to be selected |
| Charging | BQ24074-class power-path charger, or a reviewed newer alternative | Run while charging, current limits, NTC and thermal design |
| Regulation | 3.3 V buck-boost regulator chosen after load measurements | Maintain rail as cell falls below 3.3 V; handle radio/audio peaks |
| Fuel gauge | MAX17048 candidate | Useful state-of-charge indication; tune against selected cell |
| Physical input | Three switches plus hardware mic mute | Debounce, tactile feel, accidental-pocket activation prevention |
| USB/power protection | USB-C receptacle, correct sink configuration, ESD and input protection | Proper current limits and cable compatibility; verify USB-C implementation |
| Assembly | Main PCB, lens, bumper, screws, speaker seal, wiring/FPC | Mechanical tolerance stack, service access, test pads and provisioning fixture |

Supporting component sources: [ESP32-S3 module datasheet](https://documentation.espressif.com/esp32-s3-wroom-2_datasheet_en.html), [BMI270](https://www.bosch-sensortec.com/en/products/motion-sensors/imus/bmi270), [IM69D128S](https://www.infineon.com/part/IM69D128S), [MAX98357A](https://www.analog.com/en/products/max98357a.html), [DRV2605L](https://www.ti.com/product/DRV2605L), [BQ24074](https://www.ti.com/product/BQ24074), [MAX17048](https://www.analog.com/en/products/max17048.html).

A specific sourcing finding: Infineon marks **IM69D130 “not for new design”**, whereas IM69D128S is shown as active/preferred. Avoid inheriting an old microphone choice from a hobby tutorial without checking lifecycle. [IM69D130 status](https://www.infineon.com/part/IM69D130), [IM69D128S status](https://www.infineon.com/part/IM69D128S)

No pin-by-pin production wiring is specified here: the final module SKU, display, board revision and audio architecture are not selected. Assigning GPIOs before resolving those choices would create false precision. Before PCB layout, make a resource table covering SPI, I2C addresses, PDM RX, I2S TX, interrupts, USB, boot straps, PSRAM/flash-reserved pins, and debug access. Validate concurrent audio and display transfers on the bench.

### Electrical architecture

```text
USB-C 5 V ── input protection/current limits ── power-path charger
                                                   │       │
                                              system rail  protected cell + NTC
                                                   │
                                       regulated 3.3 V / switched loads
                                                   │
                                               ESP32-S3
                   ┌────────────────┬──────────────┼──────────────┐
              SPI display      I2C sensors      PDM mic       I2S amplifier
              PWM backlight    touch / IMU      hardware       miniature speaker
                               gauge / haptic  mute
```

This is a functional block diagram. Rails and component voltages must be checked against the selected datasheets; it is not a schematic. Do not connect the speaker's class-D negative terminal to ground unless the selected amplifier explicitly requires it.

### Battery math before making promises

A 1,000 mAh, 3.7 V nominal cell stores approximately 3.7 Wh. Assuming 80% usable energy after conversion and operating limits gives roughly 3.0 Wh.

| Assumed average system load | Calculated runtime |
|---|---:|
| 0.25 W | About 12 hours |
| 0.50 W | About 6 hours |
| 0.80 W | About 3.75 hours |

These are scenarios, not measurements. Screen brightness, Wi-Fi duty cycle, speaker level, and sleep behavior dominate. Measure screen-on play, voice conversation, idle, deep sleep, charging, and peak radio+audio load separately. All-day standby is a different claim from all-day continuous use. The first product can be desk-first with a convenient charging habit while pocket endurance improves.

## 8. Software architecture and how it actually works

**Device:** ESP-IDF/FreeRTOS firmware; a display renderer using the selected board's supported graphics stack; a deterministic character state machine; local timers; sensors; audio capture/playback; power management; persistent settings; authenticated networking; and recoverable OTA updates. Freeze compatible dependency versions once the board demo works.

**Phone companion:** provisioning, account/device ownership, Wi-Fi changes, quiet hours, memory inspection/deletion, optional text input, and explicit approvals for connected services. A mobile web page alone should not be assumed to provide reliable background BLE or universal provisioning support; validate the chosen mobile platform. At-home Wi-Fi is the initial online mode. Away from Wi-Fi, MORI stays an offline pet unless a tested phone bridge or hotspot is available. BLE is not itself internet access.

**Backend:** device authentication → speech transcription → structured memory retrieval → character prompt/model → validated response and optional approved tool action → speech synthesis and animation cue. Keep model-provider keys on the backend. Use short-lived device/session credentials and per-device authorization, not a shared secret embedded in every unit.

Prefer a push-to-talk, half-duplex first release. Suppress microphone input during speech playback. Full-duplex interruption, echo cancellation, and wake words are separate audio-engineering projects. Espressif provides an audio front end, wake-word and command recognition tooling, but those do not constitute general offline conversation. [Espressif ESP-SR](https://docs.espressif.com/projects/esp-sr/en/latest/esp32s3/esp-sr-en-master-esp32s3.pdf)

**Local/cloud split:** local code owns moods, rewards, inventory, timers, and safety limits. Cloud inference supplies short conversation and proposes allowed actions. A network outage must not freeze the face or erase progress.

Example response contract:

```json
{
  "say": "One paragraph. Fifteen minutes. I'll bring my tiny notebook.",
  "expression": "encouraging",
  "animation": "open_notebook",
  "proposed_action": {"type": "start_focus", "minutes": 15},
  "requires_confirmation": true
}
```

Parse against a strict schema; allowlist animation IDs and tools; clamp duration/volume; reject unknown fields/actions. Confirm before changing a user's plans. Timer creation must have a unique action ID so retries cannot create duplicates. Record completed actions separately from conversational suggestions.

**Memory model:** store user-approved facts with source, timestamp, confidence, and deletion controls; store compact summaries of actual shared events; keep character traits separate. A generated fictional story must never become a false memory about the user. Ask whether to remember sensitive personal information rather than silently storing it. Minimize transcript retention and document actual provider retention settings before launch.

**Latency targets:** local acknowledgment under 100 ms; cached expressions never block on the network; aim for cloud first audio within 2–3 seconds on good Wi-Fi. Benchmark median and p95 in real homes. Play a short thinking animation during a delay, then fail gracefully rather than indefinitely spinning.

**Updates and durability:** two OTA app slots with a boot self-test and rollback; a signed asset manifest; atomic progress saves; bounded event queues; watchdog recovery; staged rollouts. Espressif documents app rollback and signed-update support; certificate verification and root-certificate lifecycle also need attention. [OTA guide](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/system/ota.html), [security overview](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/security/security.html)

## 9. Costs and business model

All amounts below are **USD planning estimates**, excluding VAT/sales tax unless specified. They are not supplier quotes. Do not convert them into a promised retail margin before supplier and contract-manufacturer bids.

| One-off bench/printed prototype | Allowance |
|---|---:|
| Integrated ESP32 display board | $20–40 |
| Optional voice hardware, mic/amp/speaker additions | $15–45 |
| Compatible battery and power additions, if required | $10–20 |
| Haptic/input/wiring/connectors | $10–25 |
| Printed shell, lens and assembly consumables | $15–40 |
| **Parts allowance per integrated prototype** | **$70–170** |

Separate audio development kits and lab tools are additional. The $13.99 Seeed price is a documented board price; the rest of this table is deliberately a budgeting range, not scraped current retail prices.

For a 1,000-unit custom run, investigate an **assembled product and packaging target of $40–65 per unit**, before freight/duties, outbound fulfillment, returns, support, certification/tooling allocation and acquisition. This is a cost target to validate, not an achieved quotation. A display, radio module, battery, audio, power circuitry, shell, and test labor can easily break it at low volume.

Illustrative price test: **$129–179 hardware**. At a $149 net-of-tax sale and $55 assembled cost, product gross profit is $94, or 63.1%, before the omitted expenses. For illustration, allocating another $8 inbound logistics, $9 fulfillment/outbound shipping, $5 payment fees, and $10 warranty/support reserve leaves $62 before cloud, acquisition, salaries, tax and fixed costs. Those amounts are assumptions; actual geography and channel matter. A VAT-inclusive price must first be reduced to net revenue.

Do not promise unlimited lifetime cloud AI from a one-time hardware payment. A free offline pet plus an optional $6–10/month connected service is one testable structure. Canceling should preserve the companion's local life and let the user export/delete memory. Test hardware-only and subscription offers separately; customers may dislike another subscription.

**Inference cost model:** calculate `transcription minutes × rate + generated speech minutes × rate + model input/output tokens × rate + hosting/storage/observability`. At 10 combined input/output voice minutes per day, usage is 300 combined minutes per month. An illustrative blended cost of $0.005/$0.02/$0.06 per combined minute gives $1.50/$6/$18 monthly before other costs. These are sensitivity scenarios, not provider prices. Select a provider after measuring a realistic conversation trace and checking its current pricing, privacy and latency. A $6 subscription cannot support a $6 direct inference cost plus everything else.

**Market-size discipline:** no defensible TAM has been established here. One million devices at $149 is $149 million in one-time hardware revenue, not annual recurring revenue. If 25% also paid $8/month, that would be $24 million ARR before churn. This illustrates the adoption scale the company would need; it is not a demand forecast.

## 10. Manufacturing and launch readiness

Use three stages with explicit exit conditions:

1. **Engineering validation (EVT):** prove the power, audio, display, memory and RF architecture; measure actual consumption and temperature; document schematic/BOM; test recovery paths. Printed housings are acceptable.
2. **Design validation (DVT):** integrated enclosure and custom PCB; tune acoustics and antenna performance; test drops, buttons, charging, ESD, skin contact, assembly tolerances and firmware reliability; perform market-specific compliance work with a lab.
3. **Production validation (PVT):** factory fixtures and provisioning; serial-number traceability; calibrated pass/fail tests; packaging; yield/rework records; incoming inspection and support/return process. Do not commit a large order based only on a nice EVT demo.

Required engineering deliverables before production: KiCad/Altium schematic and board files, reviewed BOM with alternates, mechanical CAD and drawings, battery documentation, test-point map, programming/test jig design, assembly instructions, golden firmware and rollback images, secure provisioning process, and test reports.

For a UK launch, review the applicable radio-equipment obligations and the consumer connectable product security regime. PSTI addresses passwords, vulnerability reporting and the disclosed security-support period, among other duties. A radio module's certification is not a blanket approval of the completed product. Scope the whole product with a lab, including the intended GB/NI/EU/US markets. [UK radio guidance](https://www.gov.uk/government/publications/radio-equipment-regulations-2017), [PSTI guidance](https://www.gov.uk/government/publications/the-uk-product-security-and-telecommunications-infrastructure-product-security-regime)

Battery shipping requires appropriate documentation and transport handling; obtain the battery's UN 38.3 test summary and have a qualified logistics provider classify the shipment. This does not replace electrical safety or cell qualification. [IATA 2026 battery guidance](https://www.iata.org/contentassets/05e6d8742b0047259bf3a700bc9d42b9/lithium-battery-guidance-document.pdf)

Starting with adults simplifies the product experiment, but an “18+” label does not automatically remove children's privacy obligations. The ICO's Children's Code covers relevant services likely to be accessed by children, including connected devices. This product's visual appeal makes the assessment material. Document intended audience, actual use, data flows and access controls before launch. [ICO scope guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/)

## 11. What could make this a credible YC application

YC explicitly considers fields beyond software and says teams can apply at the idea stage. It also emphasizes the founding team's ability to build the product. You do not need a factory-ready device or revenue to be eligible. [YC FAQ](https://www.ycombinator.com/faq)

YC's application guidance emphasizes concise explanations, specific founder achievements, insight, and understanding obstacles. Its requests for startups are suggestions rather than a required checklist. My interpretation: MORI's strongest case would be a clear customer insight plus rapid technical execution and evidence of retained use, rather than a larger feature list. [How to apply](https://www.ycombinator.com/howtoapply/), [YC requests for startups](https://www.ycombinator.com/rfs)

**The question to answer:** “Why does this deserve to exist as a physical product, and why will people still care after 30 days?”

Proposed evidence program—not official YC thresholds:

| Question | Experiment | Evidence to keep |
|---|---|---|
| Is the problem real? | 20 interviews about current focus rituals and past purchased devices | Recent behavior, spending, abandonment stories; no leading hypothetical questions |
| Is it the character or the LLM? | Compare authored pet and memory-enabled pet with the same appearance | Repeat use, remembered moments, errors and user preference |
| Does embodiment help? | Compare phone-only and physical versions with similar functions | Voluntary sessions, completion, willingness to pay; acknowledge small-sample uncertainty |
| Does it last? | 10–20 initial users, then 30–50 over at least four weeks | Cohort retention, reasons for stopping, charging friction |
| Will people pay? | Actual purchase offer or clearly refundable reservation with honest delivery terms | Paid conversion and refunds; separate friends, giveaways and paid participants |
| Can it scale? | Measure cloud cost and get manufacturing quotations | Cost distribution, support minutes, defects and landed-cost model |

Define meaningful use before testing: a voluntary game, conversation, or focus interaction; charging, passive screen-on time, and automatic notifications do not count. Define activation as setup plus a first meaningful interaction. Define week-four retention as an activated user completing a meaningful interaction in days 22–28. Report count and denominator, not just a percentage.

An internal aspirational gate might be 50% week-four retention in the first well-matched cohort, with repeat focus usage and some full-price conversions. That is not an industry benchmark or YC criterion. With 20 users, one person's behavior changes the metric by five percentage points. Report sample sizes and avoid broad causal claims from this pilot.

**A credible demo:** hold the device, show an immediate touch reaction, recall a real saved preference, approve a timer, disconnect Wi-Fi and show continued local behavior, reconnect, and demonstrate memory deletion. Distinguish scripted animations from real model behavior. An unedited clip is more informative than a cinematic mock-up.

**Draft application opening:** “We are building a pocket AI companion that helps adults start focused work and remembers the small wins they share with it. We are testing whether a persistent physical character produces more sustained use than a phone app.” Replace the second sentence with measured results once available. Do not state that prototypes shipped, users paid, or retention reached a number until it happened.

Prepare direct answers to: Why not an app? Why not AIBI? What have you learned that competitors missed? Who can build the electronics and firmware? What happens if cloud service goes away? What does each active user cost? How much working capital is needed to ship? How will acquisition work beyond novelty videos?

Potential acquisition experiment: recruit one creator/desk-setup/cozy-gaming community, show real reactions from consenting testers, and measure paid conversion by source. Views and waitlist signups are separate from purchases and retention. Do not use unverified competitor sales figures to size the market.

As checked on 24 October 2026, YC's application page lists **Winter 2027**, running January–March in San Francisco, with the on-time deadline **2 November 2026 at 8 p.m. Pacific**, which is **3 November at 4 a.m. London time**. Recheck the official page before submitting. There is not enough time before that deadline to create a truthful four-week retention cohort from scratch; apply with current facts and continue testing. [YC application page](https://www.ycombinator.com/apply)

## 12. Execution plan

| Period | Build and learning goal | Exit evidence |
|---|---|---|
| Days 1–3 | Interview first five prospects; specify one ritual; start board examples and animated character | Exact audience, working display/touch demo, known hardware revision |
| Days 4–7 | Local focus loop, sound/haptics, printed enclosure mock-up; bench voice prototype | Unedited end-to-end demo; first measured power/latency readings |
| Days 8–14 | Memory and approved actions; basic provisioning; 3–5 supervised testers | Setup completion, bugs and daily user observations |
| Weeks 3–6 | Deploy 10–20 working prototypes; compare phone-only behavior; iterate | Cohort data, voluntary usage, battery logs, cost per active user |
| Weeks 7–8 | Refine offer, obtain manufacturing/lab quotes, prepare factual investor material | Honest price/retention evidence and a costed next hardware revision |

This schedule assumes at least one capable embedded engineer plus software/product capacity, available components, and rapid access to testers. It is not a promise of manufacturing readiness in eight weeks. A solo founder should narrow scope further and expect a longer hardware integration path.

For a founder-built pilot, reserve roughly **$3,000–8,000 non-salary cash** for 10–20 prototypes, spare parts, small print runs, basic tools, tester logistics and early backend use. This is a planning envelope; at $70–170 each, 20 prototype parts sets alone cost $1,400–3,400. Engineering salaries/contractors, custom-PCB redesigns, tooling, certification, travel, taxes and production inventory are additional and can dominate. Obtain quotes before committing.

Proceed to custom hardware if repeated use and willingness-to-pay are credible. Rework the concept if people enjoy the first encounter but stop returning, if the phone-only version performs similarly, or if users want unlimited conversation at a price that cannot fund it. A useful negative pilot is cheaper than a warehouse of beautiful devices.

## 13. Immediate decisions

1. Choose the first audience and ritual: recommended starting point is adults using MORI for a short daily focus session.
2. Choose the first experiment: character-first integrated display board plus a separate voice bench prototype.
3. Order only a small engineering quantity after confirming revision, battery compatibility and lead times; this research did not place orders.
4. Create the local character state machine and measure its responsiveness before adding more AI features.
5. Recruit testers and log meaningful usage with consent. Keep the landing page's “concept” language until hardware and capabilities actually exist.
6. Apply to YC with the current truth; do not postpone user learning until admission and do not manufacture traction to meet a deadline.

**Unresolved work:** interviews; actual component procurement; CAD fit; full schematic and pin allocation; battery measurements; microphone/speaker tuning; provider selection and cost benchmarking; privacy review; compliance scope and quotations; production tooling and yield; trademark clearance; and proof of demand. This report identifies a practical path through those questions rather than treating them as solved.
