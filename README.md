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
| **Vault** | Live dashcam view and SD-card and cloud storage status. Event clips (collision and harsh braking) are auto-locked. It also holds saved clips, cabin audio and voice notes. The player overlays recorded speed, time and GPS as a HUD on the video. |
| **Alerts** | Every alert: safety (collision, harsh brake or acceleration, overspeed), geofence enter/exit, ignition, power cut and low battery. Collisions open a full **incident report** with the impact numbers, a speed chart around the impact, locked evidence, a timeline and actions (call 112, send to insurer). |
| **Settings** | Hardware info, **tunable detection rules** (the event counts update live), geofences with radius, notifications, emergency contacts, SOS countdown, dark/light/system theme and the data source. |

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

Unit tests in [`test/analytics.test.js`](test/analytics.test.js) cover each rule. One test checks that the detector finds exactly the events the simulated device recorded.

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

## Connect a real tracker

The UI only depends on the data-source shape documented in [`src/data/source.js`](src/data/source.js): `vehicle`, `trips[].samples`, `media`, `geofences` and `live`. To use real hardware, implement the same shape against your tracker backend:

- **Vendor cloud / app API**: if the tracker vendor offers API access for your device.
- **Self-hosted [Traccar](https://www.traccar.org)**: many low-cost Indian trackers speak GT06-family protocols, which Traccar supports. Point the device's server IP/port at your Traccar instance (usually set by SMS command; check your device manual), then read positions from Traccar's REST/WebSocket API.
- **MQTT / custom ingest**: for your own hardware (for example an ESP32 + GPS + camera module).

Positions use local metres internally. [`src/lib/geo.js`](src/lib/geo.js) converts to and from lat/lng. The basemap is a lightweight SVG renderer. For production, swap it for MapLibre GL or Google Maps and keep the overlays.

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
  screens/              Live, Trips, TripDetail, Insights, Vault, Alerts (+Incident), Settings
test/analytics.test.js
```
