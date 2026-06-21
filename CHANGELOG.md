# Changelog

All notable changes to this project will be documented in this file.
## [1.0.2] – 2026-06-20

### Added
- **New setting: "Enable direct IP detection"** – checkbox in the "Proxy Test" section of settings. Disabled by default to protect user privacy: no real IP is sent to external IP services during tests. When enabled, tests use the direct IP for reference; when disabled, the proxy's own host (if it is an IP address) is used as the reference for indirect success detection.
- **New status "ip-only" (❔)** – introduced for cases where the IP address is successfully obtained through the proxy but differs from the proxy host IP (when the direct IP detection checkbox is disabled), and the main test page fails to load. This status is displayed separately from indirect success and does not affect the proxy rating.
- **Fetch-based proxy testing** – replaced the creation of visible/invisible tabs with `fetch` API requests for both main URL and IP service checks. This eliminates unwanted downloads, speeds up testing, and prevents browser history clutter.
- Localization of the new setting in all supported languages.
- Centralized IP services management (`IpServiceManager`) for caching direct IP and ranked IP services.
- Unified proxy checker core (`ProxyCheckerCore`) with separate logic for precise/express tests and cycle tests.
- Centralized result saver (`ResultSaver`) for rating, autoStatus, and progress updates.
- Test manager (`TestManager`) for test locking, profile switching, and proxy switching.

### Changed
- **Indirect success logic** – when direct IP detection is disabled, matching the IP obtained through the proxy with the proxy host IP now counts as indirect success (☑️), correctly indicating that the proxy returns its own IP. Previously, such a match was misinterpreted as direct IP detection and triggered unnecessary retries. If the IP differs from the host and the page fails to load, the new `ip-only` (❔) status is assigned instead.
- **Test type classification** – unified test types across the codebase: `'precise'` for precise tests, `'quick'` for express tests, `'cycle'` for cycle tests, and `'express-cycle'` for express cycle tests. This eliminates confusion in logs and test locking.
- **Immediate proxy application in cycle tests** – added `ProxyEngine.updateBrowsersProxyConfig()` calls during profile and proxy switching, ensuring that browser proxy settings are applied without delays, restoring the original performance of cycle tests.
- **Console log messages** now clearly indicate the reference used for IP comparison (direct IP or proxy host) depending on the setting, and display the appropriate status symbol (✅, ☑️, ❔, ⛔) for each test result.
- Refactored all test types (Precise, Express, Cycle, Express-Cycle) to use shared modules, eliminating ~70% of duplicate code.
- Improved display of test statuses: indirect success now correctly shown as ☑️ during test execution.
- Proxy deletion via Delete key now persists immediately.

### Changed (infrastructure)
- Added automatic browser‑specific store links for future publication.

### Fixed
- TypeScript compilation error due to invalid `'precise'` type in `TestManager.tryStartTest()` – expanded allowed test type values.
- Incorrect behavior when direct IP detection was disabled, where tests were unnecessarily retried due to false positive direct IP detection.
- Reduced occurrences of "Invalid tab ID" errors by limiting retry attempts.
- Fixed issue where proxies deleted via Delete key would reappear after page reload.
- Fixed TypeScript compilation errors related to missing exports and unused imports.
- Fixed missing import of `TestManager` in `Core.ts`.
- Fixed incorrect `statusType` for indirect success in non-cycle tests.
- **Fixed unwanted file downloads** during testing – replaced tab-based IP service checks with `fetch` calls, eliminating automatic downloads of empty or malformed files.
- **Fixed store rating link** – now correctly points to the ProxyMust page in Firefox Add-ons.

### Removed
- Redundant code duplicates in proxy checkers and testers.
- Visible and invisible tabs creation during proxy testing (replaced with `fetch`-based checks).

## [1.0.1] – 2026-06-18

### Added
- Added privacy notice in the Proxy Test section explaining IP transmission to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed `license` field from manifest (now set via AMO).
- Merged two separate test information messages into one comprehensive explanation.
- Updated `settings.html` to show combined message about privacy and testing workflow.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate message `settingsProxyTestPrivacyNotice` from localization.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate informational block in `settings.html`.

---

## [1.0.0] – 2026-06-15

### Added (fork from SmartProxy 2.1)
- Rebranding: SmartProxy → ProxyMust, Smart Proxy → Selective Proxy, Smart Profiles → Selective Profiles.
- Proxy rating system (manual change, automatic based on test results).
- Test status display for each proxy and site (✅ ☑️ ❓ ⛔).
- Proxy testing: precise test, express test, cycle test, express cycle test.
- Context menu in proxy table (right-click): change rating, priority (pin/star), export selected, copy addresses, delete, clear statuses, run tests for selected proxies.
- Sorting by rating and priority (in popup and settings table).
- Country flags (based on IP2Location).
- Ability to manually add/remove test sites.
- Configurable stale hours for test statuses.
- "Add working" button in popup – add successfully tested subscription proxies to manual list.
- New localization languages: Bengali (bn), Hindi (hi), Japanese (ja), Korean (ko), Portuguese (pt), Urdu (ur), Vietnamese (vi).
- Improved import: automatic switch between text/file mode; export selected proxies via context menu.

### Changed
- Updated manifests: version 1.0.0, short_name: "Xmust", homepage_url, author.
- Localization for 24 languages (original SmartProxy languages revised, new added).
- Default WebDAV backup filename: `proxymust_settings.json`.
- Exported proxy list filename: `ProxyMust-Servers-export.txt`.
- Footer in settings page shows `ProxyMust 1.0.0 (based on SmartProxy 2.1)`.
- Removed affiliate ad block (AvaProxy).
- Disabled update notifications (UpdateManager).

### Fixed
- Fixed structure of `settings.html` (closed table, proper placement of rating and test controls).
- Fixed DataTables initialization errors on empty tables.

### Removed
- Update checking code (UpdateManager).
- Affiliate ad (AvaProxy).

### Localization
- Supported languages (24): Arabic (ar), Bengali (bn), German (de), English (en), Spanish (es), Persian (fa), French (fr), Hindi (hi), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Dutch (nl), Polish (pl), Portuguese (pt), Russian (ru), Turkish (tr), Urdu (ur), Vietnamese (vi), Simplified Chinese (zh_CN), Traditional Chinese (zh-TW).

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)