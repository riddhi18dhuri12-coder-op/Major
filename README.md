# Smart Tourist Safety Monitoring & Incident Response System (MERN)

A full-stack platform with four portals, built on the UI design you provided:

| Portal | Who | What they do |
|---|---|---|
| **Tourist** | travellers | share GPS, see safety zones, press **SOS**, report problems, check in "I'm Safe", start independent trips, verify identity, hold a **Digital Tourist ID** |
| **Travel Agency** (+ guides) | agencies | register tourists & trips, assign guides, review identity verification, watch a live map and alerts |
| **Authority** | tourism police / control room | draw safety zones, monitor risk, dispatch response units, audit log, verification ledger |
| **Emergency Response** | police / rescue / medical units | receive assigned incidents, start response → arrive → resolve, share position |

```
smart-tourist-safety-mern/
  server/   Node + Express + MongoDB (Mongoose) + Socket.IO API      (44 automated tests)
  client/   React 19 + Vite + Tailwind 4 + Leaflet, installable PWA   (19 end-to-end UI tests)
  docker-compose.yml   API + MongoDB for local use
```

## Run it on Windows

You need **Node 20+** and a MongoDB database (free: <https://www.mongodb.com/atlas> → create a cluster,
add a database user, allow your IP, copy the `mongodb+srv://…` string. Or install MongoDB Community locally).

**Terminal 1 — API**
```powershell
cd server
npm install
copy .env.example .env
```
Edit `.env`: paste your `MONGODB_URI`, and generate the two secrets (run the command twice):
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
→ put the results into `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Then:
```powershell
npm run seed      # demo data
npm run dev       # API on http://localhost:4000
```

**Terminal 2 — website**
```powershell
cd client
npm install
npm run dev       # http://localhost:5173
```

Open <http://localhost:5173> and sign in (password for all demo accounts: `test1234`):

| Sign in as | Email |
|---|---|
| Tourist (verified) | `tourist@test.com` |
| Travel Agency | `company@test.com` |
| Tour Guide | `guide@test.com` |
| Authority | `authority@test.com` |
| Response Team | `responder@test.com` (also `police@test.com`, `medical@test.com`) |

`aarav@test.com` / `sara@test.com` are tourists who have not activated yet (use **Tourist activation** on the login page with their Tourist ID; the IDs are printed by `npm run seed`). Aarav also has a verification request waiting for the agency.

### Try the whole flow (5 minutes)
1. Sign in as the **tourist** → *Share my location* (allow the browser prompt) → press **SOS**.
2. In another window sign in as **authority** → the SOS appears live → open it → **Dispatch** the nearest unit.
3. In a third window sign in as the **response team** (`responder@test.com`) → *Active Incidents* → *Start response → Mark arrival → Mark resolved*.
4. Back as the tourist: the report timeline updated live and the status returns to Safe.
5. As **authority** → *Safety Zones*: click the map to draw a new danger zone. Move a tourist into it to see the warning.

> **Phones:** browsers only allow GPS on `https://` or `localhost`. To test on a phone, deploy the app
> (below) or use a tunnel such as Cloudflare Tunnel / ngrok.

## Tests
```powershell
cd server ; npm test     # 44 tests: auth, tenant isolation, roles, SOS, zones, risk, dispatch, ledger, sockets
cd client ; npm test     # 19 tests: drives the real UI against the real API (starts its own server)
```
Both need a MongoDB to talk to: set `TEST_MONGODB_URI` (e.g. `mongodb://127.0.0.1:27017`); a throwaway database is created and dropped.

## How the main features work

**Zones & geofencing.** Authorities draw circle/polygon zones (safe, caution, danger, restricted, rest point).
Each location update is matched against them (overlaps → the most restrictive wins). Entering a danger/restricted
zone warns the tourist once and alerts their agency and the authorities.

**Risk engine** (`server/src/services/risk.js`). A transparent rule-based score 0-100 (LOW/MEDIUM/HIGH/CRITICAL) from:
zone type, night time, how long the tourist has been stationary, silence (no GPS), overdue independent travel,
missed check-ins, nearby recent incidents, active SOS. Context matters: resting at a known **rest point** is normal;
the same inactivity in a danger zone at night is not. Every score comes with its reasons ("Why this risk level").
A high score raises an *attention* alert — **only the SOS button creates an emergency**.

**Incident workflow.** `NEW → ACKNOWLEDGED (assigned) → RESPONDING → ON_SITE → RESOLVED` (or `FALSE_ALARM`),
with a full timeline. Dispatch lists available units nearest-first; a unit can't be double-booked; responders only see
and move *their own* incidents and receive the tourist's emergency contacts.

**Verification & Digital ID.** Tourists submit a document (foreign tourists: passport + valid visa). The agency approves
or rejects; approval issues `STID-2026-0001` and writes a proof block to a hash-linked ledger. Only hashes are stored —
never the document number — and the ledger detects tampering (shown on Authority → Analytics).

**Digital ID validity (visit-only).** An ID is valid only for the visit: from the earliest trip start to the end of the last trip
day (India time), capped by the visa expiry for foreign tourists, and ended early if the trip is marked COMPLETED. Status is
`PENDING → ACTIVE → EXPIRED`; the scheduler flips it automatically, changing trip dates re-syncs it (extending a trip renews an
expired ID), and every expiry/renewal is written to the proof ledger. A checkpoint lookup (`GET /api/verification/proof/:digitalId`)
returns `valid: true` only while the identity is verified, the ledger is intact **and** the visit is in progress.

**Route deviation.** The agency sets a planned route on a trip (click start + destination; the road route comes from OSRM, with a
straight-line fallback). While the trip is ACTIVE every GPS update is measured against that line: under 200 m = on route,
200–500 m = *warning* (tourist only), beyond 500 m = *deviation* (thresholds are per trip). A deviation needs two consecutive
readings and the GPS accuracy radius is credited back (max 100 m), so one noisy fix doesn't raise an alarm. A confirmed deviation
creates one `ROUTE_DEVIATION` incident per episode (updated when the tourist returns, closed by a human), alerts the agency and
authority, and adds an explained factor to the risk score.

**Offline.** An SOS or check-in sent without signal is saved on the device and sent automatically when you're back online;
safety zones stay available offline (service worker, production build).

**Background monitoring** (every 60 s, safe with several servers): overdue independent travel, location silence,
missed "I'm Safe" check-ins (12 h by default; configurable in `.env`), and Digital ID expiry.

## Honest limits of this prototype
- **Verification is simulated.** There's no government/Aadhaar/DigiLocker lookup; an agency reviews what the tourist typed.
- **The "blockchain" is a hash chain in your own database** (tamper-evident, not decentralised). The record hashes could later be anchored on a public chain.
- **Risk scoring is rule-based, not machine learning.** It is explainable and testable; the input/output shape would let you swap in an ML service later.
- **Maps** use OpenStreetMap tiles; the *Safer route check* uses the free public OSRM demo server (fine for demos, not for production traffic).
- **Sessions** are stored in the browser's localStorage (15-minute access token + rotating refresh token). A production hardening step would move the refresh token to an `httpOnly` cookie.
- **SMS / push notifications** are not included yet (alerts are in-app and live over sockets).
- "Night" rules and ID-validity days assume India Standard Time.
- Route deviation compares against a planned **road route** between two points; multi-stop or off-road itineraries need more route points than the editor currently offers.
- Guides see all of their company's tourists and alerts.

## Deploying
- **API** → any host with a long-running Node process (Render, Railway, Fly.io, a VPS). *Not* Vercel/Netlify functions
  (Socket.IO and the scheduler need a persistent server). `server/Dockerfile` is included. Set `NODE_ENV=production`,
  `TRUST_PROXY=1`, `CORS_ORIGINS=https://your-frontend`, your Atlas `MONGODB_URI` and the two JWT secrets.
- **Website** → Vercel / Netlify / Cloudflare Pages: `npm run build`, publish `client/dist`, set `VITE_API_ORIGIN=https://your-api`
  at build time, and add a rewrite of all paths to `/index.html` (single-page app).
- Several API instances → add the Socket.IO Redis adapter so live events reach every instance (the scheduler is already lock-protected).

## Languages and text size
The language picker and the **A− / 100% / A+** text-size buttons are on the home page, the login page and the top bar of every portal.
Both choices are remembered on the device. With no saved choice, the app uses the browser's language if it is supported.

**Languages (11 Indian languages + English):** हिन्दी, বাংলা, मराठी, தமிழ், తెలుగు, ગુજરાતી, ಕನ್ನಡ, മലയാളം, ਪੰਜਾਬੀ, ଓଡ଼ିଆ, অসমীয়া.
Each language is a separate file in `client/src/locales/` that is downloaded only when chosen. A missing string falls back to English, never to a blank.

**What is translated:** the home page, login, all five tourist screens (dashboard, SOS and the confirmation, emergency reports and contacts,
safety zones, journey and route checks, profile and Digital ID), navigation, status labels everywhere, and the live alerts.
The server sends warnings and risk reasons in English; the app recognises each known message and translates it on the device
(`client/src/lib/serverMessages.js`). Anything it does not recognise, such as a description an officer typed for a zone, is shown unchanged.

**Not translated yet:** the agency, authority and responder portal pages (their menus, titles and status labels follow the chosen language,
but the page text is English), the PDF E-FIR (the built-in PDF fonts are Latin-only), and push/SMS text (not built yet).

**Text size** is applied to the whole interface (everything is sized in `rem`), in six steps from 85% to 175%.

**Translation quality:** these translations were prepared with AI assistance and have **not been reviewed by native speakers**.
Please have a fluent speaker review them before real use, especially the SOS, emergency and safety-zone wording (`sos.*`, `em.*`, `srv.*`, `dash.status.*`).
Fonts: Odia and Assamese need a device with those scripts installed (all current Android and iOS phones have them).

**Adding or fixing a language:** copy `locales/en.js` to `locales/<code>.js`, translate the values (keep `{placeholders}` exactly), add the code and
its name to `LANGUAGES` in `lib/i18n.jsx`, then run `npm run check:i18n`. That check fails if any key is missing or extra, if a placeholder
changed, or if the code uses a key that does not exist; the test-suite runs the same checks.

## Themes, GPS consent, self-resolve and nearby help
- **Dark / light theme:** the ☀️/🌙 button next to the language picker. Remembered per device; first visit follows the OS setting. Light mode re-maps the Tailwind slate scale in `client/src/index.css`.
- **GPS tracking switch:** in the tourist top bar. It is the tourist's consent for the guide and agency to see their position; off = the phone stops reading GPS and the server rejects position updates.
- **Close my own emergency:** while a tourist has an open SOS/report, the dashboard and Emergency page show *Issue solved — stop alert* and *Pressed by mistake* (`PUT /api/incidents/:id/self-resolve`). The case closes as RESOLVED or FALSE_ALARM, any assigned unit is freed, the tourist returns to Safe, and the agency and authority get a notification.
- **Nearby hospitals and police stations:** red-cross markers for hospitals, blue-shield markers for police stations; the nearest of each pulses. Shown on the dashboard, Safety Zones and Emergency pages with distance and a directions link. Data comes live from OpenStreetMap (Overpass API) and is cached on the device for a day per ~2 km area, so it still works after signal is lost. OSM coverage varies by area.

## Automatic zones (independent travel)
Authority-drawn zones only cover places someone drew. So travellers are also covered **anywhere** by zones created automatically (shown with dashed outlines):
- **OpenStreetMap places → zones, by plain rules** (`server/src/services/autoZones.js`): police stations, hospitals and fire stations = *Safe*; rest areas, fuel, bus stations, hotels = *Rest point*; cliffs, waterfalls, beaches, quarries, level crossings, bars = *Caution*; military land, prisons, airfields = *Restricted*; mine shafts and mapped hazards = *Danger*.
- **Incident history → Danger hotspots:** 3 or more reports (not false alarms) within 400 m in the last 30 days (`AUTO_ZONE_HOTSPOT_MIN`). Only the circle is shown, never who reported.
- **Authority zones always win.** Automatic zones apply only where no authority zone covers the point. They feed the same geofence, warnings, risk score and "rest point" logic as drawn zones.
- Data is fetched per ~6 km area from the Overpass API, cached in MongoDB for a week, and loaded in the background, so a location update never waits for it. The first fix in a brand-new area has no automatic zones yet.
- Settings (`server/.env`): `AUTO_ZONES=true|false`, `OVERPASS_URL` (comma-separated list), `AUTO_ZONE_HOTSPOT_MIN`. Tourists can hide the layer with the *Automatic zones* switch on the Safety Zones page.
- This is rule-based and explainable, not machine learning; every automatic zone says what it was based on. Coverage depends on how well OpenStreetMap maps the area.

## Roadmap (not built yet)
SMS/push alerts · ML risk model service · real identity verification provider · multilingual UI · heat-maps & exportable reports ·
refresh token in `httpOnly` cookie · per-guide tourist scoping.
