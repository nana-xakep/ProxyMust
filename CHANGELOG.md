# Changelog

All notable changes to this project will be documented in this file.

## [1.0.3] – 2026-06-26

### Added
- **Embedded test log viewer** – integrated into the settings page (in the settings menu column, below the navigation menu) and as a separate popup window accessible from the toolbar popup. Displays real‑time testing progress with detailed steps: proxy check start, IP detection, page availability, final status, and move to next proxy.
- **Country flags in test log** – flags are now displayed next to the proxy host in the log using the `Twemoji Country Flags` font for cross‑browser support (fixes flag rendering in Chrome).
- **Localization for test log** – all log messages, labels, and statuses are translated into all 21 supported languages. Added new i18n keys: `testLogTitle`, `testLogWaiting`, `testLogStart`, `testLogIpSuccess`, `testLogIpFail`, `testLogPageAvailable`, `testLogPageUnavailable`, `testLogStatusSuccess`, `testLogStatusIndirect`, `testLogStatusFail`, `testLogStatusIpOnly`, `testLogStatusUnknown`, `testLogNext`, `testLogStop`, `testLogComplete`, `testLogClear`, `testLogClose`, `testLogOpenButton`, `testLogOpenFailed`, `testLogLabelProxy`, `testLogLabelSite`, `testLogLabelStatus`.
- **Instant feedback on stop** – clicking the “Stop” button now immediately displays a stop message in the log, letting the user know that cancellation is initiated and they should wait for the test to fully finish.
- **“Log” button in proxy test block** – toggles the visibility of the embedded log viewer directly on the settings page.
- **“Pin” button in log window** – allows attempting to keep the window above others (focuses on new messages). This is not a true “always on top”, but it makes it easier to follow the test progress. The pin state is preserved for the session.
- **Increased log window width** – default width increased from 320 to 450 pixels for better readability.
- **`TOGGLE_TEST_LOG_PIN` handler in Core** – manages the pin state and responds to Pin button clicks.
- **Helper `settingsPage.t()`** – localization helper with parameter substitution, used for all log messages.

### Changed
- **Log appearance and layout** – compact design with smaller font, reduced padding, and increased height (550 pixels) for better readability on desktop and mobile. Header is centered; “Clear” and “Close” buttons are placed side‑by‑side.
- **Test log now uses CSS class `flag-emoji`** for correct flag emoji rendering across all browsers (Chrome, Firefox, Opera, Edge).
- **All hard‑coded strings removed from log** – all messages are now fully localized via i18n.
- **Stop message handling** – the `stop` message is now sent **only once** from the UI when the stop button is clicked, eliminating duplicates that previously appeared in tests. Background testers no longer send redundant `stop` messages.
- **Log message structure** – each line now clearly shows: time, action label (PROXY, IP, SITE, STATUS) and result, with colors indicating success, failure, or indirect status.
- **Log window size** – width increased to 450 pixels (from 320), making messages more readable.
- **Webpack build** – added `test-log.ts` entry point in `webpack.config.js`, allowing the TypeScript log code to be compiled into a separate `ui/code/test-log.js` file.

### Fixed
- **Duplicate function implementations** – removed duplicate declarations of `formatTime`, `escapeHtml`, `getFlagEmoji`, `t`, `getStatusText`, and `renderLogMessage` in `settingsPage.ts`.
- **Missing IP display in log** – the message “IP obtained: {0}” now correctly substitutes the actual IP address via the `t()` helper.
- **Slow log updates** – log now updates in real time even when the viewer is hidden; messages are buffered and displayed instantly when opened.
- **Incorrect flag display in Chrome** – flags now render as emojis, not plain text like “US”, thanks to the `Twemoji Country Flags` font and proper span wrapping.
- **Double arrow (→→) in “Move to next proxy”** – removed duplicate arrow, now only one arrow is shown.
- **Log viewer width** – now correctly matches the width of the settings menu column, not stretching across the entire content area.
- **Duplicate stop messages** – eliminated multiple duplicate `stop` messages when clicking the “Stop” button.
- **TypeScript compilation error** – added missing `getStatusText` method in `test-log.ts`, fixing `TS2339`.
- **Inactive Pin button** – fixed event bindings and message handling; the button now responds to clicks and changes state.
- **Popup closure when focusing log window** – optimized logic: when a popup is active, the log window no longer steals focus, preventing accidental popup closure.

### Removed
- **Redundant `stop` messages** from `ProxyTester`, `ProxyCycleTester`, and `ExpressProxyCycleTester` – now handled exclusively by the UI button.
- **Unused localization key** – removed `testLogLabelNext` (the arrow is now a hard‑coded symbol).

---

## [1.0.2] – 2026-06-20

### Added
- **New setting: “Enable direct IP detection”** – a checkbox in the “Proxy Testing” section of settings. Disabled by default to protect user privacy: the real IP is not sent to external IP services during tests. When enabled, tests use direct IP for comparison; when disabled, the proxy’s own host IP (if it is an IP address) is used as the reference for indirect success.
- **New “IP‑only” status (❔)** – introduced for cases where an IP address is successfully retrieved through the proxy but differs from the proxy’s host IP (when direct IP detection is off) and the main test page does not load. This status is displayed separately from indirect success and does not affect proxy rating.
- **Fetch‑based proxy testing** – replaced visible/invisible tab creation with `fetch` API calls for both the main URL and IP service checks. This eliminates unwanted downloads, speeds up testing, and prevents browser history pollution.
- Localization of the new setting into all supported languages.
- Centralised IP service management (`IpServiceManager`) for caching direct IP and ranked IP services.
- Unified proxy check core (`ProxyCheckerCore`) with separate logic for precise/express tests and cycle tests.
- Centralised result saver (`ResultSaver`) for updating rating, auto‑status, and progress.
- Test manager (`TestManager`) for test locking, profile switching, and proxy switching.

### Changed
- **Indirect success logic** – when direct IP detection is off, matching the IP retrieved through the proxy with the proxy’s host IP is now considered an indirect success (☑️), correctly indicating that the proxy is returning its own IP. Previously, such a match was mistakenly interpreted as direct IP detection and caused unnecessary retries. If the IP differs from the host and the page does not load, the new `IP‑only` status (❔) is assigned instead.
- **Test type classification** – unified test types across the codebase: `'precise'` for precise tests, `'quick'` for express tests, `'cycle'` for cycle tests, and `'express-cycle'` for express cycle tests. This eliminates confusion in logs and test locking.
- **Immediate application of proxy in cycle tests** – added calls to `ProxyEngine.updateBrowsersProxyConfig()` when switching profiles and proxies, ensuring that proxy settings are applied immediately in the browser, restoring the original performance of cycle tests.
- **Console messages now clearly indicate the reference used for IP comparison (direct IP or proxy host)** depending on the setting, and display the corresponding status symbol (✅, ☑️, ❔, ⛔) for each test result.
- Refactored all test types (Precise, Express, Cycle, Express‑Cycle) to use common modules, eliminating ~70% of duplicate code.
- Improved test status display: indirect success is now correctly shown as ☑️ during test execution.
- Deleting proxies via the Delete key now saves immediately.

### Changed (infrastructure)
- Added automatic browser‑specific store links for future publication.

### Fixed
- TypeScript compilation error due to invalid type `'precise'` in `TestManager.tryStartTest()` – expanded the allowed test types list.
- Incorrect behaviour when direct IP detection is off, where tests were unnecessarily retried due to false direct IP detection.
- Reduced “Invalid tab ID” errors by limiting retry attempts.
- Fixed issue where proxies deleted via the Delete key reappeared after page reload.
- Fixed TypeScript compilation errors related to missing exports and unused imports.
- Fixed missing import of `TestManager` in `Core.ts`.
- Fixed incorrect `statusType` for indirect success in non‑cycle tests.
- **Fixed unwanted file downloads** during testing – IP service checks based on tabs have been replaced with `fetch` calls, eliminating automatic downloads of empty or corrupted files.
- **Fixed rating store link** – now correctly points to the ProxyMust page on Firefox Add‑ons.

### Removed
- Redundant code duplication in proxy checkers and testers.
- Creation of visible and invisible tabs during proxy testing (replaced with `fetch`‑based checks).

---

## [1.0.1] – 2026-06-18

### Added
- Added a privacy notice in the “Proxy Testing” section explaining IP address transmission to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed `license` field from manifest (now set via AMO).
- Merged two separate testing info messages into one combined explanation.
- Updated `settings.html` to display the combined privacy and testing process message.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate `settingsProxyTestPrivacyNotice` message from localization.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate info block in `settings.html`.

---

## [1.0.0] – 2026-06-15

### Added (fork from SmartProxy 2.1)
- Rebranding: SmartProxy → ProxyMust, Smart Proxy → Selectable Proxy, Smart Profiles → Selectable Profiles.
- Proxy rating system (manual adjustment, automatic based on test results).
- Test status display for each proxy and site (✅ ☑️ ❓ ⛔).
- Proxy testing: precise test, express test, cycle test, express cycle test.
- Context menu in the proxy table (right‑click): rating change, priority (pin/star), export selected, copy addresses, delete, clear statuses, run tests for selected proxies.
- Sorting by rating and priority (in popup and settings table).
- Country flags (based on IP2Location).
- Manual addition/removal of test sites.
- Configurable stale hours for test statuses.
- “Add working” button in popup – adds successfully tested subscription proxies to the manual list.
- New locale languages: Bengali (bn), Hindi (hi), Japanese (ja), Korean (ko), Portuguese (pt), Urdu (ur), Vietnamese (vi).
- Improved import: automatic switching between text/file modes; export selected proxies via context menu.

### Changed
- Updated manifests: version 1.0.0, short_name: “Xmust”, homepage_url, author.
- Localization for 21 languages (revised original SmartProxy languages, added new ones).
- Default WebDAV backup filename: `proxymust_settings.json`.
- Export filename for proxy list: `ProxyMust-Servers-export.txt`.
- Settings page footer displays `ProxyMust 1.0.0 (based on SmartProxy 2.1)`.
- Removed affiliate ad block (AvaProxy).
- Disabled update notifications (UpdateManager).

### Fixed
- Fixed `settings.html` structure (closed table, correct placement of rating and test controls).
- Fixed DataTables initialisation errors on empty tables.

### Removed
- Update checker code (UpdateManager).
- Affiliate advertising (AvaProxy).

### Localization
- Supported languages (21): Arabic (ar), Bengali (bn), German (de), English (en), Spanish (es), Persian (fa), French (fr), Hindi (hi), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Dutch (nl), Polish (pl), Portuguese (pt), Russian (ru), Turkish (tr), Urdu (ur), Vietnamese (vi), Simplified Chinese (zh_CN), Traditional Chinese (zh‑TW).

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)