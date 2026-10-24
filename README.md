# OpenIndy Dashboard (GNOME 50+ Extension)

A standalone GNOME Shell extension for IndyCar fans. It displays:

- The next race on the official 2027 NTT INDYCAR SERIES calendar
- Final/current 2026 driver championship points from RaceHooks

Formula 1 is intentionally not included. OpenIndy uses its own UUID, cache, UI,
and data providers, so it can coexist with OpenF1 Dashboard.

Future work that depends on authoritative practice, qualifying, warmup, and race
timestamps is tracked in [`TODO.md`](./TODO.md). It documents the current API
schema gap and the acceptance criteria for adding session-level timing safely.

## Data and accuracy

### 2027 calendar

The 17 race dates and venues are from INDYCAR's official schedule announcement
of October 23, 2026:

<https://www.indycar.com/news/2026/10/10-23-2027-schedule-phase-two>

INDYCAR stated that event start times would be announced later. OpenIndy stores
only the published race date and venue and displays **Start time not announced**.
It does not invent a UTC or local start time. The calendar is bundled because
RaceHooks did not yet expose its 2027 season on October 24, 2026.

### Driver points

Driver standings come from the public RaceHooks IndyCar API:

```text
GET https://api.racehooks.io/v1/indycar/standings
```

The API identifies the season in its response. As of October 24, 2026 it returns
the 2026 standings. OpenIndy displays that season independently from the next
calendar race, so the next 2027 race and final 2026 points can appear together.

RaceHooks documentation:

<https://racehooks.io/docs/motorsport-data-api>

## Compatibility

- GNOME Shell 50 — Fedora Linux 44
- GNOME Shell 51 — Fedora Linux 45

The extension uses the GNOME 45+ ES module format and lists each supported major
Shell version explicitly in `metadata.json`.

## Install for local testing

```bash
cd /path/to/openindy-gnome-extension
UUID="openindydashboard@ansilva"
gnome-extensions disable "$UUID" 2>/dev/null || true
gnome-extensions pack --force --extra-source=LICENSE "$UUID"
gnome-extensions install --force "$UUID.shell-extension.zip"
```

If a previous package with different compatibility metadata appears as
`OUT OF DATE`, log out and back in once before enabling it. GNOME Shell caches
extension metadata for the life of the Shell process. Do not disable extension
version validation as a workaround.

```bash
gnome-extensions enable "$UUID"
gnome-extensions info "$UUID"
```

Inspect runtime errors:

```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions \
  --object-path /org/gnome/Shell/Extensions \
  --method org.gnome.Shell.Extensions.GetExtensionErrors \
  "$UUID"

journalctl --user --since "10 min ago" | \
  grep -Ei "gnome-shell|openindydashboard"
```

## Refresh and cache behavior

- The extension renders the bundled calendar immediately.
- Standings refresh at most once per hour unless the user selects **Refresh points**.
- Last-known-good standings are stored in:
  ```text
  ~/.cache/openindy-dashboard-cache.json
  ```
- Cached UI remains visible during temporary network errors or rate limiting.
- OpenIndy does not collect user information or use authentication credentials.

## Package for extensions.gnome.org

From the repository root:

```bash
UUID="openindydashboard@ansilva"
gnome-extensions pack --force --extra-source=LICENSE "$UUID"
```

This creates:

```text
openindydashboard@ansilva.shell-extension.zip
```

The upload archive contains only:

```text
metadata.json
extension.js
stylesheet.css
LICENSE
```

Generated `.shell-extension.zip` files are intentionally ignored by Git.

## GNOME review considerations

- Standard ES module `Extension` subclass with synchronous `enable()`/`disable()`
- No preferences process, subprocesses, bundled dependencies, or dynamic code
- No modifications to GNOME Shell internals
- Pending Soup requests are aborted and signals/timers are disconnected on disable
- Cache reads are asynchronous in the GNOME Shell process
- Text-only status labels; no redistributed trademarks or logos
- Fixed, user-initiated attribution links
- GPL license included in the upload archive

## Security review (OWASP Top 10 aligned)

OpenIndy is a local read-only UI client, not a server. It processes no accounts,
credentials, payments, or user-submitted URLs. The applicable controls are:

### A01 Broken Access Control

- No privileged actions, authentication, roles, or backend mutations.
- It only reads public motorsport data and writes one user-cache file.

### A02 Cryptographic Failures

- Network access is HTTPS-only.
- No secrets, tokens, or personal data are stored.

### A03 Injection

- The RaceHooks host is a fixed constant.
- API paths use an exact allowlist or a four-digit season pattern.
- No API path or URL comes from user input.
- Control characters, newlines, repeated whitespace, and excessive lengths are
  removed from provider text before rendering.

### A04 Insecure Design

- The calendar never fabricates an unpublished start time.
- Only the official driver championship is shown; no team championship is inferred.
- Cache-first behavior, conservative refreshes, and independent error states
  reduce provider pressure and preserve useful last-known-good data.

### A05 Security Misconfiguration

- Soup requests have a timeout.
- User-visible errors are generic; detailed failure text goes only to Shell logs.
- The runtime archive contains no development artifacts.

### A06 Vulnerable and Outdated Components

- No third-party JavaScript is bundled.
- Runtime dependencies are provided by the supported GNOME platform and should
  be updated through the operating system.

### A07 Identification and Authentication Failures

- Not applicable; the extension has no authentication flow.

### A08 Software and Data Integrity Failures

- Response bodies are limited to 1 MiB and the disk cache to 2 MiB.
- Top-level and nested provider shapes are validated.
- Numeric fields are bounded and rendered strings are sanitized.
- No `eval`, dynamic imports, or downloaded executable code is used.

### A09 Security Logging and Monitoring Failures

- Refresh failures are logged with an OpenIndy-specific prefix.
- GNOME's extension error API and user journal provide operational diagnostics.
- Raw response payloads are not written to logs.

### A10 Server-Side Request Forgery

- The only programmatic network destination is the fixed RaceHooks HTTPS host.
- Attribution URLs are fixed constants and open only after a user click.

## Open-source transparency

OpenIndy Dashboard is based on and inspired by the original
[OpenF1 Dashboard](https://github.com/afsilva/openf1-gnome-extension). The
projects intentionally share early Git history and defensive GNOME Shell design
patterns, but are now independent extensions for different audiences. OpenIndy
uses a separate repository, UUID, package directory, cache, providers, labels,
and release lifecycle.

AI-assisted development tooling was used during implementation and documentation.
The project author directed the requirements, reviewed the code, and remains
responsible for runtime validation, provider terms, and submitted releases.

## License

GNU General Public License v3.0 or later. See [`LICENSE`](./LICENSE).
