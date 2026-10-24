# OpenWheel / IndyCar Development Handoff

**Branch:** `feature/open-wheel-indycar`  
**Prepared:** 2026-10-24  
**Repository:** `afsilva/openf1-gnome-extension`

## Purpose

This branch is the development starting point for expanding the existing F1-only GNOME Shell extension to support both Formula 1 and the NTT IndyCar Series.

No runtime code has been changed yet. This handoff intentionally captures the decisions, research, constraints, and suggested implementation sequence before development begins on Linux.

## Proposed product name

Recommended working name: **OpenWheel Dashboard**

Why:

- It accurately covers both Formula 1 and IndyCar.
- It leaves room for other open-wheel series later.
- “Dashboard” preserves continuity with the existing **OpenF1 Dashboard** name.
- “OpenWheel Extension” is less descriptive in GNOME’s extension list.

Alternative names considered:

- **OpenWheel Racing Dashboard** — clearer, but longer.
- **OpenWheel Schedule & Standings** — very descriptive, but restrictive if features grow.
- **Formula & Indy Dashboard** — clear today, but not extensible.

Before implementation, confirm whether **OpenWheel Dashboard** should be the public name.

### Important naming and UUID distinction

The visible extension name and the GNOME extension UUID are separate decisions:

- The visible `name` in `metadata.json` can become `OpenWheel Dashboard` with a normal update.
- Changing the UUID from `openf1dashboard@ansilva` to something such as `openwheeldashboard@ansilva` makes GNOME treat it as a different extension. It also requires renaming the extension directory, updating packaging/install instructions, cache identity if applicable, and potentially creating a separate listing on extensions.gnome.org.

**Recommended migration policy:** initially preserve the existing UUID and directory while changing only the visible name and description. Revisit the UUID only if this should be published as a separate extension rather than an upgrade to the existing listing.

## Current implementation

The extension currently supports:

- Next F1 weekend/session through OpenF1
- F1 driver and constructor standings through Jolpica
- Cache-first loading and bounded JSON responses
- Fixed and allowlisted API hosts/paths
- GNOME Shell 50
- Direct HTTPS requests through GJS/Soup
- API attribution links in the popup

Current source files:

```text
openf1dashboard@ansilva/
├── extension.js
├── metadata.json
├── stylesheet.css
└── LICENSE
```

The implementation is concentrated in `extension.js`, so refactoring should be deliberate and incremental.

## IndyCar API research

Research and live endpoint checks were performed on 2026-10-24.

### Preferred initial source: RaceHooks

Documentation:

- <https://racehooks.io/docs/motorsport-data-api>
- OpenAPI: <https://api.racehooks.io/openapi.json>

Public endpoints verified without authentication:

```text
GET https://api.racehooks.io/v1/indycar/seasons
GET https://api.racehooks.io/v1/indycar/seasons/{year}/races
GET https://api.racehooks.io/v1/indycar/standings
GET https://api.racehooks.io/v1/indycar/drivers
GET https://api.racehooks.io/v1/indycar/races/{raceId}/results
```

Useful standings fields include:

```text
position, driverId, name, team, carNumber, points, behind, wins, poles
```

Observed response properties:

- No API key required
- JSON responses
- Rate-limit headers; a tested response reported a limit of 1,000
- `Cache-Control: public, max-age=3600`
- RaceHooks states that its public IndyCar data API is in its free tier and permits use in value-added commercial applications, but not resale of the raw feed
- No free-tier SLA was identified
- Current IndyCar support is schedules/results/standings/drivers, not live timing

#### Blocking question before schedule implementation

The tested season schedule response listed events and sessions but did **not** expose scheduled dates, UTC start times, venues, or time zones in its documented schema. Those fields are required to reproduce the extension’s useful “next session” behavior.

Before relying on RaceHooks for the schedule:

1. Contact/check RaceHooks for event and session UTC timestamps and venue/time-zone data.
2. Test upcoming-season payloads again in case the schema changes.
3. Do not infer event times from IDs or array order.

RaceHooks is immediately suitable for driver standings. Schedule support is conditional on resolving this timestamp gap.

### Official IndyCar website endpoints: validation/fallback only

The official website currently exposes undocumented JSON routes:

```text
GET https://www.indycar.com/api/results/YearsBySeries?series=b856a4f1-e85c-4fac-8c36-fd58d962227a
GET https://www.indycar.com/api/results/YearPointSummary?year=2026&id=b856a4f1-e85c-4fac-8c36-fd58d962227a
GET https://www.indycar.com/api/results/EventsByYearSeries?year=2026&id=b856a4f1-e85c-4fac-8c36-fd58d962227a
```

The tested `YearPointSummary` payload included driver championship points and per-round information. However:

- These routes are undocumented and unsupported.
- No API contract, API-specific reuse license, or SLA was found.
- Fields and identifiers can change without notice.
- The complete dated schedule appears to require parsing official-site HTML or discovering more private routes.
- Technical accessibility is not permission to redistribute data.

Do not make these the production source without reviewing the current IndyCar terms and obtaining permission where appropriate. They may be useful for manual validation of another provider’s values.

### Other candidates

- **Blacktop:** advertises schedules, results, standings, history since 1996, CORS, and 7,500 free requests/month. It requires an API key. Endpoint behavior could not be independently tested because the host returned a Cloudflare challenge. Trial and verify licensing, timestamps, reliability, and accuracy before considering it.
- **Sportradar IndyCar v2:** documented schedules and several standings types, authentication, trial/sandbox, and commercial support. Strong production option, but production pricing is quote-based and likely unsuitable for a simple free extension unless funded.
- **Jolpica/Ergast, OpenF1, and API-Sports Formula 1:** do not provide the required IndyCar coverage.

## Proposed user experience

Do not mix F1 and IndyCar rows without an obvious series indicator.

Recommended first version:

1. Keep one panel indicator and popup.
2. Add a compact series selector or two clearly labeled sections:
   - `F1`
   - `INDYCAR`
3. Show the selected series’ next event/session and standings.
4. Preserve each series’ independent last-known-good cache.
5. Credit every active data provider in the existing data-source row.

Questions to decide before UI coding:

- Selector versus simultaneous F1 and IndyCar sections
- Default series on first install
- Whether selection persists across Shell restarts
- IndyCar standings depth (Top 10 is consistent with F1)
- Whether the first IndyCar release may show only the next **race/event** if reliable session times are unavailable
- Whether team/manufacturer standings are in scope; RaceHooks’ verified public endpoint currently provides driver standings

## Recommended internal design

Avoid scattering series-specific conditions throughout the existing UI. Introduce a normalized provider boundary, even if it remains in one file initially.

Suggested normalized models:

```js
// Event/session
{
    series: 'f1' | 'indycar',
    eventName: String,
    sessionName: String,
    startUtc: String,       // ISO 8601; never fabricate this
    endUtc: String | null,
    venueName: String | null,
    venueTimeZone: String | null,
    canceled: Boolean,
}

// Driver standing
{
    series: 'f1' | 'indycar',
    position: Number,
    driverName: String,
    teamName: String | null,
    points: Number,
}
```

Possible provider methods:

```text
loadF1Schedule()
loadF1Standings()
loadIndyCarSchedule()
loadIndyCarStandings()
```

Normalize API responses immediately after parsing. Rendering code should consume the normalized models rather than provider-native JSON.

## Suggested implementation sequence

1. **Confirm product identity**
   - Confirm visible name `OpenWheel Dashboard`.
   - Decide whether to preserve `openf1dashboard@ansilva` as recommended.

2. **Confirm minimum viable scope**
   - Decide whether IndyCar standings can ship before schedule/session time support.
   - Resolve the RaceHooks timestamp question.

3. **Create regression baseline on Linux**
   - Install and run the current branch before modifications.
   - Record extension state, errors, popup behavior, and both existing API paths.

4. **Refactor without behavior changes**
   - Extract/identify provider-specific parsing boundaries.
   - Preserve existing F1 output and caching behavior.

5. **Add IndyCar standings**
   - Add the fixed RaceHooks host and exact endpoint allowlist.
   - Validate schema, types, response size, HTTP status, and empty/error states.
   - Add a provider-specific cache key.

6. **Add series UI and persistence**
   - Keep labels textual and GNOME-review friendly.
   - Avoid icons or trademarks unless redistribution rights are clear.

7. **Add IndyCar schedule only with authoritative timestamps**
   - Parse explicit UTC timestamps.
   - Handle time-zone conversion using the same principles as F1.
   - If only event dates are available, label the UI accordingly; do not imply session-level precision.

8. **Rename user-facing metadata and documentation**
   - Update `metadata.json`, README, package commands, descriptions, credits, security discussion, and screenshots if any.
   - Preserve UUID unless the separate-extension decision is made.

9. **Test and package**
   - Verify enable/disable cycles, cancellation of requests, cache behavior, offline behavior, malformed payloads, 404/429 handling, and year rollover.

## Security and review constraints

Continue the current project’s defensive approach:

- HTTPS-only fixed hosts
- Exact endpoint/path allowlisting
- No user-controlled arbitrary URLs
- No API secrets embedded in the extension
- Response and cache size limits
- Payload-shape and type validation
- Request cancellation on disable
- Generic user-facing errors; detailed diagnostics only in logs
- Conservative refresh intervals and last-known-good cache
- Provider attribution and license/terms review

If a provider requires a secret API key, do not commit it or place it in distributed extension JavaScript. That would require a proxy service or a different provider.

## Linux pickup instructions

On the Linux machine, from an existing clone:

```bash
cd /path/to/openf1-gnome-extension
git status
git fetch origin
git switch feature/open-wheel-indycar
git pull --ff-only origin feature/open-wheel-indycar
```

For a new clone:

```bash
git clone git@github.com:afsilva/openf1-gnome-extension.git
cd openf1-gnome-extension
git switch --track origin/feature/open-wheel-indycar
```

Read this file before coding:

```bash
less DEVELOPMENT_HANDOFF.md
```

Confirm the branch and clean working tree:

```bash
git branch --show-current
git status --short --branch
```

Expected branch:

```text
feature/open-wheel-indycar
```

### Baseline install/test

```bash
UUID="openf1dashboard@ansilva"
mkdir -p ~/.local/share/gnome-shell/extensions
rm -rf ~/.local/share/gnome-shell/extensions/$UUID
cp -r "$UUID" ~/.local/share/gnome-shell/extensions/
gnome-extensions enable "$UUID"
```

Inspect state and errors:

```bash
gnome-extensions info "$UUID"
gdbus call --session \
  --dest org.gnome.Shell.Extensions \
  --object-path /org/gnome/Shell/Extensions \
  --method org.gnome.Shell.Extensions.GetExtensionErrors \
  "$UUID"
journalctl --user --since "10 min ago" | grep -Ei \
  "gnome-shell|openf1dashboard|openwheel"
```

Wayland-safe reload during development:

```bash
gnome-extensions disable "$UUID"
gnome-extensions enable "$UUID"
```

Package after implementation:

```bash
gnome-extensions pack --force --extra-source=LICENSE "$UUID"
```

## First Linux development checklist

Before writing feature code, answer and record these decisions in this file or a follow-up design document:

- [ ] Confirm visible name: `OpenWheel Dashboard` or alternative
- [ ] Preserve existing UUID or publish as a separate extension
- [ ] Series selector or simultaneous sections
- [ ] Confirm source of authoritative IndyCar UTC schedule timestamps
- [ ] Driver-only IndyCar standings for v1, or additional standings
- [ ] Confirm provider attribution text and links
- [ ] Confirm current RaceHooks usage terms and rate limits
- [ ] Confirm GNOME Shell target version on the Linux test machine

## Branch discipline

Keep this feature isolated on `feature/open-wheel-indycar`. Make small commits such as:

```text
refactor: normalize series schedule data
feat: add IndyCar driver standings provider
feat: add series selector
feat: add IndyCar schedule
chore: rename extension to OpenWheel Dashboard
 docs: document providers and migration
```

Do not merge into `main` until the existing F1 functionality remains stable, provider terms have been reviewed, schedule timestamps are authoritative, and the extension passes runtime validation on Linux.
