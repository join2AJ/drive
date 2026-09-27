# Drive — companion app for wired GPS trackers

A React (JSX) mobile app for a car/bike/EV tracker such as the *NV Prime Nxt Gen* wired GPS unit. It turns raw 1 Hz GPS pings (plus optional dashcam video and cabin audio) into live tracking, trip history and driving insights, including automatic crash detection.

It ships as one codebase:

- **Web / PWA**: `npm run dev`, then open it on your phone.
- **Android & iOS**: wrapped with [Capacitor](https://capacitorjs.com) into native projects (see below).

Out of the box it runs on a **built-in tracker simulator** that generates 6 weeks of driving history around Bengaluru. That includes commutes, weekend trips, rush-hour traffic, harsh braking, a night-time speeding run and one collision. You can explore every screen without hardware.

## Screens

| Tab | What it does |
| --- | --- |
| **Live** | Live map with the vehicle, the trail so far and the route ahead. It also shows a speedometer with the road's speed limit, ETA, today's stats, tracker health (GPS satellites, 4G signal, battery voltage, ignition), the engine immobilizer, live cabin audio, the dashcam and trip sharing. |
| **Trips** | Trips grouped by day, with route thumbnails, safety scores and event badges. You can filter by alerts, commute or night. The trip detail page has a map with overspeed segments and event pins, a speed-over-time chart you can scrub (synced to the map), **animated trip replay** at 4–64×, the event list and linked recordings. |
| **Insights** | Safety score and trend, and distance per day with an estimated fuel cost. **Frequent places** are found automatically, including places you visit often but never named (the app suggests naming them). It also shows top routes with typical and best times, a commute tip ("leave before 8:33 to save 2 min"), a speed-profile histogram, a when-you-drive heatmap and habits (night driving, idling, average trip). |
| **Car** (hub) | Everything about owning the car: **reminders** (insurance, PUC, RC, service by km, tyre rotation, battery) with overdue badges; **fuel log** of fill-ups giving your *real* mileage full-tank to full-tank, with one tap to use it for all trip costs; **logbook** with business/personal tags (trips to/from Office auto-tagged) and a monthly **Excel and PDF** export; FASTag balance; **stolen-vehicle mode**; **drivers**; **where I parked**; the Vault; streaks & badges. |
| **Vault** | Live dashcam view and SD-card and cloud storage status. Event clips (collision and harsh braking) are auto-locked. It also holds saved clips, cabin audio and voice notes. The player overlays recorded speed, time and GPS as a HUD on the video. |
| **Alerts** | Every alert: safety (collision, harsh brake or acceleration, overspeed), geofence enter/exit, ignition, power cut and low battery. Collisions open a full **incident report** with the impact numbers, a speed chart around the impact, locked evidence, a timeline and actions (call 112, send to insurer). |
| **Vehicle controls** | Opened from Live (*All controls*). A top-down car shows the live state of locks, mirrors, windows, boot, lights, hazards, engine and horn. Controls: lock/unlock, remote engine start/stop (press and hold), immobilizer, parking guard, valet mode, find my car (horn + lights), pre-cool AC with temperature, mirror fold, window vent, boot, headlights, hazards, horn and a speed limiter. Each command shows *Sending…* until the car confirms it and goes into a command history. Safety interlocks block unsafe commands while driving: engine off, mirrors, boot, horn and opening windows. A *Parked (demo)* switch lets you try everything. Each control is tagged with the hardware it needs: **Tracker**, **Relay** or **CAN module**. |
| **Fuel & costs** | Every trip is costed from its distance at your real mileage, plus fuel burnt idling. You can group spend by **destination, route, weekday or time of day**, sort by cost, visits or km, and expand a group to see each trip and its cost. It also shows ₹/km, ₹/day and idling waste, and names the costliest destination. Visit counts and trip costs appear in Insights (frequent places) and on every trip. |
| **Incidents & claims** | **Log incident** (Live, Alerts or any trip) → choose what happened (collision, hit & run, theft, vandalism, pothole, road rage, parking damage, other) → *just now* or a moment on an earlier trip → **Seal evidence**. The GPS track from 15 min before to 5 min after is frozen with a SHA-256 fingerprint. Front camera, cabin camera and cabin audio are locked, and nothing sealed can be deleted. The case file then remembers everything the insurer will ask for, saved on the phone as you type: your statement (with prompts), a real **voice statement** from the microphone, photos (camera or gallery, which can't be removed once added), a tap-to-mark **damage map**, other party details, injuries, police FIR, witnesses, repair estimate, and your driver and policy details (pre-filled from Settings). **Prepare claim summary** writes the claim text from the sealed data and your answers, then lets you copy it, share it or download a JSON claim pack. After you mark the case as *sent to insurer* it becomes read-only, with dated notes only. Every action is written to a *record of changes*. The auto-detected collision becomes a case automatically. |
| **Geofences** | There are three shapes. **Circle**: a radius around a point (straight-line distance). **Drive time**: everywhere the car can reach *by road* in N minutes, with light, normal or rush-hour traffic. It's worked out on the road network (speed limits scaled by traffic, plus signal/turn delays), so a place 2 km away by air can sit outside a 15-minute zone if the drive there is slow. **Draw**: tap the map to add corners, with undo/clear. Each zone can alert on enter, exit or both, and shows its crossings from the last 7 days. On the Live map, drive-time zones are drawn as a light outline. |
| **Stops & activity** | The vehicle state is shown live on the Live screen ("Running 26s", "Idle 3m", "Stopped"). A **24-hour state bar** (running / idle / stopped) can be tapped for each period, with daily totals and the cost of idling. A map shows numbered stops. The **stop report** lists parked stops (engine off) and long idling (engine on, 3 min+), each with place, arrival, departure and duration. You can filter by type or set the shortest stop listed (2/5/15/30 min), and export to Excel or PDF. A **long-idling alert** fires after N minutes (Settings). |
| **Stolen-vehicle mode** | Hold to turn on. Tracking switches to every 5 s, a **police link** (no app or login needed) shows live position, speed, plate and IMEI, and contacts get an SMS. The engine is cut **only once the car slows below 20 km/h**. It stays silent (no horn or lights) and keeps a timeline and FIR number. |
| **Share my ride** | From Live: pick contacts, get a live link with ETA that **stops automatically on arrival**. The viewer page needs no app. |
| **Drivers & new-driver mode** | Profiles identified by phone Bluetooth, key fob or RFID tag. Every trip has a driver. New-driver mode sets a **speed limit and curfew**, lists each rule break, and sends a **weekly report to the parent**. |
| **Theft & tamper alerts** | **GPS jamming** (GNSS lost while 4G is fine and the car is still), **battery disconnect**, and **unusual night movement**, i.e. a trip at an hour this car is almost never driven. It's learnt from your own history, not a fixed rule. |
| **Weekly report card** | "Drove 185 km, ₹1,596, score 94, 2 harsh brakes at Hebbal flyover": distance, spend (fuel + tolls + parking), score trend, where it got rough, highlights. It can be filtered by driver and shared. |
| **Hotspots** | Map and list of places where harsh braking, hard launches or speeding **keep happening**, named by landmark ("Hebbal flyover · mostly 6 PM"), with a tip for each. |
| **Streaks, badges & insurer score** | Smooth-driving day streak, six badges with progress, and a **safe-driving certificate** (score, grade, harsh events per 100 km, % over the limit, night %) with a verification code. You can download it as a PDF or share it with your insurer. |
| **Where I parked** | Map pin and landmark for where you parked, walking directions, a **parking timer** that reminds you 10 min before the ticket runs out, a note ("Level B2, pillar 14") and a photo. |
| **Ask AI** | Ask anything in plain language: "How much did weekend trips cost in September?", "When do I usually leave office?". Online, **Claude** answers from your trip table and streams the reply. Offline, the phone answers common questions itself (costs, distance, departure/arrival times, harsh braking and where, top speed). |
| **AI incident statement** | In an incident case, **Draft my statement with AI** writes a first-person draft from the sealed GPS facts, the cabin-audio transcript and your notes, and marks gaps like *[describe what the other vehicle did]*. Your **voice statement** is transcribed on the phone while you speak. Offline, you get a factual template instead. It is always a draft you edit. |
| **Offline** | GPS needs no internet. When the car has no signal, the tracker stores points and uploads them later; the app shows *"Car has no signal · N GPS points waiting"*, then *"Synced N points"*. The app installs as an offline web app (service worker), and **offline map packs** can be downloaded in Settings. Settings also has switches to test both offline cases. |
| **Settings** | Hardware info, **tunable detection rules** (the event counts update live), **fuel type, price and mileage** (Petrol, Diesel, CNG or EV presets), **claim details remembered for every claim**, geofences with radius, notifications, emergency contacts, SOS countdown, dark/light/system theme and the data source. |

When the live stream matches the collision rule, a **full-screen SOS** takes over. It vibrates, counts down (30 s by default), then alerts your emergency contacts unless you tap *I'm OK*. To try it, tap **Live → Test crash detection → Simulate**.

## Insight algorithms

All of these live in [`src/lib/analytics.js`](src/lib/analytics.js). They work on plain samples `{ t, x, y, v, limit }`, so they behave the same on history, the live stream or a real tracker feed.

| Insight | Rule (defaults, all adjustable in Settings) |
| --- | --- |
| **Probable collision** | Speed drops from **≥ 60 km/h to ≤ 10 km/h within 2 s**. For example, 80 → 4 km/h in 2 s ≈ 1.1 g. Confidence goes up if the vehicle then stays stationary. |
| Harsh braking | Deceleration ≥ 3.5 m/s² (about 12.6 km/h lost per second). Consecutive seconds are merged into one episode. |
| Harsh acceleration | ≥ 3.0 m/s² |
| Overspeed | Above 80 km/h for at least 10 s. Reports the peak speed and duration. |
| Frequent places | Parking spots (trip end points) are clustered within 300 m. For each cluster it records visits, typical arrival time, average stay and most common weekday, and matches it to saved places. |
| Top routes | Place → place pairs, with median, best and worst duration. |
| Safety score | 100 minus event penalties, scaled by distance. |

Unit tests in [`test/analytics.test.js`](test/analytics.test.js) and [`test/features.test.js`](test/features.test.js) and [`test/geofence-stops.test.js`](test/geofence-stops.test.js) cover each rule (37 tests), including tolls, reminders, mileage, logbook tags, night-movement and curfew detection, hotspots and offline question answering. One test checks that the detector finds exactly the events the simulated device recorded.

## Deploy on Netlify

**AI assistant setup:** add `ANTHROPIC_API_KEY` under *Site configuration → Environment variables*, then redeploy. The function [`netlify/functions/ask.mjs`](netlify/functions/ask.mjs) is served at `/api/ask`. It uses `claude-opus-5` with streaming, caches the trip table between questions, and uses server-side refusal fallback. It only accepts requests from your own site. Without a key the app still works and answers on the phone. For a Capacitor build, set `VITE_AI_ENDPOINT=https://<your-site>/api/ask` at build time.

[`netlify.toml`](netlify.toml) sets the build (`npm run build` → `dist/`, Node 22) and a single-page-app fallback, so connecting the repo is all that's needed. The HTTPS it serves on is also what the voice-statement microphone and the SHA-256 evidence fingerprint rely on.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — open on your phone via the LAN URL
npm test           # analytics unit tests
npm run build      # production build in dist/
```

On a desktop the app is framed in a phone mock-up. On a phone it runs full screen and respects the safe areas.

## Build the Android & iOS apps

Capacitor is already configured ([`capacitor.config.json`](capacitor.config.json)).

```bash
npx cap add android      # once
npx cap add ios          # once (macOS + Xcode)
npm run cap:android      # build web assets, sync, open Android Studio
npm run cap:ios          # build web assets, sync, open Xcode
```

For production you'd typically add `@capacitor/geolocation` (phone location for "find my car"), `@capacitor/push-notifications` (crash, tow and geofence alerts) and `@capacitor/haptics`.

## Build your own tracker

See **[docs/hardware.md](docs/hardware.md)**. It covers the parts list with rough ₹ prices, wiring, how offline store-and-forward works, the MQTT/Traccar data protocol, safety (NC immobilizer relay, speed interlock) and Indian rules (AIS-140, DPDP). A starter firmware sketch for an ESP32-S3 + 4G modem is in [`firmware/drive-tracker/`](firmware/drive-tracker/drive-tracker.ino). It is an **untested skeleton** and hasn't been compiled or flashed.

## Connect a real tracker

The UI only depends on the data-source shape documented in [`src/data/source.js`](src/data/source.js): `vehicle`, `trips[].samples`, `media`, `geofences` and `live`. To use real hardware, implement the same shape against your tracker backend:

- **Vendor cloud / app API**: if the tracker vendor offers API access for your device.
- **Self-hosted [Traccar](https://www.traccar.org)**: many low-cost Indian trackers speak GT06-family protocols, which Traccar supports. Point the device's server IP/port at your Traccar instance (usually set by SMS command; check your device manual), then read positions from Traccar's REST/WebSocket API.
- **MQTT / custom ingest**: for your own hardware (for example an ESP32 + GPS + camera module).

Positions use local metres internally. [`src/lib/geo.js`](src/lib/geo.js) converts to and from lat/lng. The basemap is a lightweight SVG renderer. For production, swap it for MapLibre GL or Google Maps and keep the overlays.

Incidents, photos and voice statements are stored on the device (`localStorage`) in this build. For production, move them to IndexedDB plus a write-once cloud bucket (for example S3 Object Lock) so the evidence survives the phone being lost.

Remote commands (`useVehicleControls` in [`src/state.jsx`](src/state.jsx)) simulate the round trip to the car. A real backend sends the command to the tracker (for example Traccar's `/api/commands`), waits for the tracker's acknowledgement and then updates the state.

> Note: a GPS-only unit provides location, speed, ignition and power events. The **Vault** (video and cabin audio) needs a tracker with camera and microphone, such as a 4G dashcam-tracker combo.

## Project layout

```
src/
  App.jsx               tab bar + stack navigation (hardware back supported)
  state.jsx             app state, live 1 Hz stream + real-time crash detection
  data/
    cityModel.js        procedural road network + saved places + routing
    simulator.js        physics-lite driving simulator (tracker-like samples)
    source.js           data-source adapter (swap for a real backend)
  lib/
    analytics.js        event detection, scoring, places, routes, distributions
    geo.js, format.js, rng.js
  components/           MapView, Charts, Media (dashcam/audio player), CrashOverlay, ui
  screens/              Live, Trips, TripDetail, Insights, Vault, Alerts (+Incident), Settings,
                        Controls, Costs, Incidents (log wizard, claim case), Car (hub),
                        Reminders, FuelLog, Logbook, Stolen, Drivers, WeeklyReport,
                        Hotspots, Achievements, Parking, Ask, ShareViewer, Geofences
                        (+ editor), Activity (stops & states)
netlify/functions/ask.mjs   Claude-backed assistant (questions + statement drafts)
public/sw.js, manifest      installable offline web app
docs/hardware.md            build-your-own tracker design
firmware/drive-tracker/     ESP32-S3 starter firmware (untested skeleton)
  lib/geofence.js       circle / drive-time (isochrone) / polygon zones + enter/exit events
  lib/stops.js          running / idle / stopped timeline, stop report, live state
  lib/costs.js          trip cost (fuel + FASTag tolls + parking) and grouping
  lib/paperwork.js      reminders, fuel log / real mileage, logbook tags
  lib/security.js       unusual-night detection, new-driver rules, driver profiles
  lib/engagement.js     hotspots, streaks, badges, insurer score, weekly report
  lib/ask.js            offline question answering + trip table for the AI
  lib/aiClient.js       streaming client for /api/ask
  lib/exporters.js      Excel (write-excel-file) and PDF (jsPDF) exports, lazy-loaded
  lib/evidence.js       SHA-256 sealing, GPS snapshots, photo compression, claim vocab
test/analytics.test.js, test/features.test.js, test/geofence-stops.test.js
```
