# Mori M–01 · desk buddy build brief

Design revision: 29 October 2026. This is a prototype architecture and mechanical brief, not validated CAD, a production BOM, or proof that the illustrated parts fit. The procedural model uses composition units; its traces and connectors are illustrative.

## The first useful Mori

One small companion for starting a task, keeping time, and celebrating completion. Local personality comes from authored animation, not continuous AI inference. Optional push-to-talk adds voice assistance through Wi-Fi and a server. No camera, autonomous movement, always-listening wake word, or subscription is required for the basic companion.

The browser companion, focus timer, local wins, AI console, and waitlist flow already exist. Physical firmware, provisioning, device audio streaming, OTA updates, and production hardware do not. The current web speech implementation cannot simply run on an ESP32.

## Shape and assembly

- Target outer envelope: **68 W × 76 H × 34 D mm**, excluding the optional carrying loop. This is a packaging target to validate, not a measured fit.
- Rounded shoulders, a broad flat heel, and a removable silicone pad. Angle the display toward the seated user by approximately 8–12° in mechanical CAD; verify legibility and tipping with a wired mockup. The web illustration is not a tilt measurement.
- A standard rectangular display behind a rounded protective window. Do not order a custom-shaped LCD. Keep the active pixels and all mounting edges visible in the actual supplier drawing.
- Start with printed front and rear shells, approximately 2 mm nominal walls, and four screws into inserts. Check insert supplier geometry, local wall thickness, switch travel, and printer clearances with coupons before printing a full enclosure.
- Mount the display, PCB, and speaker to bosses, not to a removable battery. Use a gasket for the speaker cavity and a separate mic acoustic path. Keep the mic away from the speaker and button impacts.
- Rear USB-C with plug and strain-relief clearance; it must remain reachable when standing. No charging dock or pogo pins in the first build. A charging dock is a separate later engineering project.
- Place the module antenna at the upper perimeter with its vendor-specified keep-out; no battery, screws, metal coating, or conductive bumper in that volume.
- The optional loop should be a separate replaceable part. Avoid thin decorative ears that create fragile points or require an expensive enclosure tool.

### Packaging check before PCB design

Use full module outlines, connectors, cables and bend radii in CAD. A plausible starting stack is front wall/window → display module and mounts → control PCB → rear cavity, with the speaker beside rather than directly behind the mic. Reserve the battery volume only after the USB prototype fits. The 34 mm depth may need to grow; prioritize serviceability and acoustic volume over the marketing target. Check collisions in both assembled and screw-removal states.

## Candidate architecture

| Function | First prototype | Connection / constraint |
| --- | --- | --- |
| Animation, timers, Wi-Fi | ESP32-S3 module with PSRAM | Use an available development board for bench bring-up; select module memory variant before schematic capture. Wi-Fi is 2.4 GHz. |
| Face | Waveshare 1.69-inch ST7789V2 SPI display candidate, 240 × 280 | Rotate to landscape. Non-touch module outline is 31.50 × 39.00 mm; active area is 27.97 × 32.63 mm. Obtain mechanical drawing and exact revision before CAD. |
| Input | Three tactile switches, cap and travel stop | Debounced GPIO; input must work while rendering or streaming audio. Physical switches avoid requiring touch. |
| Voice input | Digital MEMS microphone breakout | Choose PDM or I²S against the final peripheral/pin budget; validate gain and acoustic opening on the bench. |
| Voice output | I²S class-D amplifier and matched miniature speaker | Check impedance, amplifier supply, peak current and cavity volume. Half-duplex first: stop capture before playing audio. |
| Privacy | Physical microphone power isolation plus signal isolation where needed | Prevent back-power through digital pins. Recording indicator must reflect the actual enabled capture path. A mute GPIO alone is insufficient. |
| Power | USB-C 5 V input, protection, adequately sized regulated rails | Use a known development-board power design first. Custom PCB needs CC termination, ESD and current budget review; no USB-PD requirement. |
| Desk stability | Flat base with removable silicone pad | Check touch forces and cable tug with a physical enclosure. |
| Later haptic option | LRA plus appropriate driver | Tune only after enclosure resonance and peak current measurements. |
| Later portable option | Protected single-cell battery, power-path charger, temperature sensing | Validate charge/load sharing, cell swelling allowance, fault protection, and thermal behavior with qualified hardware review. No runtime promise yet. |
| Later motion option | MEMS IMU | Optional pickup/tilt reactions; not required for focus, buttons or voice. |

The 16-part explorer includes the later battery, haptic, and motion provisions. It is an architecture study, not a list of parts required for the first USB prototype.

Primary references checked for this revision:

- [Espressif ESP32-S3](https://www.espressif.com/products/socs/esp32-s3): MCU, Wi-Fi/BLE and peripheral capabilities. Large language model inference belongs on the server.
- [Waveshare 1.69-inch LCD module](https://www.waveshare.com/product/1.69inch-lcd-module.htm): display interface, active area and module envelope. Touch is deliberately omitted from the v1 requirement.

These references establish component availability and specifications, not compatibility of a completed Mori circuit. No procurement or vendor quote has been performed.

## Controls and firmware states

| State | Left | Center | Right |
| --- | --- | --- | --- |
| Idle | Nap/back | Pat; hold to talk | Choose focus duration / next activity |
| Duration selection | Back | Start selected timer | Cycle 5 / 15 / 25 minutes |
| Focus | Back/cancel confirmation | Pause/resume | Show task / remaining time |
| Session finished | Not done yet | Confirm completion and celebrate | Dismiss without recording a win |
| Voice capture | Cancel | Release to submit; hold initially to record | Inactive |
| Voice reply | Stop playback | Stop playback | Switch configured agent after stopping |
| Sleep | Wake | Wake | Wake |

The landing buttons preview nap/pat/play expressions. The existing web three-button AI study uses stop/talk/switch, and browser dictation listens once rather than implementing the hardware hold/release protocol. Label these experiences as previews; firmware will implement the state-aware table above.

Firmware should be nonblocking: input, display updates, timer state, networking and audio buffering must not freeze one another. Use a monotonic clock for the active countdown; persist only state changes and completed wins, not each frame. Handle brownouts and watchdog resets with a safe idle state. Cap recording duration and allow cancellation in capture, upload, inference and playback.

### Voice and service boundary

1. Provision Wi-Fi with a deliberate setup action and unique device authentication. Do not embed provider API keys in firmware or use the website owner code as a fleet credential.
2. Hold center → enable mic and recording indicator → record bounded audio. Release submits; mute or left button cancels capture and discards unsent audio.
3. Device sends audio over authenticated TLS to a purpose-built device service. That service performs speech recognition, calls the chosen provider, and returns text and optionally synthesized speech. This device service is **not implemented** by the current text-only `/api/chat` endpoint.
4. Disable capture before speaker playback. No automatic restart of the microphone after a reply. Fail visibly and retain local companion functions when offline or out of quota.
5. Pair/reset flow, per-device revocation, request limits, signed OTA with rollback, and a factory recovery path must be designed before external testing. Default to no retained raw audio or conversations; disclose any provider retention.

## Prototype gates

1. **Bench, USB only:** buttons, face at a usable frame rate, timer, mic capture, speaker playback. Produce a GPIO/peripheral map before wiring; include flash/PSRAM restrictions, boot pins, USB pins, backlight control and audio clocks.
2. **Enclosure fit:** print shell, mount the actual modules and cable, check display area, button reach, speaker clearance, USB insertion, mic gasket and service access. Measure tipping rather than assuming the flat heel is sufficient.
3. **Power and sound:** measure idle, display, Wi-Fi transmit and speaker peaks together. Size rails from measured peaks with margin. Measure surface/board temperatures and intelligibility at a normal desk distance. Verify physical mute electrically, including signal back-power.
4. **Device service:** implement authentication, bounded audio, errors/cancellation, provisioning and recovery. Test no Wi-Fi, lost Wi-Fi, expired credentials and service timeouts. Basic focus and personality must remain usable.
5. **Portable revision, if needed:** introduce the documented cell and reviewed power path only after the above passes. Measure runtime under explicitly stated usage; do not extrapolate from cell capacity alone.
6. **Pilot readiness:** manufacturing test points, assembly fixture, reset/OTA recovery, component sourcing, acoustic tuning, radio/EMC and applicable product/battery compliance review. Only then set a price and shipping commitment.

## What this design intentionally avoids promising

No claimed production cost, retail price, battery hours, weight, cloud memory, finished physical prototype, or delivery date. Accessories and paid plans are outside the first-build scope. The next physical deliverable is a USB-powered functional bench prototype and dimensioned enclosure CAD, followed by a measured fit revision.
