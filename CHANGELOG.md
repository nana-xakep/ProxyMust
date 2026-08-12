# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.7] – 2026-08-12

### Added

- **Universal success status update** – now, when a page loads successfully, the proxy status is updated to `success` in any active profile (not only in AutoProxy), which allows accumulating performance statistics for proxies across all sites.
- **Automatic reset of the user‑stop flag when initiating a new search** – if the user clicks "Stop" in the browser and then initiates a new search (via 🔄, F5, or adding a site), the stop flag is reset and the auto‑iteration restarts.

### Changed

- **Dialog display logic before failover** – the change dialog is now shown **only** when a site is already pinned to a proxy and the user initiates a change (F5, re‑entering the address, or the 🔄 button).
- **Default sorting in the "Proxy Servers" table** – the table is now sorted by rating using the custom type `rating-priority`, which ensures that proxies with a "Success" status (✅) are always placed above "Indirect success" (☑️), regardless of their numeric rating.
- **Display of IP and port for pinned proxies** – when a working proxy is pinned, its IP and port are now shown in the "Proxy Server" column of the rules table for that site, and it becomes the primary one in `auto` mode, giving the user informational control over the AutoProxy selection.
- **Display of IP and port in the AutoProxy profile** – the "Proxy Server" column now displays IP and port instead of the proxy name, simplifying identification.
- **Real‑time status updates** – the rules and servers tables are now updated immediately after test results are received, reflecting current statuses and ratings.
- **Behaviour on successful load in auto mode** – when a page loads successfully through a proxy, failover is completely stopped (all states are reset: `_failoverInProgress`, `_failoverIndex`, `_failoverCycleCount`, `_tempSkipList`), and iteration will not resume until the user makes a decision in the pinning dialog (pin or continue searching). This makes AutoProxy behaviour predictable and manageable.
- **"Remove Site" button on the proxy settings page** – now displays a dialog "Remove ... site from the AutoProxy check list and rules?" and, on confirmation, removes the site from both rules and the list.

### Fixed

- **Re‑appearing pinning dialog after refusal** – fixed an issue where, after clicking "Continue searching", the pinning dialog would reopen for the same proxy. Now, after refusal, failover switches to the next proxy and correctly reloads the tab.
- **Infinite auto‑iteration when closing a tab** – added a tab close handler (`TabManager.TabRemoved`) that clears all failover states for the site and cancels reload timeouts, preventing iteration from continuing after the tab is closed.
- **Auto‑iteration stopping when "Stop" is pressed in the browser** – the "Stop" button (load cancellation) now fully cancels the current failover and prevents it from restarting automatically. A flag `_userStoppedFailover` has been added to preserve the stopped state until the user initiates a new search (via 🔄, F5, or adding a site). In Firefox, proper handling of the `NS_BINDING_ABORTED` error that occurs when pressing "Stop" has been added.
- **Automatic reset of the `_userStoppedFailover` flag on successful load** – fixed an issue where, after pressing "Stop" and then successfully loading a page, the flag was automatically reset, allowing failover to resume on the next error. Now the flag persists until the user explicitly initiates a new action.
- **Incorrect sorting in the servers table** – fixed the initial sorting on the "Rating" column using `orderDataType: 'rating-priority'`; status now takes priority over numeric rating.
- **Display of statuses in the popup** – the popup now correctly shows green (✅) and blue (☑️) icons based on the actual statuses from `autoStatus`, rather than only blue ones.
- **Duplicate pinning dialogs** – added a protection mechanism preventing the same dialog from being shown for the same proxy within 10 seconds, eliminating multiple windows with identical messages.
- **"Remove Site" button on the proxy settings page** – now works again and removes the selected site from both rules and the list.

### Security and performance

- The AutoProxy module has been completely redesigned for better functionality and improved connectivity.
- Tab existence checks before each failover reload have been optimised, reducing "Invalid tab ID" errors and improving stability when tabs are closed during iteration.

## [1.0.6] – 2026-08-05

### Added

#### AutoProxy – automatic proxy selection for Selective profile
- **New "AutoProxy" operating mode for Selective profile** – rules without an explicitly set proxy can now automatically pick the best proxy based on test results (rating, statuses, freshness). Users can enable auto‑mode in profile settings via the "Manual / Automatic" toggle.
- **Proxy selection logic** – introduced `ProxySelector` module implementing a hierarchy: **success → indirect → ip-only → unknown**, considering priorities (`pin`/`star`), rating, and status freshness. `getBestProxyForSite` and `getNextProxyForSite` methods are available for failover. Proxies with status `fail` are excluded from selection.
- **Unified proxy application mechanism** – created `ProxySwitcher`, extracting profile switching and proxy setting logic from `TestManager`, enabling the same code for tests and AutoProxy.
- **Dynamic proxy override in ProxyEngine** – added `setDynamicProxyForSite` and `clearDynamicProxyForSite` methods for temporarily overriding a proxy for a specific site without changing rules. Used for failover and auto‑selection.
- **Failover in WebFailedRequestMonitor** – on connection errors in auto‑mode (only for `main_frame` documents), the system automatically switches to the next proxy from the priority‑sorted list and reloads the tab.
- **Auto‑creation of rules** – after a successful test (status success, indirect, or ip‑only), a disabled rule is automatically created in the Selective profile. The user can later enable it in manual or automatic mode.
- **Working proxy caching** – after successful page load (status 200), the current proxy is cached for the site, and subsequent errors on subresources do not trigger new switches. Cache is cleared on profile change, manual proxy change, or after 5 minutes.
- **Proxy information display in rules table** – for auto‑rules, the "Proxy Server" column now shows:
  - Country flag
  - Proxy name, protocol, rating
  - Current status (✅ ☑️ ❔)
- **AutoProxy settings in profile** – added to Selective profile settings:
  - "Selection mode" toggle (Manual / Automatic)
  - "Max failover attempts" field (number of full proxy list retries, default 3)
  - "Show auto‑proxy change dialog" checkbox (enabled by default)
  - "Automatically pin successful proxy (without confirmation)" checkbox (disabled by default)
  - "Suggest adding unreachable sites to auto‑proxy" checkbox – when a page fails to load without proxy, a dialog offers to add the site to AutoProxy (enabled by default).

#### CSV proxy import
- **CSV subscription support** – added new `ProxyImporter.parseCsv` method that parses proxy lists in CSV format (delimiters: comma, semicolon, tab). Supports both header and headerless rows (field order: host, port, protocol, username, password, country). This allows subscribing to proxy lists provided in CSV without prior conversion.
- **Auto‑detection of format during manual import** – when importing without explicit format, the extension now tries parsers in sequence **JSON → CSV → TXT**, ensuring correct handling of any list, including those starting with special characters (e.g. `[ProxyMust Servers]`).
  

#### UI and logic improvements
- **Real‑time status updates in rules table** – during tests, the table automatically redraws showing current statuses.
- **All proxies in failover** – error fallback now includes `ip-only` and `unknown` in addition to `success` and `indirect`, excluding only proxies with explicit `fail` status. This greatly improves robustness.
- **Site locking after successful load** – added `siteLock` mechanism to prevent re‑switches when the site is already loaded. Errors on subresources (scripts, images, video) no longer trigger failover.
- **Lock reset on tab switch, profile change, or timeout** – ensures lock doesn't interfere when navigating away or changing settings.
- **Manual rules priority** – manual rules (with explicit proxy) always take precedence over auto‑rules, as intended.
- **Status update to `success` on successful load** – after page load with status 200, the proxy status for that site is updated to `success`, improving rating and future selection.
- **Dialog to add unreachable site to AutoProxy** – if a site fails to load without proxy and the "Suggest adding unreachable sites" option is enabled, a dialog offers to add the site to AutoProxy.

### Changed
- **Refactored status access** – all direct accesses to `Settings.current.autoStatus` replaced with calls to `AutoStatusService`. Improves maintainability and simplifies future development.
- **Refactored proxy selection logic** – all proxy selection code moved to `ProxySelector`, making it reusable and testable.
- **Refactored proxy application** – profile switching and proxy setting logic extracted to `ProxySwitcher`, used both in tests and AutoProxy.
- **Failover mechanism updated** – now uses `ProxySelector.getNextProxyForSite` and iterates over all suitable proxies.
- **PAC script for Chrome updated** – now supports dynamic proxy override passed via `dynamicProxyMap`.
- **Error handling in WebFailedRequestMonitor** – failover now triggers only for `main_frame` requests to avoid false switches on subresources.
- **Improved format auto‑detection for proxy import** – now checks JSON, CSV and TXT in sequence, preventing misidentification of text files as JSON (e.g. export files starting with `[ProxyMust Servers]`).
- **First‑run welcome message updated** – now more informative, describing all setup steps: adding proxies, enabling testing, configuring AutoProxy rules, and automatic proxy selection for unreachable sites.

### Fixed
- **Infinite switch loop on errors** – fixed by introducing site lock after success and limiting switch frequency.
- **No switch to other proxies** – corrected proxy filtering in failover, now all proxies except explicitly failing ones are considered.
- **Incorrect display in rules table** – table now correctly refreshes on status changes, showing current proxy information.
- **Freeze when enabling auto‑mode** – fixed initialisation and saving of AutoProxy‑related settings.
- **Status `success` not shown after successful load** – status now correctly updates and persists in auto‑statuses.
- **TypeScript compilation error TS2345** – fixed `Core.openDialog` call with `'add_site'` type (added new type to signature).
- **Missing `autoAddUnreachableSites` in built‑in profiles** – added to `getBuiltinSmartProfiles`.
- **Fixed JSON import for proxy lists with fields `ip`, `country` instead of `host`, `countryCode`** – now correctly maps: `ip` → `host`, `country`/`country_code`/`country_name` → `countryCode`, `user` → `username`, `pass` → `password`. This restored compatibility with subscriptions from `proxyscrape` and similar sources.
- **Fixed format auto‑detection during proxy import** – now checks JSON → CSV → TXT sequentially, ensuring correct parsing of text lists that start with special characters (e.g. `[ProxyMust Servers]`) rather than misinterpreting them as JSON.
- **Fixed import of TXT files breaking after CSV addition** – text lists now processed through `parseText`, preserving all previous logic. Import of all formats (Plain Text, JSON, CSV) now works reliably.

---

## [1.0.5] – 2026-07-13

### Changed
- **Codebase updated to SmartProxy 2.2.1** – integrated all upstream improvements and fixes.

### Added
- **Rule management directly from popup** – now you can delete, enable/disable a rule, and enable **"Proxy for entire tab"** (Firefox only) without going to settings.
- **"Proxy for entire tab" mode for individual rules** – if a rule matches one request, enabling this mode will proxy the whole tab through the same proxy (Firefox only).
- **Display and editing of "Proxy for entire tab" in rule settings** – added checkbox in the rule edit modal.
- **Automatic settings refresh** – no longer need to reload the page to see changes made from the popup.
- **Sync safety** – prevented accidental overwrite of local settings on first sync enable.
- **SwitchyOmega rules import fix** – now correctly handles CIDR/IP rules.
- **New general option** – `deleteRuleWhenDisabledFromPopup` (controls behaviour when disabling a rule from popup).
- **Automatic switching of import modes for rules** – when you type in the "Rules backup text" field, the "Text" mode is auto‑selected; when selecting a file, "File" mode. Similar improvement was previously made for proxy import.
- **Localised tooltips for new popup buttons** – tooltips now display in the interface language.

### Fixed
- **Chromium fix (v2.2.1)** – whitelist rules from subscriptions now correctly apply proxy in Chrome/Edge.
- **Fixed restoration of `ProxyServerId` on backup import** – links between rules and proxy servers are now restored properly.
- **Fixed compilation error due to missing `noProxyPerOrigin` field** – replaced with `enableProxyPerOrigin` with correct logic.
- **Fixed `ProfileRules` method calls in `Core.ts`** to work with the new rule structure.

### Removed
- Deprecated field `noProxyPerOrigin` (replaced by `enableProxyPerOrigin`).

---

## [1.0.4] – 2026-07-07

### Added

#### Automatic protocol switching
- **Automatic protocol detection during testing** – if a proxy doesn't work with its declared protocol (SOCKS, HTTP, HTTPS), the extension automatically tries other protocols to find a working one. This saves users from manually cycling protocols for each proxy.
- **Two switch modes:**
  - **"Probable" (recommended)** – SOCKS → HTTP, HTTP → HTTPS, HTTPS → HTTP.
  - **"Full"** – HTTP → HTTPS → SOCKS4 → SOCKS5 (complete enumeration).
- **Global setting for auto‑protocol switching** – checkbox "Enable automatic protocol switching" and mode selector (Probable / Full).
- **Logging** – protocol switch attempts and successful changes are logged.
- **Indirect success preservation** – if IP is obtained during protocol detection (even if page fails), the final status becomes `indirect` instead of `fail`, correctly reflecting proxy usability.

#### UI improvements

- **Automatic switch to Direct when saving subscription**  
  Previously, if the **Always Enabled** profile with a non‑working proxy was active, users couldn't add a new subscription – they had to manually switch to **Direct**, save, then switch back.  
  Now it's automatic: on "Save", the extension temporarily switches to Direct, waits for application, loads the proxy list, saves the subscription, and silently restores the original profile.
- **Auto‑save subscription** – after successful addition, changes are automatically saved, removing the extra save button click on the subscriptions page.
- **Embedded test log viewer** – integrated into the settings page (in the settings menu column, under the navigation menu) and as a separate floating window called from the popup. Shows real‑time test progress with detailed steps: proxy start, IP detection, site availability, final status, and next proxy.
- **Informational start message** – on any test start, log shows `🔍 Checking proxy usability` so the user immediately sees the process has begun.
- **Direct IP display in log** – when `enableDirectIpDetection` is on, the log shows the direct IP at start (color `#00aaff`).
- **IP comparison in log** – for each proxy in the `ip` step, shows comparison result with direct IP:
  - `☑️ differs from direct IP: ...` (blue) – proxy works.
  - `⚠️ matches direct IP (proxy not working)` (red) – proxy didn't connect; will retry.
- **Informational site check message** – before fetching the target site, log shows `🔍 Checking site: https://rutracker.org...` so the user sees active site availability checking.
- **Country flags in test log** – proxy hosts now show flags using `Twemoji Country Flags` font for cross‑browser support (fixes flag display in Chrome).
- **Log localisation** – all log messages, labels and statuses are translated into all 21 supported languages.
- **Immediate feedback on stop** – pressing "Stop" now immediately shows a stop message in the log, informing the user that cancellation is initiated and they need to wait for the test to fully finish.
- **"Log" button in test control block** – toggles the embedded log viewer on the settings page.
- **"Pin" button in log window** – attempts to keep the log window on top (focus on new messages), making it easier to watch long tests.
- **Log appearance and layout** – compact design with reduced padding and font, height increased to 550px, default width increased from 320px to 450px for better readability. Title centred; "Clear" and "Close" buttons placed next to each other.
- **Centring of test type selection menu in popup** – the menu appearing when clicking the **Test** button in the popup is now centred horizontally within the popup window, rather than anchored to the button's left edge. This improves UX and prevents shifting to the right, especially on small popup sizes. Temporary popup width expansion for the menu and site input dialog is now controlled by CSS classes `wide-mode` and `wide-mode-prompt`, ensuring correct display on all screens.
- **Test control block structure in popup** – buttons, progress and "Add working" are vertically centred for improved UX.
- **Proxy export button disabled when no proxies** – button becomes inactive if the proxy list is empty (instead of creating an empty file).

### Fixed

- **Testing buttons disappearing in popup when enabling "Enable direct IP detection"**  
  This happened because `readGeneralOptions` didn't copy current values, causing `enableRating` and `enableDirectIpDetection` to reset on saving general options. Now the method correctly reads from DOM with fallback to current settings, preserving checkbox states and preventing button disappearance.
- **HTML tags displayed in floating log window** – in the `ip` step, formatted text with colours and icons now displays correctly, as in the embedded log.
- **Message overlap in floating log window** – fixed line rendering: text now wraps correctly without overlapping neighbouring lines, thanks to fixed HTML rendering and proper `word-break`/`white-space` CSS.
- **Empty file on proxy export** – export button is now disabled when proxy list is empty.
- **Version display in footer** – version number is now dynamically substituted via localisation, ensuring correct display on the settings page.
- **Visual separation of manual and subscription proxies in popup** – subscription proxies in the active proxy dropdown are now grouped by subscription name (as in settings) with indentation. Manual proxies appear ungrouped, making the UI clearer.
- **False error message when starting express‑cycle test in Firefox** – sometimes a warning "express cycle test failed {0}" appeared even though the test started and worked. Caused by Firefox's async response handling; fixed by switching to a single callback with success check, ensuring cross‑browser stability.
- **Profile and proxy switching in cycle tests** – fixed order of settings update: now `defaultProxyServerId` is updated first, then `Settings.updateActiveSettings()`, then `ProxyEngine.updateBrowsersProxyConfig()`. This ensures the browser applies the new proxy before the test.
- **`ip-only` status no longer triggers auto protocol switch** – protocol switch is triggered only on explicit fail, not on unknown (`ip-only`).
- **Indirect success on protocol detection** – if IP is obtained during protocol search but the retest fails, the final status becomes `indirect` instead of `fail`, correctly reflecting proxy usability.
- **Retest after protocol auto‑detection now uses proxy with updated protocol** – previously retest used the old protocol, causing logs to show wrong protocol and repeated incorrect checks. Now when a working protocol is found, the proxy object with changed protocol is used for retest, ensuring correct testing and output.
- **Removed duplicate statuses in logs after protocol auto‑detection** – for regular tests (precise/quick), final status is now sent only once with the correct protocol, not twice (old and new). Makes logs cleaner.
- **Fixed test lock not releasing after regular tests** – added `try-finally` blocks in `startQuickTestForSite` and `startCheckForSite` to guarantee `_isRunning` flag is cleared even on errors. Now no manual extension reload is needed to rerun tests.
- **Log anti‑duplicate now compares displayed HTML content, not message hash** – correctly deduplicates identical consecutive lines regardless of source (previously duplicates could pass due to differences in auxiliary fields). Improved log readability.

### Changed

- **Direct IP fetching logic** – now obtained via temporary switch to system proxy (`withDirectProxy`) without opening popup, more reliable and faster.
- **Log message structure** – each line now clearly shows time, action label (PROXY, IP, SITE, STATUS) and result, with colours indicating success, failure, or indirect status.

### Removed

- **Unused localisation keys** – removed `testLogLabelNext` (arrow now a hardcoded symbol).

---

## [1.0.3] – 2026-06-28

### Added
- **Localisation for new elements** – added keys for new features (auto‑protocol switching, popup override, etc.).
- **New setting: "Enable direct IP detection"** – checkbox in "Proxy Testing" settings. Disabled by default to protect user privacy: real IP is never sent to external IP services during tests. When enabled, tests use direct IP for comparison; when disabled, the proxy's own host (if IP) is used as a reference for indirect success.
- **New status "IP‑only" (❔)** – introduced for cases where IP is successfully obtained via proxy but differs from the proxy host IP (when direct IP detection is off) and the main test page fails to load. This status is displayed separately from indirect success and does not affect proxy rating.
- **Fetch‑based proxy testing** – replaced visible/invisible tab creation with `fetch` API calls for both main URL and IP services. Eliminates unwanted loads, speeds up testing, and prevents history pollution.
- Localisation of the new setting in all supported languages.
- Centralised IP service management (`IpServiceManager`) for caching direct IP and ranking IP services.
- Unified proxy checking core (`ProxyCheckerCore`) with separate logic for precise/quick and cycle tests.
- Centralised result saver (`ResultSaver`) for updating rating, auto‑status, and progress.
- Test manager (`TestManager`) for test locking, profile switching, and proxy switching.

### Changed
- **Indirect success logic** – when direct IP detection is off, matching the proxy‑obtained IP with the proxy host IP is now considered indirect success (☑️), correctly indicating the proxy returns its own IP. Previously such matching was mistakenly interpreted as direct IP detection and caused unnecessary retries. If IP differs from host and page fails, the new `IP‑only` (❔) status is assigned instead.
- **Test type classification** – unified test types across codebase: `'precise'` for precise tests, `'quick'` for quick tests, `'cycle'` for cycle tests, and `'express-cycle'` for express‑cycle tests. Eliminates confusion in logs and test locking.
- **Immediate proxy application in cycle tests** – added `ProxyEngine.updateBrowsersProxyConfig()` calls when switching profiles and proxies, ensuring browser proxy settings are applied immediately, restoring original cycle test performance.
- **Console messages now clearly indicate the reference used for IP comparison (direct IP or proxy host)** depending on setting, and display the corresponding status symbol (✅, ☑️, ❔, ⛔) for each test result.
- Refactored all test types (Precise, Express, Cycle, Express‑Cycle) to use common modules, eliminating ~70% of duplicated code.
- Improved test status display: indirect success now correctly shown as ☑️ during test execution.
- Deleting proxies via Delete key now saves immediately.

### Fixed
- TypeScript compilation error due to invalid type `'precise'` in `TestManager.tryStartTest()` – expanded allowed test types.
- Incorrect behaviour when direct IP detection was off, causing tests to repeat unnecessarily due to false positive direct IP detection.
- Reduced "Invalid tab ID" errors by limiting retry count.
- Fixed issue where proxies deleted via Delete key reappeared after page reload.
- Fixed TypeScript compilation errors related to missing exports and unused imports.
- Fixed missing `TestManager` import in `Core.ts`.
- Fixed incorrect `statusType` for indirect success in non‑cycle tests.
- **Fixed unwanted file downloads** during testing – tab‑based IP service checks replaced with `fetch` calls, eliminating automatic download of empty or corrupted files.
- **Fixed store rating link** – now correctly points to ProxyMust page on Firefox Add‑ons.

### Removed
- Excessive code duplicates in proxy checkers and testers.
- Creation of visible/invisible tabs during proxy testing (replaced with `fetch`‑based checks).

---

## [1.0.2] – 2026-06-20

### Added
- Privacy notice in "Proxy Testing" section explaining IP address transmission to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed `license` field from manifest (now set via AMO).
- Merged two separate testing info messages into one general explanation.
- Updated `settings.html` to display the merged privacy and testing message.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate `settingsProxyTestPrivacyNotice` from localisation.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate info block in `settings.html`.

---

## [1.0.1] – 2026-06-18

### Added
- Privacy notice in "Proxy Testing" section explaining IP address transmission to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed `license` field from manifest (now set via AMO).
- Merged two separate testing info messages into one general explanation.
- Updated `settings.html` to display the merged privacy and testing message.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate `settingsProxyTestPrivacyNotice` from localisation.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate info block in `settings.html`.

---

## [1.0.0] – 2026-06-15

### Added (fork from SmartProxy 2.1)
- Rebranding: SmartProxy → ProxyMust, Smart Proxy → Selectable Proxy, Smart Profiles → Selectable Profiles.
- Proxy rating system (manual adjustment, automatic based on test results).
- Test status display for each proxy and site (✅ ☑️ ❓ ⛔).
- Proxy testing: precise test, quick test, cycle test, express‑cycle test.
- Context menu in proxy table (right‑click): rating change, priority (pin/star), export selected, copy addresses, delete, clear statuses, run tests for selected proxies.
- Sorting by rating and priority (in popup and settings table).
- Country flags (based on IP2Location).
- Ability to manually add/remove test sites.
- Configurable test status stale time.
- "Add working" button in popup – add successfully tested subscription proxies to the manual list.
- New localisation languages: Bengali (bn), Hindi (hi), Japanese (ja), Korean (ko), Portuguese (pt), Urdu (ur), Vietnamese (vi).
- Improved import: automatic switching between text/file modes; export selected via context menu.

### Changed
- Updated manifests: version 1.0.0, short_name: "Xmust", homepage_url, author.
- Localisation for 21 languages (reviewed original SmartProxy languages, added new ones).
- Default WebDAV backup filename: `proxymust_settings.json`.
- Default exported proxy list filename: `ProxyMust-Servers-export.txt`.
- Settings page footer shows `ProxyMust 1.0.0 (based on SmartProxy 2.1)`.
- Removed affiliate ad block (AvaProxy).
- Disabled update notifications (UpdateManager).

### Fixed
- Fixed `settings.html` structure (closed table, correct placement of rating and test controls).
- Fixed DataTables initialisation errors on empty tables.

### Removed
- Update check code (UpdateManager).
- Affiliate ads (AvaProxy).

### Localisation
- Supported languages (21): Arabic (ar), Bengali (bn), German (de), English (en), Spanish (es), Persian (fa), French (fr), Hindi (hi), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Dutch (nl), Polish (pl), Portuguese (pt), Russian (ru), Turkish (tr), Urdu (ur), Vietnamese (vi), Simplified Chinese (zh_CN), Traditional Chinese (zh-TW).