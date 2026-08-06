# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] – 2026-08-05

### Added

#### CSV proxy import
- **CSV subscription support** – added `ProxyImporter.parseCsv` method that parses proxy lists in CSV format (delimiters: comma, semicolon, tab). Supports both headers and plain order (fields: host, port, protocol, username, password, country). Allows connecting subscriptions provided in CSV without prior conversion.
- **Auto‑detection of format during manual import** – when importing without explicit format, the extension sequentially tries **JSON → CSV → TXT** parsers, ensuring correct handling of any list, including those starting with service markers (e.g., `[ProxyMust Servers]`).

#### AutoProxy – automatic proxy selection for Selective profile
- **New «Auto» mode for Selective profile** – rules without an explicit proxy can now automatically choose the best proxy based on test results (rating, statuses, freshness). User can enable Auto mode in profile settings with the «Manual / Automatic» toggle.
- **Centralised status management** – created `AutoStatusService`, replacing direct access to `Settings.current.autoStatus`, providing a single point of access for reading and updating proxy statuses.
- **Proxy selection logic** – created `ProxySelector`, implementing a selection hierarchy: **success → indirect → ip‑only → unknown → fail**, with priority (`pin`/`star`), rating, and freshness. Methods `getBestProxyForSite` and `getNextProxyForSite` support failover.
- **Unified proxy application mechanism** – created `ProxySwitcher`, extracting profile switching and proxy application logic from `TestManager`, making it reusable for tests and AutoProxy.
- **Dynamic proxy override in ProxyEngine** – added `setDynamicProxyForSite`, `clearDynamicProxyForSite` for temporary proxy substitution per site without changing rules. Used for failover and auto‑selection.
- **Failover in WebFailedRequestMonitor** – on connection errors in Auto mode (only for main_frame), the system automatically switches to the next proxy from the priority‑sorted list and reloads the tab.
- **Auto‑rule creation** – after a successful test (status success, indirect, or ip‑only), a disabled rule is automatically created in the Selective profile with the `isAuto = true` flag. If Auto mode is active, the rule is enabled automatically.
- **Working proxy caching** – after a successful page load (status 200), the current proxy is cached for the site; subsequent errors on sub‑resources do not trigger new switches. Cache is cleared when switching profiles, manually changing proxy, or after 5 minutes.
- **Proxy information in the rules table** – for auto‑rules, the «Proxy server» column now shows:
  - Country flag
  - Proxy name, protocol, rating
  - Current status (✅ ☑️ ❔ ❌)
  - Remaining status lifetime (with colour coding: green, yellow, red)
  - `auto` or `manual` tag
- **Context menu for rule rows** – right‑click a rule to:
  - Assign a proxy (opens a filtered list for that site)
  - Re‑test (current proxy, all successful, or all proxies)
  - Exclude a proxy (globally or for this site)
  - Delete the rule
  - Batch operations (select multiple rules → apply action to all)
- **AutoProxy settings in the profile** – in Selective profile settings, added:
  - Selection mode toggle (Manual / Auto)
  - «Max failover attempts» field (number of full‑list retries, default 3)
  - «Suggest adding unreachable sites to AutoProxy» checkbox – when a page fails to load without a proxy, a dialog offers to add it to AutoProxy.
- **Auto‑mode indication in profile name** – when Auto is enabled, a 🔄 icon is added to the profile name.

#### Interface and logic improvements
- **Real‑time status updates in the rules table** – during tests, the table automatically redraws, showing current statuses and lifetimes for auto‑rules.
- **Support for all proxies in failover** – now includes `ip‑only` and `unknown` proxies, excluding only those with explicit `fail` status. This significantly improves fault tolerance.
- **Site locking after successful load** – added `siteLock` mechanism to prevent repeated switches when the site is already loaded; errors on sub‑resources no longer trigger failover.
- **Lock reset on tab change, profile switch, or timeout** – ensures the lock does not interfere when navigating to another site or changing settings.
- **Priority of manual rules** – manual rules (with explicit proxy) always have priority over auto‑rules.
- **Status update to `success` on successful load** – after page load with status 200, the proxy status for this site is updated to `success`, increasing the rating and improving future selection.
- **Status lifetime displayed in the table** – remaining time until staleness is shown next to the proxy in the «Proxy server» column with colour indication.
- **`auto`/`manual` tags in the rules table** – each auto‑rule is marked with `auto`, manual with `manual`.
- **Dialog for adding an unreachable site to AutoProxy** – if a site fails to load without a proxy and the option is enabled, a dialog offers to add it to AutoProxy.

### Changed
- **Refactored status access** – all direct accesses to `Settings.current.autoStatus` replaced with `AutoStatusService` calls. Improves maintainability and simplifies future development.
- **Refactored proxy selection logic** – all selection code moved to `ProxySelector`, making it reusable and testable.
- **Refactored proxy application** – profile switching and proxy application logic moved to `ProxySwitcher`, used in both tests and AutoProxy.
- **Updated failover mechanism** – now uses `ProxySelector.getNextProxyForSite` and iterates over all suitable proxies, not just the first three.
- **PAC script for Chrome updated** – now supports dynamic proxy override via `dynamicProxyMap`.
- **Error handling in WebFailedRequestMonitor** – failover now triggers only for `main_frame` requests, preventing false switches on sub‑resources.
- **Improved format auto‑detection for proxy import** – now sequentially checks JSON, CSV, and TXT, preventing misidentification of text files as JSON (e.g., export files starting with `[ProxyMust Servers]`).

### Fixed
- **Infinite loop of switches on errors** – resolved by introducing site locking after success and limiting switch frequency.
- **No switching to other proxies** – fixed proxy filtering in failover; now all proxies except explicitly failing ones participate.
- **Incorrect display in rules table** – table now correctly updates on status changes, showing accurate proxy information.
- **Freeze when enabling Auto mode** – fixed initialisation and saving of AutoProxy‑related settings.
- **Disappearance of test buttons when saving general settings** – fixed settings copying in `readGeneralOptions` (fix from 1.0.5 also retained).
- **Status `success` after successful load not updating** – status now correctly updates and saves to auto‑statuses.
- **Duplicate log messages** – eliminated duplicates with improved anti‑duplicate logic (comparing HTML content).
- **Compilation error `TS2345`** – fixed `Core.openDialog` call with type `'add_site'` (added new type to signature).
- **Missing `autoAddUnreachableSites` field in built‑in profiles** – added to `getBuiltinSmartProfiles`.
- **JSON import for proxy lists with fields `ip`, `country` instead of `host`, `countryCode`** – now correctly maps: `ip` → `host`, `country`/`country_code`/`country_name` → `countryCode`, `user` → `username`, `pass` → `password`. Restored compatibility with services like `proxyscrape`.
- **Auto‑detection of import format** – now sequentially checks JSON → CSV → TXT, guaranteeing correct parsing of text lists that start with service markers (e.g., `[ProxyMust Servers]`), rather than misidentifying them as JSON.
- **Text file (TXT) import broken after CSV addition** – now text lists are processed through `parseText`, preserving all previous logic. Import of all formats (Plain Text, JSON, CSV) now works stable.

### Removed
- **Deprecated excluded proxies list in profile settings** – exclusions are now managed via the rule row context menu (per site or globally), which is more intuitive and functional.
- **Unused code and imports** related to old `autoStatus` access.

---

## [1.0.5] – 2026-07-13

### Changed
- **Codebase updated to SmartProxy 2.2.1** – all improvements and fixes from upstream integrated.

### Added
- **Rule management directly from the popup** – now you can delete, enable/disable a rule, and also enable **«Proxy per tab»** mode (Firefox only) without going to settings.
- **«Proxy per tab» mode for individual rules** – if a rule matches one request, enabling this mode will proxy the whole tab through the same proxy (available only in Firefox).
- **Display and editing of the «Proxy per tab» mode in rule settings** – added a checkbox in the rule edit modal.
- **Automatic settings reload** – now you don’t need to manually press F5 after changes made in the popup.
- **Sync safety** – prevents accidental overwrite of local settings when first enabling sync.
- **Fixed import of rules from SwitchyOmega** – now correctly handles CIDR/IP rules.
- **New general option** – `deleteRuleWhenDisabledFromPopup` (controls behaviour when disabling a rule from popup).
- **Automatic import mode switching for rules** – now when you paste text, the «Text» mode activates; when you select a file, the «File» mode activates. Similar improvement was previously made for proxy import.
- **Localised tooltips for new popup buttons** – tooltips now appear in the interface language.

### Fixed
- **Chromium fix** – exception rules (whitelist) from subscriptions now correctly apply proxies in Chrome/Edge.
- **Fixed restoration of `ProxyServerId` when importing backup** – rule‑to‑proxy relationships are now restored correctly.
- **Fixed compilation error due to missing `noProxyPerOrigin` field** – replaced with `enableProxyPerOrigin` with correct logic.
- **Fixed `ProfileRules` method calls in `Core.ts`** for the new rule structure.

### Removed
- Deprecated `noProxyPerOrigin` field (replaced with `enableProxyPerOrigin`).

---

## [1.0.4] – 2026-07-07

### Added

#### Automatic protocol switching
- **Automatic detection of working protocol during testing** – if a proxy does not work with its declared protocol (SOCKS, HTTP, HTTPS), the extension automatically tries other protocols to find a working one. This saves users from having to manually try protocols for each proxy.
- **Two switching modes:**
  - **«Probable» (recommended)** – SOCKS → HTTP, HTTP → HTTPS, HTTPS → HTTP.
  - **«Full»** – HTTP → HTTPS → SOCKS4 → SOCKS5 (complete protocol enumeration).
- **Global setting for automatic protocol switching** – checkbox «Enable automatic protocol switching» and mode selector (Probable / Full).
- **Logging** – during protocol switching, log messages about attempts and successful changes are added.
- **Saving indirect success when a protocol is discovered** – if an IP is obtained during protocol detection (even if the page fails to load), the final proxy status becomes `indirect` instead of `fail`, correctly reflecting proxy functionality.

#### Interface improvements

- **Automatic switch to Direct when saving a subscription**  
  Previously, if the active profile was **Always Enabled** with a non‑working proxy, users couldn’t add a new subscription – they had to manually switch to **Direct**, save the subscription, and then switch back.  
  Now everything happens automatically: when you click «Save», the extension temporarily switches to Direct, waits for it to apply, loads the proxy list, saves the subscription, and silently restores the original profile.
- **Auto‑save of subscription** – after successfully adding a subscription, changes are automatically saved, eliminating the need for an extra save button click.
- **Embedded test log viewer** – integrated into the settings page (in the menu column, below the navigation menu) and as a separate popup window from the popup. Shows test progress in real time with detailed steps: proxy start, IP detection, page availability, final status, and moving to the next proxy.
- **Informational message when test starts** – when any test is launched, a message appears in the log: `🔍 Checking proxy health`, so users immediately see the process has started.
- **Display of direct IP in logs** – when `enableDirectIpDetection` is enabled, the direct IP is shown in the log at the start of the test.
- **IP comparison in logs** – for each proxy, the IP step shows comparison with the direct IP:  
  - `☑️ differs from direct IP: ...` (blue) – proxy works.  
  - `⚠️ matches direct IP (proxy not working)` (red) – proxy failed; a reconnect and retry will be performed.
- **Informational message when checking a site** – before requesting the target site, a line like `🔍 Checking site: https://rutracker.org...` appears, so users know the active site availability check is ongoing.
- **Country flags in test logs** – now country flags appear next to the proxy host in the log using the `Twemoji Country Flags` font for cross‑browser support (fixes flag display in Chrome).
- **Localised test logs** – all log messages, labels, and statuses translated into all 21 supported languages.
- **Immediate feedback on stop** – clicking «Stop» now immediately shows a stop message, letting the user know cancellation is initiated and they must wait for full completion.
- **«Log» button in the proxy test block** – toggles the embedded log viewer on the settings page.
- **«Pin» button in the log window** – tries to keep the log window on top (focus on new messages), making it easier to observe long tests.
- **Log appearance and layout** – compact design with reduced padding and font, height increased to 550px, default width increased from 320 to 450px for better readability. Title centred; «Clear» and «Close» buttons placed nearby.
- **Centred test type menu in popup** – the menu appearing when clicking the **Test** button in the popup is now horizontally centred, improving UX and preventing shift to the right, especially on small popup sizes. Temporary width expansion is now managed via CSS classes `wide-mode` and `wide-mode-prompt`.
- **Structure of the test control block in the popup** – buttons, progress, and «Add working» are vertically centred for better UX.
- **Locking the «Export proxies» button** – the button becomes disabled if no proxy servers are present (instead of creating an empty file).

### Fixed

- **Test buttons disappearing from popup when enabling «Enable direct IP detection»**  
  The issue occurred because `readGeneralOptions` did not copy current option values, leading to the `enableRating` and `enableDirectIpDetection` flags being reset when saving general settings. Now it correctly reads from DOM with fallback to current settings, preserving checkbox states.
- **HTML tags rendering in floating log window** – in the `ip` step, formatted text with colours and icons now renders correctly, as in the embedded log.
- **Overlapping messages in the floating log window** – fixed display: text now wraps correctly, not overlapping adjacent lines, thanks to corrected HTML content rendering and proper CSS `word-break` and `white-space` properties.
- **Empty file when exporting proxies** – now the «Export» button is disabled if the proxy list is empty.
- **Version display in footer** – version number now dynamically substituted via localisation, ensuring correct display on the settings page.
- **Visual separation of manual and subscription proxies in the popup** – subscription proxies are now grouped by subscription name with indentation; manual proxies are shown without grouping, making the interface clearer.
- **False error message when starting express‑cycle test in Firefox** – on starting the test from the popup, a warning appeared, though the test ran normally. Fixed by switching to a single callback with success check, ensuring cross‑browser stability.
- **Profile and proxy switching in cycle tests** – fixed update order: now `defaultProxyServerId` is updated first, then `Settings.updateActiveSettings()`, then `ProxyEngine.updateBrowsersProxyConfig()`. This ensures the browser applies the new proxy before the test.
- **`ip‑only` status no longer triggers protocol auto‑change** – auto‑change now only triggers on explicit fail, not on unknown (`ip‑only`) status.
- **Indirect success when protocol is detected** – if an IP is obtained during protocol search and the retest fails, the final status becomes `indirect` instead of `fail`, correctly reflecting proxy functionality.
- **Retest after protocol detection now uses the proxy with updated protocol** – previously the retest used the old protocol, causing incorrect display. Now the proxy object with the changed protocol is used, ensuring correct testing and logging.
- **Eliminated duplicate statuses in logs after protocol detection** – for standard tests (precise/quick), the final status is now sent only once with the correct protocol, not twice (old and new). Logs are cleaner and clearer.
- **Fixed lock preventing new tests after standard tests complete** – added `try-finally` blocks in `startQuickTestForSite` and `startCheckForSite`, ensuring `_isRunning` is reset even on errors. No manual refresh needed.
- **Anti‑duplicate in log now compares displayed HTML content, not message hash** – correctly removes consecutive identical lines, regardless of source. Improved log readability.

### Changed

- **Direct IP retrieval logic** – now uses temporary switching to system proxy (`withDirectProxy`) without opening the popup, which is more reliable and faster.
- **Log message structure** – each line clearly shows time, action label (PROXY, IP, SITE, STATUS), and result, with colours indicating success, fail, or indirect status.

### Removed

- **Unused localisation keys** – removed `testLogLabelNext` (arrow is now a hardcoded symbol).

---

## [1.0.3] – 2026-06-28

### Added
- **Localisation of new elements** – keys for new features (protocol auto‑change, popup override, etc.).
- **New setting: «Enable direct IP detection»** – checkbox in the «Proxy Testing» section. Disabled by default for privacy: the real IP is never sent to external IP services during tests. When enabled, direct IP is used for comparison; when disabled, the proxy host IP (if it is an IP address) serves as a reference for indirect success detection.
- **New «IP‑only» status (❔)** – introduced for cases where an IP is successfully obtained through the proxy but differs from the proxy host IP (when direct IP detection is disabled) and the main test page fails to load. This status is displayed separately from indirect success and does not affect the proxy rating.
- **Fetch‑based proxy testing** – replaced visible/invisible tab creation with `fetch` API requests for both the main URL and IP services. Eliminates unwanted page loads, speeds up testing, and prevents browser history pollution.
- Localisation of the new setting across all supported languages.
- Centralised IP service management (`IpServiceManager`) for caching direct IP and ranked IP services.
- Unified proxy checking core (`ProxyCheckerCore`) with separate logic for precise/quick and cycle tests.
- Centralised result saver (`ResultSaver`) for updating rating, auto‑status, and progress.
- Test manager (`TestManager`) for test locking, profile switching, and proxy switching.

### Changed
- **Indirect success logic** – when direct IP detection is disabled, matching the IP obtained through the proxy with the proxy host IP is now considered an indirect success (☑️), correctly indicating that the proxy returns its own IP. Previously this was misinterpreted as direct IP detection, causing unnecessary retries. If the IP differs from the host and the page fails to load, the new `IP‑only` (❔) status is assigned.
- **Test type classification** – unified test types across the codebase: `'precise'` for precise, `'quick'` for express, `'cycle'` for cyclic, and `'express-cycle'` for express‑cyclic. Eliminates confusion in logs and test locking.
- **Immediate proxy application in cycle tests** – added `ProxyEngine.updateBrowsersProxyConfig()` calls when switching profiles and proxies, ensuring the browser applies settings immediately, restoring original cycle test performance.
- **Console messages clearly indicate the reference used (direct IP or proxy host)** depending on the setting, and display the appropriate status symbol (✅, ☑️, ❔, ⛔) for each result.
- Refactored all test types (Precise, Express, Cycle, Express‑Cycle) to use shared modules, removing ~70% of duplicate code.
- Improved test status display: indirect success now correctly shown as ☑️ during test execution.
- Deleting proxies with the Delete key now saves immediately.

### Fixed
- TypeScript compilation error due to invalid type `'precise'` in `TestManager.tryStartTest()` – expanded allowed test types.
- Incorrect behaviour when direct IP detection was disabled – tests were unnecessarily repeated due to false positive direct IP detection.
- Reduced «Invalid tab ID» errors by limiting retry attempts.
- Fixed issue where proxies deleted with the Delete key reappeared after page reload.
- Fixed TypeScript compilation errors related to missing exports and unused imports.
- Fixed missing `TestManager` import in `Core.ts`.
- Fixed incorrect `statusType` for indirect success in non‑cycle tests.
- **Fixed unwanted file downloads** during testing – IP services checks using tabs replaced with `fetch` calls, eliminating automatic downloads of empty or corrupted files.
- **Fixed rating link in the store** – now correctly points to the ProxyMust page on Firefox Add‑ons.

### Removed
- Excessive duplicate code in proxy checkers and testers.
- Tab creation (visible/invisible) for proxy testing (replaced with `fetch`‑based checks).

---

## [1.0.2] – 2026-06-20

### Added
- Added a privacy notice in the «Proxy Testing» section, explaining IP address transmission to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed `license` field from manifest (now set via AMO).
- Merged two separate info messages about testing into one common explanation.
- Updated `settings.html` to display the merged privacy and testing process message.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate `settingsProxyTestPrivacyNotice` from localisation.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate info block in `settings.html`.

---

## [1.0.1] – 2026-06-18

### Added
- Added a privacy notice in the «Proxy Testing» section, explaining IP address transmission to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed `license` field from manifest (now set via AMO).
- Merged two separate info messages about testing into one common explanation.
- Updated `settings.html` to display the merged privacy and testing process message.
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
- Proxy rating system (manual and automatic based on test results).
- Display of test status for each proxy and site (✅ ☑️ ❓ ⛔).
- Proxy testing: precise test, express test, cyclic test, express‑cyclic test.
- Context menu in the proxy table (right‑click): change rating, priority (pin/star), export selected, copy addresses, delete, clear statuses, run tests for selected proxies.
- Sorting by rating and priority (in popup and settings table).
- Country flags (based on IP2Location).
- Ability to manually add/remove test sites.
- Configurable test status staleness time.
- «Add working» button in popup – add successfully tested subscription proxies to the manual list.
- New localisation languages: Bengali (bn), Hindi (hi), Japanese (ja), Korean (ko), Portuguese (pt), Urdu (ur), Vietnamese (vi).
- Improved import: automatic switching between text/file modes; export selected proxies via context menu.

### Changed
- Updated manifests: version 1.0.0, short_name: «Xmust», homepage_url, author.
- Localisation for 21 languages (reviewed original SmartProxy languages, added new ones).
- Default WebDAV backup filename: `proxymust_settings.json`.
- Default exported proxy list filename: `ProxyMust-Servers-export.txt`.
- Settings page footer shows `ProxyMust 1.0.0 (based on SmartProxy 2.1)`.
- Removed affiliate ad block (AvaProxy).
- Disabled update notifications (UpdateManager).

### Fixed
- Fixed `settings.html` structure (closed table, correct placement of rating and test controls).
- Fixed DataTables initialisation errors when tables are empty.

### Removed
- Update check code (UpdateManager).
- Affiliate advertising (AvaProxy).

### Localisation
- Supported languages (21): Arabic (ar), Bengali (bn), German (de), English (en), Spanish (es), Persian (fa), French (fr), Hindi (hi), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Dutch (nl), Polish (pl), Portuguese (pt), Russian (ru), Turkish (tr), Urdu (ur), Vietnamese (vi), Simplified Chinese (zh_CN), Traditional Chinese (zh-TW).