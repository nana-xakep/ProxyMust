# Changelog

All notable changes to this project will be documented in this file.

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