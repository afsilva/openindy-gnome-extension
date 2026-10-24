# OpenIndy Roadmap and Data Gaps

This file tracks work that depends on upstream IndyCar schedule data or remains
outside the first release. Completed behavior and operational details belong in
[`README.md`](./README.md); implementation history and architecture belong in
[`DEVELOPMENT_HANDOFF.md`](./DEVELOPMENT_HANDOFF.md).

## Session dates and start times

### Current limitation

As verified on 2026-10-24, RaceHooks exposes IndyCar events and session names at:

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

The documented OpenAPI schema and tested 2026 payload contain session names for
practice, qualifying rounds, warmup, and the race, but provide none of these:

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

RaceHooks listed seasons only through 2026 and returned HTTP 404 for its 2027
schedule endpoint during the same check. There is no documented guarantee that
time fields will automatically appear after INDYCAR announces them.

### Current safe behavior

OpenIndy bundles the 17 race dates and venues from INDYCAR's official October
23, 2026 schedule announcement:

<https://www.indycar.com/news/2026/10/10-23-2027-schedule-phase-two>

The announcement states that tune-in/start times will be published later.
Therefore the extension deliberately displays:

```text
Start time not announced
```

The runtime uses this bundled date-only calendar and calls RaceHooks only for
standings. Merely adding time fields to RaceHooks will not change OpenIndy's UI;
an explicit implementation and review are required.

### Work required when authoritative timing becomes available

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

- [ ] Sort all sessions by validated UTC timestamps.
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
- [ ] Test the popup with full practice/qualifying/race weekends on GNOME Shell
      50 and 51.
- [ ] Update provider attribution, security documentation, screenshots, and
      release notes before publishing session-time support.

### Acceptance criteria

Session-level calendar support is ready only when:

1. A stable, documented, permitted source supplies authoritative timestamps.
2. The extension validates and normalizes the source without guessing data.
3. Live/next labels remain correct across UTC, local time, venue time, and DST.
4. Canceled or moved sessions cannot be shown as upcoming/live incorrectly.
5. Failure falls back to clearly dated cached or bundled information.
6. Runtime testing passes on every declared GNOME Shell major version.

## Other future work

- [ ] Add automated normalization and cache tests outside the distributed ZIP.
- [ ] Reassess optional driver details such as car number, wins, and poles
      without overcrowding the popup.
- [ ] Define a repeatable calendar update process before the 2028 season.
- [ ] Verify OpenIndy and OpenF1 remain installable and enabled simultaneously.
- [ ] Recheck RaceHooks terms, schema, attribution, and rate limits before each
      release.

## Explicitly out of scope

- Team or constructor standings: IndyCar does not run a conventional
  team/constructor championship, so OpenIndy will not infer one.
- Scraping undocumented private endpoints as a production dependency.
- Embedding a provider API secret in distributed extension JavaScript.
- Displaying estimated start times as if they were official.
