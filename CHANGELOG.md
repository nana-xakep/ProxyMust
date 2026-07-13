# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] – 2026-07-13

### Changed
- **Codebase updated to SmartProxy 2.2.1** – all improvements and fixes from upstream integrated.

### Added
- **Rule management directly from the popup** – now you can delete, enable/disable a rule, and also enable **"Proxy per tab"** mode (Firefox only) without going to settings.
- **"Proxy per tab" mode for individual rules** – if a rule matches one request, enabling this mode will proxy the whole tab through the same proxy (available only in Firefox).
- **Display and editing of the "Proxy per tab" mode in rule settings** – added a checkbox "Proxy per origin (Firefox only)" in the rule edit modal.
- **Automatic settings update** – no need to reload the page to see changes made in the popup.
- **Synchronization safety** – prevented accidental overwriting of local settings when first enabling sync.
- **Fixed import of rules from SwitchyOmega** – CIDR/IP rules are now correctly handled.
- **New option in general settings** – `deleteRuleWhenDisabledFromPopup` (controls behaviour when disabling a rule from the popup).
- **Automatic import mode switching for rules** – now when you paste text in the "Rules backup text" field, the "Text" mode activates; when selecting a file, the "File" mode activates. A similar improvement was previously made for proxy import.
- **Localised tooltips for new popup buttons** – tooltips now appear in the interface language.

### Fixed
- **Chromium fix (v2.2.1)** – exception rules (whitelist) from subscriptions now correctly apply proxies in Chrome/Edge.
- **Fixed restoration of `ProxyServerId` when importing a backup** – relationships between rules and proxy servers are now restored correctly.
- **Fixed compilation error** related to missing `noProxyPerOrigin` field – replaced with `enableProxyPerOrigin` with correct logic.
- **Fixed `ProfileRules` method calls in `Core.ts`** to work with the new rule structure.

### Removed
- Deprecated `noProxyPerOrigin` field (replaced with `enableProxyPerOrigin`).

---

## [1.0.4] – 2026-07-07

### Added

#### Automatic protocol switching
- **Automatic detection of working protocol during testing** – if a proxy does not work with the declared protocol (SOCKS, HTTP, HTTPS), the extension automatically tries other protocols to find a working one. This saves the user from manually cycling through protocols for each proxy.
- **Two switching modes:**
  - **"Probable" (recommended)** – SOCKS → HTTP, HTTP → HTTPS, HTTPS → HTTP.
  - **"Exhaustive"** – HTTP → HTTPS → SOCKS4 → SOCKS5 (full scan of all protocols).
- **Global setting for the automatic protocol switching feature** – checkbox "Enable automatic protocol switching" and mode toggle (Probable / Exhaustive).
- **Log display** – when switching protocols, log messages are added about the attempt and successful protocol change.
- **Indirect success preservation when a protocol is discovered** – if an IP is obtained during protocol detection (even if the page did not load), the final proxy status becomes `indirect` instead of `fail`. This correctly reflects the proxy's usability.

#### UI improvements

- **Automatic switch to Direct when saving a subscription**  
  Previously, if the **Always Enabled** profile was active with a non‑working proxy, the user could not add a new subscription – they had to manually switch to **Direct**, save the subscription, and then switch back.  
  Now everything happens automatically: when "Save" is clicked, the extension temporarily switches to Direct, waits for the change to apply, loads the proxy list, saves the subscription, and silently restores the original profile.
- **Auto‑save subscription** – after successfully adding a subscription, changes are automatically saved, eliminating the extra click of the save button on the subscriptions page.
- **Built‑in test log viewer** – integrated into the settings page (in the settings menu column, below the navigation menu) and into a separate popup window invoked from the control panel (popup). Displays real‑time test progress with detailed steps: start of proxy check, IP detection, page availability, final status, and move to next proxy.
- **Informational message about test start** – when any test is started, the log shows `🔍 Checking proxy availability` so the user immediately sees that the process has begun.
- **Direct IP display in log** – when the `enableDirectIpDetection` option is enabled, the log shows a line with the direct IP (colour `#00aaff`) at the start of the test.
- **IP comparison in log** – for each proxy, the `ip` step displays a comparison result with the direct IP:  
  - `☑️ differs from direct IP: ...` (blue) – proxy is working.  
  - `⚠️ matches direct IP (proxy not working)` (red) – proxy did not connect. It will be reconnected and re‑checked.
- **Informational message about site check start** – before requesting the target site, the log adds a line like `🔍 Checking site: https://rutracker.org...` to show that active site availability checking is in progress, not just waiting.
- **Country flags in test log** – now the log shows flags next to the proxy host using the `Twemoji Country Flags` font for cross‑browser support (fixes flag display in Chrome).
- **Localisation for test log** – all log messages, labels, and statuses are translated into all 21 supported languages.
- **Instant feedback on stop** – clicking the "Stop" button now immediately displays a stop message in the log, letting the user know that cancellation is initiated and they need to wait for the test to fully finish.
- **"Log" button in the proxy testing block** – toggles the visibility of the built‑in log viewer right on the settings page.
- **"Pin" button in the log window** – allows keeping the log window on top of other browser windows (focus on new messages), making it easier to monitor long tests.
- **Log appearance and layout** – compact design with reduced margins and font, height increased to 550 pixels, default width increased from 320 to 450 pixels for better readability. Header centred; "Clear" and "Close" buttons placed side by side.
- **Centering of test type selection menu in the control panel** – the menu that appears when clicking the **Test** button in the control panel (popup) is now horizontally centred inside the popup window, rather than anchored to the left edge of the button. This improves interface perception and prevents the menu from shifting right, especially when the popup window is small. Temporary widening of the popup for the menu and site input dialog is now handled via CSS classes `wide-mode` and `wide-mode-prompt`, ensuring correct display on all screens.
- **Structure of the test control block in the control panel** – buttons, progress bar, and "Add working" are vertically aligned in the centre for improved UX.
- **Locking the "Export proxies" button** – the button becomes inactive if there are no proxy servers in the list (instead of creating an empty file as before).

### Fixed

- **Test buttons disappearing from the popup when the "Enable direct IP detection" option is enabled**  
  The error occurred because the `readGeneralOptions` method did not copy the current settings values, which caused the `enableRating` and `enableDirectIpDetection` flags to be reset when saving general settings. Now the method correctly reads values from the DOM with a fallback to the current settings, preserving checkbox states and preventing buttons from disappearing.
- **HTML tags displayed in the floating log window** – in the `ip` step, formatted text with colours and icons now displays correctly, as in the built‑in log.
- **Message overlap in the floating log window** – fixed line display: text now wraps correctly without overlapping neighbouring lines, thanks to corrected HTML content rendering and proper `word-break` and `white-space` CSS properties.
- **Empty file on proxy export** – now the "Export" button is disabled when the proxy list is empty.
- **Version display in footer** – the version number is now dynamically inserted via localisation, ensuring correct display on the settings page.
- **Visual separation of manual and subscription proxies in the popup** – in the active proxy dropdown, subscription proxies are now grouped by subscription name (as in settings) with an indent. Manual proxies are displayed without grouping, making the interface clearer.
- **False error message when starting express‑cyclic test in Firefox** – when starting a test from the popup in Firefox, a warning "express cycle test failed {0}" sometimes appeared, even though the test started and worked normally. The cause was the handling of asynchronous responses in Firefox with separate error callbacks. Fixed by switching to a single callback with success checking, ensuring cross‑browser stability.
- **Profile and proxy switching in cyclic tests** – fixed the order of settings updates: now `defaultProxyServerId` is updated first, then `Settings.updateActiveSettings()`, then `ProxyEngine.updateBrowsersProxyConfig()`. This ensures that the browser applies the new proxy before the test.
- **`ip-only` status no longer triggers automatic protocol switching** – automatic protocol switching is now triggered only on explicit failure (`fail`), not on unknown status (`ip-only`).
- **Indirect success on protocol discovery** – if an IP is obtained during protocol search and the retest ends in failure, the final status becomes `indirect` instead of `fail`. This correctly reflects the proxy's usability.
- **Retest after auto‑detected protocol now uses the proxy with the updated protocol** – previously the retest was performed with the old protocol, causing the logs to show the incorrect protocol and the check to repeat with wrong settings. Now, when a working protocol is found, the retest uses the proxy object with the already changed protocol, ensuring correct testing and output.
- **Removed duplicate statuses in logs after auto‑protocol detection** – for normal tests (precise/quick), the final status is now sent only once with the correct protocol, not twice (old and new). This makes logs cleaner and more understandable.
- **Fixed lock preventing new tests from starting after normal tests finish** – added `try-finally` blocks in `startQuickTestForSite` and `startCheckForSite` to guarantee that the `_isRunning` flag is reset even if errors occur. Now manual refresh of the extension is no longer required to rerun tests.
- **Anti‑duplicate in the log now compares displayed HTML content rather than message hash** – this correctly filters consecutive identical strings regardless of source (previously duplicates could pass due to differences in auxiliary fields). Improved log readability.

### Changed

- **Direct IP retrieval logic** – direct IP is now obtained by temporarily switching to the system proxy (`withDirectProxy`) without opening a popup, which is more reliable and faster.
- **Log message structure** – each line now clearly shows: time, action label (PROXY, IP, SITE, STATUS), and result, with colours indicating success, failure, or indirect status.

### Removed

- **Unused localisation keys** – removed `testLogLabelNext` (the arrow is now a hard‑coded symbol).

---

## [1.0.3] – 2026-06-28

### Added
- **Localisation for new elements** – added keys for new features (auto protocol switching, override in popup, etc.).
- **New setting: "Enable direct IP detection"** – a checkbox in the "Proxy Testing" section of settings. Disabled by default to protect user privacy: the real IP is not sent to external IP services during tests. When enabled, tests use the direct IP for comparison; when disabled, the proxy's own host (if it is an IP address) is used as the baseline for indirect success determination.
- **New "IP‑only" status (❔)** – introduced for cases where an IP address is successfully obtained through the proxy but differs from the proxy host's IP address (when the direct IP detection checkbox is off), and the main test page does not load. This status is displayed separately from indirect success and does not affect the proxy rating.
- **Fetch‑based proxy testing** – creation of visible/invisible tabs has been replaced with `fetch` API requests for both the main URL and IP service checks. This eliminates unwanted downloads, speeds up testing, and prevents browser history pollution.
- Localisation of the new setting in all supported languages.
- Centralised IP service management (`IpServiceManager`) for caching direct IP and ranked IP services.
- Unified proxy checking core (`ProxyCheckerCore`) with separate logic for precise/express tests and cyclic tests.
- Centralised result saver (`ResultSaver`) for updating rating, automatic status, and progress.
- Test manager (`TestManager`) for test locking, profile switching, and proxy switching.

### Changed
- **Indirect success logic** – when direct IP detection is disabled, matching the IP obtained through the proxy with the proxy host's IP address is now considered an indirect success (☑️), correctly indicating that the proxy returns its own IP. Previously, such a match was mistakenly interpreted as direct IP detection and caused unnecessary retries. If the IP differs from the host and the page does not load, the new `IP‑only` status (❔) is assigned instead.
- **Test type classification** – unified test types across the codebase: `'precise'` for accurate tests, `'quick'` for express tests, `'cycle'` for cyclic tests, and `'express-cycle'` for express‑cyclic tests. This eliminates confusion in logs and test locking.
- **Immediate proxy application in cyclic tests** – added calls to `ProxyEngine.updateBrowsersProxyConfig()` when switching profiles and proxies, ensuring that proxy settings are applied immediately in the browser, restoring the original performance of cyclic tests.
- **Console messages now clearly indicate the baseline used for IP comparison (direct IP or proxy host)** depending on the setting, and display the corresponding status symbol (✅, ☑️, ❔, ⛔) for each test result.
- Refactoring of all test types (Precise, Express, Cycle, Express‑Cycle) to use common modules, eliminating ~70% of duplicated code.
- Improved display of test statuses: indirect success now correctly shows as ☑️ during test execution.
- Deleting proxies via the Delete key now saves immediately.

### Fixed
- TypeScript compilation error due to invalid type `'precise'` in `TestManager.tryStartTest()` – extended the list of allowed test types.
- Incorrect behaviour when direct IP detection is disabled, where tests were unnecessarily retried due to false positive direct IP detection.
- Reduced "Invalid tab ID" errors by limiting the number of retries.
- Fixed an issue where proxies deleted via the Delete key reappeared after page reload.
- Fixed TypeScript compilation errors related to missing exports and unused imports.
- Fixed missing import of `TestManager` in `Core.ts`.
- Fixed incorrect `statusType` for indirect success in non‑cyclic tests.
- **Fixed unwanted file downloads** during testing – tab‑based IP service checks replaced with `fetch` calls, eliminating automatic download of empty or corrupted files.
- **Fixed the rating link in the store** – now correctly points to the ProxyMust page on Firefox Add‑ons.

### Removed
- Redundant code duplicates in proxy checkers and testers.
- Creation of visible and invisible tabs during proxy testing (replaced by `fetch`‑based checks).

---

## [1.0.2] – 2026-06-20

### Added
- Added a privacy notice in the "Proxy Testing" section explaining the transmission of IP addresses to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed the `license` field from the manifest (now set via AMO).
- Merged two separate testing info messages into one combined explanation.
- Updated `settings.html` to display the merged privacy and testing process message.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate `settingsProxyTestPrivacyNotice` message from localisation.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate info block in `settings.html`.

---

## [1.0.1] – 2026-06-18

### Added
- Added a privacy notice in the "Proxy Testing" section explaining the transmission of IP addresses to external services.
- Added `PRIVACY.md` and `PRIVACY.ru.md` with detailed privacy policy.

### Changed
- Updated Firefox manifests: added `data_collection_permissions` with `locationInfo` requirement.
- Removed the `license` field from the manifest (now set via AMO).
- Merged two separate testing info messages into one combined explanation.
- Updated `settings.html` to display the merged privacy and testing process message.
- Updated `_locales/en/messages.json` and `_locales/ru/messages.json` accordingly.

### Fixed
- Removed duplicate `settingsProxyTestPrivacyNotice` message from localisation.
- Fixed manifest validation warnings (`data_collection_permissions` and `license`).

### Removed
- Duplicate info block in `settings.html`.

---

## [1.0.0] – 2026-06-15

### Added (fork from SmartProxy 2.1)
- Rebranding: SmartProxy → ProxyMust, Smart Proxy → Selectable Proxy, Smart Profiles → Selectable Profiles.
- Proxy rating system (manual change, automatic based on test results).
- Display of test status for each proxy and site (✅ ☑️ ❓ ⛔).
- Proxy testing: precise test, express test, cyclic test, express‑cyclic test.
- Context menu in the proxy table (right‑click): change rating, priority (pin/star), export selected, copy addresses, delete, clear statuses, run tests for selected proxies.
- Sorting by rating and priority (in popup and settings table).
- Country flags (based on IP2Location).
- Ability to manually add/remove test sites.
- Configurable test status staleness time.
- "Add working" button in the popup – adds successfully tested subscription proxies to the manual list.
- New localisation languages: Bengali (bn), Hindi (hi), Japanese (ja), Korean (ko), Portuguese (pt), Urdu (ur), Vietnamese (vi).
- Improved import: automatic switching between text/file mode; export selected proxies via context menu.

### Changed
- Updated manifests: version 1.0.0, short_name: «Xmust», homepage_url, author.
- Localisation for 21 languages (reviewed original SmartProxy languages, added new ones).
- Default WebDAV backup filename: `proxymust_settings.json`.
- Exported proxy list filename: `ProxyMust-Servers-export.txt`.
- Settings page footer displays `ProxyMust 1.0.0 (based on SmartProxy 2.1)`.
- Removed partner advertisement block (AvaProxy).
- Disabled update notifications (UpdateManager).

### Fixed
- Fixed `settings.html` structure (closed table, correct placement of rating and test controls).
- Fixed DataTables initialisation errors on empty tables.

### Removed
- Update checking code (UpdateManager).
- Partner advertisement (AvaProxy).

### Localisation
- Supported languages (21): Arabic (ar), Bengali (bn), German (de), English (en), Spanish (es), Persian (fa), French (fr), Hindi (hi), Indonesian (id), Italian (it), Japanese (ja), Korean (ko), Dutch (nl), Polish (pl), Portuguese (pt), Russian (ru), Turkish (tr), Urdu (ur), Vietnamese (vi), Simplified Chinese (zh_CN), Traditional Chinese (zh‑TW).