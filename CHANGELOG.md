# @interop/http-client Changelog

## 1.0.4 - 2026-06-28

### Fixed

- **A `json`-substring content-type is no longer auto-parsed as JSON.** A
  successful response was parsed into `response.data` whenever its content-type
  merely _contained_ the substring `json`, so a JSON-Lines / NDJSON / JSON-seq
  body (`application/jsonl`, `application/json-seq`, `application/json5`) was run
  through `response.json()` -- which throws on a multi-line body, failing the
  whole request. The check now anchors the `json` token to the end of the media
  type, matching only `application/json` and `application/<prefix>+json` (e.g.
  `application/ld+json`); other types leave `response.data` undefined and the
  raw body readable via `.text()` / `.arrayBuffer()`. The same anchored check is
  applied to error-body parsing.

## 1.0.3 - 2024-05-24

### Changed

- Bumped engine floor to `>=22.12`
- Added a `default` export (for use via `require()`)

## 1.0.2 - 2024-05-24

### Changed

- Forked from `digitalbazaar/http-client@4.1.0` (see https://github.com/digitalbazaar/http-client/commits/main/
  for commit history).
- **BREAKING**: Upgraded to `undici@7`
