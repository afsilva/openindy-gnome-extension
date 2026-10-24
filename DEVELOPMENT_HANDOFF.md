# OpenIndy Development Handoff

**Branch:** `main`
**Prepared:** 2026-10-24
**Repository:** `afsilva/openindy-gnome-extension`

## Purpose

This repository is the standalone development home for an IndyCar-focused GNOME Shell extension. It was split from the former `feature/open-wheel-indycar` branch of `afsilva/openf1-gnome-extension` so Formula 1 and IndyCar users can install independent extensions.

The imported OpenF1 implementation is reference/scaffolding only. No IndyCar runtime code has been implemented yet. Before the first release, remove all F1 providers and behavior, rename the extension directory and classes, and adopt a new UUID so OpenIndy can coexist with OpenF1 Dashboard.

## Product identity

Recommended working identity:

- Repository: **openindy-gnome-extension**
- Visible name: **OpenIndy Dashboard**
- Proposed UUID/directory: `openindydashboard@ansilva`
- Panel label: `INDY`
- Cache file: a separate OpenIndy-specific path

The final UUID must be selected before publishing and then treated as stable. It must not remain `openf1dashboard@ansilva`, because that would conflict with OpenF1 Dashboard and prevent users from installing both extensions.

Avoid official IndyCar logos, trademarks, or other protected artwork unless redistribution rights are clear. A textual interface is sufficient and aligns with GNOME extension review expectations.

## Imported baseline

The repository currently contains the OpenF1 Dashboard implementation as a known-working GNOME Shell baseline:

```text
openf1dashboard@ansilva/
├── extension.js
├── metadata.json
├── stylesheet.css
└── LICENSE
```

Useful behavior to retain while replacing all F1-specific functionality:

- Cache-first loading and last-known-good UI
- Bounded JSON responses and on-disk cache
- Fixed, allowlisted HTTPS hosts and paths
- Asynchronous cache reads
- Soup request cancellation on disable
- Generic user-facing errors
- API attribution links
- GNOME Shell 50/51 lifecycle and ES module structure

The implementation is concentrated in `extension.js`, so replacement should be deliberate and incremental. Do not publish an OpenIndy package while it still contains F1 metadata, API calls, labels, UUID, or cache identity.

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
- Current support is schedules/results/standings/drivers, not live timing

Reconfirm current terms, attribution requirements, endpoint behavior, and rate limits before release.

### Blocking question before schedule implementation

The tested season schedule response listed events and sessions but did **not** expose scheduled dates, UTC start times, venues, or time zones in its documented schema. Those fields are required for a reliable “next session” experience.

Before relying on RaceHooks for the schedule:

1. Contact/check RaceHooks for event and session UTC timestamps and venue/time-zone data.
2. Test upcoming-season payloads again in case the schema changes.
3. Do not infer event times from IDs or array order.

RaceHooks appears immediately suitable for driver standings. Schedule support is conditional on resolving this timestamp gap.

### Official IndyCar website endpoints: validation only

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
- The complete dated schedule appears to require parsing official-site HTML or discovering private routes.
- Technical accessibility is not permission to redistribute data.

Do not use these as the production source without reviewing current terms and obtaining permission where appropriate. They may be useful for manual validation of another provider’s values.

### Other candidates

- **Blacktop:** advertises schedules, results, standings, history since 1996, CORS, and 7,500 free requests/month. It requires an API key. Endpoint behavior could not be independently tested because the host returned a Cloudflare challenge. Trial and verify licensing, timestamps, reliability, and accuracy before considering it.
- **Sportradar IndyCar v2:** documented schedules and several standings types, authentication, trial/sandbox, and commercial support. Strong production option, but production pricing is quote-based and likely unsuitable for a simple free extension unless funded.
- **Jolpica/Ergast, OpenF1, and API-Sports Formula 1:** do not provide the required IndyCar coverage.

## Proposed user experience

Recommended first version:

1. One `INDY` panel indicator and popup.
2. Next event/session only when authoritative dates and UTC times are available.
3. IndyCar driver standings, initially Top 10.
4. Independent last-known-good OpenIndy cache.
5. Attribution for every active data provider.
6. Clear empty, offline, rate-limit, and unavailable-schedule states.

Questions to decide before UI coding:

- Whether standings-only is acceptable for the first release
- Whether the first schedule release may show only the next **race/event** when session times are unavailable
- Whether manufacturer/team standings are in scope; RaceHooks’ verified public endpoint currently provides driver standings
- Whether standings should show car number, team, wins, and/or poles

## Recommended internal design

Normalize provider data immediately after validation. Rendering code should not depend on RaceHooks-native JSON.

Suggested models:

```js
// Event/session
{
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
    position: Number,
    driverName: String,
    teamName: String | null,
    carNumber: String | null,
    points: Number,
    wins: Number | null,
    poles: Number | null,
}
```

Possible provider methods:

```text
loadIndyCarSchedule()
loadIndyCarStandings()
```

Keep fetching, payload validation, normalization, cache state, and rendering as distinct conceptual boundaries, even if the first implementation remains in one file.

## Suggested implementation sequence

1. **Establish standalone identity**
   - Rename the source directory to the final UUID, proposed as `openindydashboard@ansilva`.
   - Rename extension classes, constants, labels, metadata, CSS classes, cache filename, and log prefixes.
   - Update repository URLs and documentation.
   - Verify OpenF1 Dashboard and OpenIndy can be installed simultaneously.

2. **Create a regression baseline**
   - Record the imported extension’s GNOME Shell lifecycle behavior before replacing providers.
   - Preserve enable/disable cleanup, asynchronous cache loading, bounded responses, and packaging structure.

3. **Remove F1 behavior**
   - Remove OpenF1 and Jolpica hosts, endpoint allowlists, parsers, credits, labels, and F1-specific UI.
   - Never ship copied F1 functionality under the OpenIndy identity.

4. **Add IndyCar standings**
   - Add the fixed RaceHooks host and exact endpoint allowlist.
   - Validate schema, types, response size, HTTP status, and empty/error states.
   - Normalize and cache standings under OpenIndy-specific keys.

5. **Add IndyCar schedule only with authoritative timestamps**
   - Parse explicit UTC timestamps.
   - Convert to system-local and venue-local time only from authoritative data.
   - If only event dates are available, label the UI accordingly; do not imply session-level precision.

6. **Finish documentation and attribution**
   - Document providers, refresh behavior, privacy/security boundaries, local installation, packaging, and known limitations.

7. **Test and package**
   - Verify enable/disable cycles, cancellation, cache behavior, offline behavior, malformed payloads, 404/429 handling, year rollover, and coexistence with OpenF1 Dashboard.

## Security and review constraints

Continue the imported project’s defensive approach:

- HTTPS-only fixed hosts
- Exact endpoint/path allowlisting
- No user-controlled arbitrary URLs
- No API secrets embedded in distributed JavaScript
- Response and cache size limits
- Payload-shape and type validation
- Request cancellation on disable
- Generic user-facing errors; detailed diagnostics only in logs
- Conservative refresh intervals and last-known-good cache
- Provider attribution and license/terms review

If a provider requires a secret API key, do not commit it or place it in the extension. That would require a proxy service or a different provider.

## Linux pickup instructions

For a new clone:

```bash
git clone git@github.com:afsilva/openindy-gnome-extension.git
cd openindy-gnome-extension
git switch main
git pull --ff-only origin main
```

Read this file before coding:

```bash
less DEVELOPMENT_HANDOFF.md
```

Confirm a clean worktree:

```bash
git status --short --branch
```

During development, replace `UUID` below with the finalized standalone OpenIndy UUID:

```bash
UUID="openindydashboard@ansilva"
gnome-extensions pack --force --extra-source=LICENSE "$UUID"
gnome-extensions install --force "$UUID.shell-extension.zip"
```

On Wayland, log out and back in when changed metadata is not reloaded by an enable/disable cycle.

Inspect state and errors:

```bash
gnome-extensions info "$UUID"
gdbus call --session \
  --dest org.gnome.Shell.Extensions \
  --object-path /org/gnome/Shell/Extensions \
  --method org.gnome.Shell.Extensions.GetExtensionErrors \
  "$UUID"
journalctl --user --since "10 min ago" | grep -Ei \
  "gnome-shell|openindy"
```

## First development checklist

- [x] Use a standalone repository instead of merging IndyCar into OpenF1 Dashboard
- [ ] Confirm visible name (`OpenIndy Dashboard` or alternative)
- [ ] Confirm final standalone UUID and directory
- [ ] Confirm GNOME Shell target versions
- [ ] Confirm whether standings-only is acceptable for v1
- [ ] Confirm authoritative IndyCar UTC schedule source
- [ ] Confirm standings fields and depth
- [ ] Confirm provider attribution text and links
- [ ] Reconfirm current RaceHooks terms and rate limits
- [ ] Verify coexistence with `openf1dashboard@ansilva`

## Branch discipline

Use short feature branches from `main` and focused commits such as:

```text
chore: establish standalone OpenIndy identity
refactor: isolate provider data normalization
feat: add IndyCar driver standings provider
feat: add IndyCar schedule
 docs: document providers and release process
```

Do not publish the extension until all F1 identity and provider code has been removed, provider terms have been reviewed, schedule timestamps are authoritative for any schedule UI, and runtime validation passes on supported GNOME Shell versions.
