# OpenIndy Development Notes

**Repository:** `afsilva/openindy-gnome-extension`
**Extension UUID:** `openindydashboard@ansilva`
**Target:** GNOME Shell 50 and 51
**Initial implementation:** 2026-10-24

## Product decision

OpenIndy Dashboard is a standalone IndyCar extension. It is not a mode inside
OpenF1 Dashboard. Separate repositories, UUIDs, caches, providers, and release
lifecycles let Formula 1 and IndyCar users install either project or both.

The codebase is based on and inspired by the original OpenF1 Dashboard as part
of an explicit open-source and development-transparency approach. Early Git
history is shared, but all current runtime identifiers and behavior are
OpenIndy-specific.

## Implemented first version

- Bundled official 2027 race dates and venues
- Next-race selection based on the user's local calendar date
- Explicit `Start time not announced` state; no fabricated session precision
- RaceHooks current/final driver standings
- Top 10 driver display
- No inferred team/constructor championship
- Hourly refresh policy plus manual refresh
- Independent bounded endpoint/UI disk cache
- Last-known-good points during provider failures
- GNOME Shell 50/51 metadata and modern ES modules
- Fixed provider host/path allowlisting, response limits, sanitization, cleanup,
  and GNOME review-oriented package structure

## Provider findings

### RaceHooks

Verified public endpoints on 2026-10-24:

```text
GET https://api.racehooks.io/v1/indycar/seasons
GET https://api.racehooks.io/v1/indycar/seasons/{year}/races
GET https://api.racehooks.io/v1/indycar/standings
GET https://api.racehooks.io/v1/indycar/drivers
GET https://api.racehooks.io/v1/indycar/races/{raceId}/results
```

Observed:

- No authentication required for these IndyCar endpoints
- JSON responses
- `Cache-Control: public, max-age=3600`
- Rate-limit headers reporting a limit of 1,000 during testing
- Documentation describes the public API as commercially usable

The extension currently calls only `standings`. Keep provider usage and terms
under review before each release.

### 2027 calendar limitation

On 2026-10-24, RaceHooks listed seasons only through 2026 and returned 404 for:

```text
GET /v1/indycar/seasons/2027/races
```

Its schedule schema also exposed event/session identifiers and names but not
scheduled dates, UTC times, venues, or time zones.

INDYCAR published the complete 17-race 2027 calendar on 2026-10-23 and stated
that tune-in/start times would be announced later. The extension therefore
bundles only the official date and venue. This is safer than parsing an
unsupported website endpoint or inferring precision from provider ordering.

Official source:

<https://www.indycar.com/news/2026/10/10-23-2027-schedule-phase-two>

When an API later supplies authoritative timestamps, replace the bundled data
with validated UTC timestamps and retain a fallback only if its maintenance and
review policy is explicit.

### Points limitation

RaceHooks `standings` identifies its season dynamically. On 2026-10-24 it
returned season 2026. The calendar and standings seasons are intentionally
independent, allowing a 2027 next race to appear beside final 2026 points.

IndyCar does not run a conventional team/constructor championship. Even though
the provider includes team names with driver records, OpenIndy intentionally
shows only the official driver championship and does not infer team totals.

## Architecture

Runtime package:

```text
openindydashboard@ansilva/
├── extension.js
├── metadata.json
├── stylesheet.css
└── LICENSE
```

`OpenIndyIndicator` owns:

- GNOME panel and popup actors
- Soup HTTP session
- periodic and manual refresh
- asynchronous cache loading and bounded cache writes
- response validation/normalization
- points aggregation and rendering
- signal, timer, cancellable, and HTTP cleanup

The calendar is local immutable data. Standings are fetched from one fixed host
and exact path. Rendering consumes normalized, bounded records rather than raw
provider objects.

## Security and GNOME review invariants

Preserve these constraints:

- HTTPS-only fixed network destination
- Exact path allowlist; no arbitrary user URLs
- No embedded API keys or secrets
- 1 MiB response and 2 MiB cache limits
- Array/object shape checks and bounded numbers
- Sanitized and length-limited provider strings
- No dynamic code, subprocesses, or bundled dependencies
- Asynchronous cache reads in the Shell process
- Request abort, timer removal, signal disconnect, and cancellable cancellation
  during synchronous `disable()`
- Generic UI errors and payload-free diagnostic logs
- Text UI and fixed, click-initiated attribution links
- Archive limited to metadata, JavaScript, stylesheet, and license

The detailed OWASP Top 10-aligned review is maintained in `README.md`.

## Development and validation

Install/package:

```bash
UUID="openindydashboard@ansilva"
gnome-extensions pack --force --extra-source=LICENSE "$UUID"
gnome-extensions install --force "$UUID.shell-extension.zip"
```

If GNOME Shell has already cached old metadata, log out and back in once. Then:

```bash
gnome-extensions enable "$UUID"
gnome-extensions info "$UUID"
gdbus call --session \
  --dest org.gnome.Shell.Extensions \
  --object-path /org/gnome/Shell/Extensions \
  --method org.gnome.Shell.Extensions.GetExtensionErrors \
  "$UUID"
```

Validation checklist:

- [ ] Enable on a clean GNOME Shell 50 session
- [ ] Enable on a clean GNOME Shell 51 session
- [ ] Confirm OpenIndy and OpenF1 can be enabled simultaneously
- [ ] Confirm next 2027 event around local-date boundaries
- [ ] Confirm standings season comes from the response rather than system year
- [ ] Compare displayed driver points with the provider
- [ ] Confirm no team/constructor standings are displayed or inferred
- [ ] Confirm empty, malformed, oversized, 404, 429, and offline behavior
- [ ] Confirm cached points survive a network outage
- [ ] Confirm repeated enable/disable cycles leave no errors or timers
- [ ] Confirm package contents and license
- [ ] Recheck RaceHooks terms, schema, attribution, and rate limits
- [ ] Replace bundled dates if authoritative API schedule timestamps become available

## Future work

- Add authoritative event/session UTC times when available
- Add venue time zones only from a reliable source
- Add automated normalization tests outside the distributed runtime package
- Reconsider displaying car numbers, wins, or poles without overcrowding the popup
- Decide how to migrate bundled calendar data for the 2028 season
