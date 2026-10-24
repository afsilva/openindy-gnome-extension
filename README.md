# OpenIndy GNOME Extension

A standalone IndyCar-focused GNOME Shell extension project.

> **Development status:** planning/scaffolding. No IndyCar runtime functionality
> has been implemented yet. The currently imported OpenF1 Dashboard code is a
> temporary GNOME Shell baseline and must not be packaged or published as
> OpenIndy.

This repository was split from the former `feature/open-wheel-indycar` branch of
[`afsilva/openf1-gnome-extension`](https://github.com/afsilva/openf1-gnome-extension).
OpenF1 Dashboard and OpenIndy are intentionally separate so users can install
only the racing series they follow—or install both without either extension
controlling the other.

## Planned scope

- IndyCar driver standings
- Upcoming IndyCar event/session information when authoritative UTC timestamps
  are available
- Cache-first behavior and useful offline/last-known-good state
- Fixed HTTPS providers, strict response validation, bounded cache/response
  sizes, and request cancellation
- Independent UUID, cache, metadata, UI, and provider attribution
- Coexistence with `openf1dashboard@ansilva`

## Before development

Read [`DEVELOPMENT_HANDOFF.md`](./DEVELOPMENT_HANDOFF.md). It records the API
research, unresolved schedule-data issue, security requirements, proposed
standalone identity, and implementation sequence.

Important: do not release the current imported package. It still has the OpenF1
UUID, directory, providers, labels, and cache identity. The first implementation
step is to establish a distinct OpenIndy identity, proposed as:

```text
Visible name: OpenIndy Dashboard
UUID/directory: openindydashboard@ansilva
```

The final UUID must be decided before publication and remain stable afterward.

## Repository relationship

This repository preserves the history of the original planning branch for
traceability. Future OpenIndy work belongs here. Formula 1 development remains
in [`openf1-gnome-extension`](https://github.com/afsilva/openf1-gnome-extension).

## License

This project is licensed under the GNU General Public License v3.0 or later.
See [`LICENSE`](./LICENSE).
