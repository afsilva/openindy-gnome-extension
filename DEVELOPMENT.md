# OpenIndy Development and Roadmap

**Repository:** `afsilva/openindy-gnome-extension`
**Extension UUID:** `openindydashboard@ansilva`
**Target:** GNOME Shell 50 and 51
**Initial implementation:** 2026-10-24

This is the canonical document for OpenIndy's architecture, provider findings,
validation requirements, known data gaps, and future work. User-facing behavior,
installation, security rationale, and packaging are documented in
[`README.md`](./README.md).

## Product decision

OpenIndy Dashboard is a standalone IndyCar extension, not a mode inside OpenF1
Dashboard. Separate repositories, UUIDs, caches, providers, and release
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

The extension currently calls only `standings`. Keep provider usage, schema,
terms, attribution, and rate limits under review before each release.

### Points behavior

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
- Periodic and manual refresh
- Asynchronous cache loading and bounded cache writes
- Response validation and normalization
- Driver points rendering
- Signal, timer, cancellable, and HTTP cleanup

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

## Known data gap: session dates and start times

### Current RaceHooks schema

As verified on 2026-10-24, RaceHooks exposes events and session names through:

```text
GET https://api.racehooks.io/v1/indycar/seasons/{year}/races
```

An event currently contains:

```json
{
  "eventId": 5520,
  "name": "Ontario Honda Dealers Indy at Markham",
  "sessions": []
}
```

A session currently contains only:

```json
{
  "sessionId": 6911,
  "name": "Practice 1",
  "raceId": "2026-5520-6911"
}
```

The documented OpenAPI schema and tested 2026 payload contain names for
practice, qualifying rounds, warmup, and race sessions, but provide none of:

```text
event date
venue or location
start/end timestamp
UTC offset
IANA time zone
```

The `raceId` is documented as an identifier for the results endpoint, not as a
timestamp. Do not infer dates or times from identifiers, response order, event
names, television listings, or past seasons.

RaceHooks listed seasons only through 2026 and returned HTTP 404 for:

```text
GET /v1/indycar/seasons/2027/races
```

There is no documented guarantee that time fields will automatically appear
after INDYCAR announces them.

### Current safe behavior

INDYCAR published the complete 17-race 2027 calendar on 2026-10-23 and stated
that tune-in/start times would be announced later. OpenIndy bundles only those
official race dates and venues:

<https://www.indycar.com/news/2026/10/10-23-2027-schedule-phase-two>

The extension deliberately displays:

```text
Start time not announced
```

The runtime uses this bundled date-only calendar and calls RaceHooks only for
standings. If RaceHooks later adds time fields, the UI will not change
automatically; session support requires an explicit implementation and review.

### Work required for session timing

- [ ] Recheck RaceHooks documentation and live OpenAPI schema.
- [ ] Recheck `GET /v1/indycar/seasons/2027/races` and a live payload.
- [ ] Confirm the source's usage terms and required attribution.
- [ ] Require explicit ISO 8601 UTC start timestamps; never fabricate them.
- [ ] Use end timestamps only when supplied or documented. Do not guess session
      duration to claim a session is live.
- [ ] Accept venue-local time only with an authoritative IANA zone or documented
      offset; account for daylight-saving transitions.
- [ ] Normalize provider data immediately after validation, for example:

  ```js
  {
      eventName: String,
      sessionName: String,
      startUtc: String,
      endUtc: String | null,
      venueName: String | null,
      venueTimeZone: String | null,
      canceled: Boolean,
  }
  ```

- [ ] Sort sessions by validated UTC timestamps.
- [ ] Select current/next sessions from timestamps, not provider array order.
- [ ] Display system-local and UTC times; show venue-local time only when its
      time-zone source is authoritative.
- [ ] Handle postponed, canceled, delayed, and rescheduled sessions explicitly.
- [ ] Keep the bundled official calendar as a clearly labeled fallback only if
      its maintenance policy remains practical.
- [ ] Cache schedule data independently from standings.
- [ ] Preserve last-known-good schedule data during 404, 429, malformed, and
      offline responses.
- [ ] Add payload fixtures and tests for invalid dates, missing zones, DST
      boundaries, year rollover, schedule changes, and empty seasons.
- [ ] Test full practice/qualifying/race weekends on GNOME Shell 50 and 51.
- [ ] Update attribution, security documentation, screenshots, and release
      notes before publishing session-time support.

### Session-timing acceptance criteria

Session-level calendar support is ready only when:

1. A stable, documented, permitted source supplies authoritative timestamps.
2. The extension validates and normalizes the source without guessing data.
3. Live/next labels remain correct across UTC, local time, venue time, and DST.
4. Canceled or moved sessions cannot be shown as upcoming/live incorrectly.
5. Failure falls back to clearly dated cached or bundled information.
6. Runtime testing passes on every declared GNOME Shell major version.

## Development and validation

Install/package:

```bash
UUID="openindydashboard@ansilva"
gnome-extensions pack --force --extra-source=LICENSE "$UUID"
gnome-extensions install --force "$UUID.shell-extension.zip"
```

If GNOME Shell has cached old metadata, log out and back in once. Then:

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

- [ ] Enable on a clean GNOME Shell 50 session.
- [x] Run an isolated headless smoke test on GNOME Shell 51.
- [ ] Confirm OpenIndy and OpenF1 can be enabled simultaneously.
- [ ] Confirm the next 2027 event around local-date boundaries.
- [x] Confirm standings season comes from the response rather than system year.
- [x] Compare the standings payload shape and driver points with the provider.
- [x] Confirm no team/constructor standings are displayed or inferred.
- [ ] Test empty, malformed, oversized, 404, 429, and offline behavior.
- [ ] Confirm cached points survive a network outage.
- [ ] Confirm repeated enable/disable cycles leave no errors or timers.
- [x] Confirm package contents, integrity, metadata, and license.
- [ ] Recheck RaceHooks terms, schema, attribution, and rate limits before release.

## Other future work

- [ ] Add automated normalization and cache tests outside the distributed ZIP.
- [ ] Reassess optional driver details such as car number, wins, and poles
      without overcrowding the popup.
- [ ] Define a repeatable calendar update process before the 2028 season.
- [ ] Verify OpenIndy and OpenF1 remain installable and enabled simultaneously.

## Explicitly out of scope

- Team or constructor standings; OpenIndy will not infer a championship that the
  series does not run.
- Scraping undocumented private endpoints as a production dependency.
- Embedding provider API secrets in distributed extension JavaScript.
- Displaying estimated start times as if they were official.
