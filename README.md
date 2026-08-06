# ProxyMust

**Advanced selective Proxy Checker & Manager**  
Version: 1.0.6 (based on SmartProxy 2.2.1)  
Fork maintainer: nana-xakep  
Source code: [github.com/nana-xakep/ProxyMust](https://github.com/nana-xakep/ProxyMust)

---

## 📖 Introduction

**ProxyMust** is a fork of [SmartProxy](https://github.com/salarcode/SmartProxy), created for more flexible and convenient management of proxy servers. The extension automatically enables or disables a proxy for websites based on configured rules, allows testing proxy availability, assigns ratings, and sorts by priority.

ProxyMust works in **Chrome, Firefox, Edge, Opera, and Firefox for Android** and is fully translated into **21 languages**.

> **⚠️ Important:** This extension **does not provide** its own proxy servers. You must add them yourself. It also **does not collect or transmit** any user data.

---

## 🆕 What's new in version 1.0.6

- **AutoProxy – automatic proxy selection for Selective profile** – rules without an explicit proxy now automatically pick the best proxy based on test results (rating, statuses, freshness). Users can enable Auto mode in the profile settings via the “Manual / Automatic” toggle.
- **Centralised status management** – `AutoStatusService` provides a single point of access for reading and updating proxy statuses.
- **Proxy selection logic** – `ProxySelector` implements a hierarchy: **success → indirect → ip‑only → unknown → fail**, with priority (`pin`/`star`), rating, and freshness. `getBestProxyForSite` and `getNextProxyForSite` methods support failover.
- **Unified proxy application** – `ProxySwitcher` extracts switching logic, reused for tests and AutoProxy.
- **Dynamic proxy override in ProxyEngine** – `setDynamicProxyForSite`, `clearDynamicProxyForSite` allow temporary proxy substitution per site without changing rules.
- **Failover in WebFailedRequestMonitor** – on connection errors in Auto mode (main_frame only), the system switches to the next proxy from the priority-sorted list and reloads the tab.
- **Auto‑rule creation** – after a successful test (status success, indirect, or ip‑only), a disabled rule is automatically created in the Selective profile with the `isAuto` flag. If Auto mode is active, the rule is enabled automatically.
- **Working proxy caching** – after a successful page load (status 200), the current proxy is cached for the site; subsequent errors on sub‑resources do not trigger new switches. The cache is cleared when switching profiles, manually changing proxy, or after 5 minutes.
- **Proxy information in the rules table** – for auto‑rules, the “Proxy server” column now shows:
  - Country flag
  - Proxy name, protocol, rating
  - Current status (✅ ☑️ ❔ ❌)
  - Remaining status lifetime (with colour indication: green, yellow, red)
  - `auto` / `manual` tag
- **Context menu for rule rows** – right‑click a rule to:
  - Assign a proxy (opens a filtered list for that site)
  - Re‑test (current proxy, all successful, or all proxies)
  - Exclude a proxy (globally or for this site)
  - Delete the rule
  - Batch operations (select multiple rules → apply action to all)
- **AutoProxy settings in the profile** – in Selective profile settings, added:
  - Selection mode toggle (Manual / Auto)
  - “Max failover attempts” field (number of full‑list retries, default 3)
  - “Suggest adding unreachable sites to AutoProxy” checkbox – when a page fails to load without a proxy, a dialog offers to add it to AutoProxy.
- **Auto‑mode indication in profile name** – when Auto is enabled, a 🔄 icon is added to the profile name.
- **Real‑time status updates in the rules table** – during tests, the table automatically redraws, showing current statuses and lifetimes for auto‑rules.
- **Support for all proxies in failover** – now includes `ip‑only` and `unknown` proxies, excluding only those with explicit `fail` status, significantly improving fault tolerance.
- **Site locking after successful load** – `siteLock` prevents repeated switches when the site is already loaded; errors on sub‑resources no longer trigger failover.
- **Lock reset on tab change, profile switch, or timeout** – ensures the lock does not interfere when navigating to another site or changing settings.
- **Priority of manual rules** – manual rules (with explicit proxy) always have priority over auto‑rules.
- **Status update to `success` on successful load** – after page load with status 200, the proxy status for this site is updated to `success`, increasing the rating and improving future selection.
- **Status lifetime displayed in the table** – remaining time until staleness is shown next to the proxy in the “Proxy server” column with colour indication.
- **`auto`/`manual` tags in the rules table** – each auto‑rule is marked with `auto`, manual with `manual`.
- **Dialog for adding an unreachable site to AutoProxy** – if the option is enabled and a site fails to load without a proxy, a dialog offers to add it to AutoProxy.
- **CSV subscription support** – new `ProxyImporter.parseCsv` parses proxy lists in CSV format (separators: comma, semicolon, tab). Supports both headers and plain order (host, port, protocol, username, password, country).
- **Auto‑detection of import format** – during manual import, the extension sequentially tries **JSON → CSV → TXT**, ensuring correct handling of any list, including those starting with markers like `[ProxyMust Servers]`.
- **Improved auto‑detection for proxy import** – fields like `ip` → `host`, `country`/`country_code` → `countryCode`, `user` → `username`, `pass` → `password` are mapped correctly, restoring compatibility with services like proxyscrape.

All previous features (testing, rating, auto‑protocol detection, statuses, context menu, test log, etc.) are retained and improved.

For a detailed list of changes, see [CHANGELOG.md](CHANGELOG.md).

---

## 📦 Installation

### From the store (recommended)
- **Firefox Add‑ons:** go to the store, search for "ProxyMust", and click "Install".
- **Chrome Web Store:** similarly.
- **Edge, Opera:** through their respective extension stores.

### Manual (for developers)
1. Download the latest release from [GitHub Releases](https://github.com/nana-xakep/ProxyMust/releases).
2. Unpack the archive into a separate folder.
3. **Chrome/Edge/Opera:** open `chrome://extensions`, enable "Developer mode", click "Load unpacked", and select the extension folder.
4. **Firefox:** open `about:debugging`, click "Load Temporary Add‑on", and select any file in the extension folder.

---

## 🎛 Operation modes (profiles)

In the popup (toolbar icon) you can switch between modes:

- **Direct (no proxy)** – all requests go direct, no proxy is used.
- **Selective proxy** – proxy is enabled only for sites that match the rules (blacklist). This profile now supports **Auto mode** – rules without an explicit proxy automatically choose the best working proxy based on test results.
- **Always on** – proxy works for all sites except those added to exclusions (whitelist).
- **System proxy** – the decision to use a proxy is delegated to the operating system (system settings).

You can also create **custom profiles** with unique rule sets and proxy bindings.

---

## 🖥 Managing proxy servers

On the settings page (tab "Proxy Servers") you can manage your proxy list.

### Manual addition
1. Click "Add Server".
2. Specify:
   - **Name** (for convenience)
   - **Address** (IP or domain)
   - **Port**
   - **Protocol** (HTTP, HTTPS, SOCKS4, SOCKS5)
   - If needed — **login and password** (not supported for SOCKS in Chrome).
3. Click "Save".

### Importing a list
- Click "Import Proxies".
- Paste the proxy list text or upload a file.
- Supported formats: `host:port`, `host:port [protocol]`, `protocol://user:pass@host:port`, **CSV** (with or without headers).
- The extension automatically detects the format (JSON → CSV → TXT) and removes duplicates.
- Auto‑mapping of fields: `ip` → `host`, `country` → `countryCode`, `user` → `username`, `pass` → `password`.

### Export
- Click "Export Proxies" – the entire list will be saved.
- Or select several proxies in the table, right‑click → "Export selected" (context menu).

---

## 🧪 Testing proxies

Check whether a proxy works for your desired site. Choose a site from the dropdown (or add your own) and click "Test". Four test types are available:

- **Cyclic test** (works in all browsers) – sequentially switches the active profile and each proxy in the list, checking site loading. The most reliable but slow.
- **Express‑cyclic test** (all browsers) – faster version, suitable for preliminary evaluation.
- **Precise test** (does not work in Firefox) – thorough check, gives precise results.
- **Express test** (does not work in Firefox) – quick check.

> **🛡️ Privacy control:** in settings you can enable or disable the **"Enable direct IP detection"** checkbox (disabled by default).  
> When **disabled**, your real IP is *never* sent to external IP services – the extension relies only on loading the test site and compares the proxy host (if it is an IP) with the IP obtained through the proxy.  
> When **enabled**, your IP is sent to IP services for more accurate results (the ❔ status is excluded).

> **⚡ Performance and privacy:** ProxyMust now performs all tests **without opening browser tabs**. All checks (loading the main page and IP service requests) are done via `fetch` requests. This means no history entries, unwanted downloads, and faster testing.

Tests can be launched for:
- all proxies in the table,
- only selected ones (via context menu),
- the current site directly from the popup (the "Test" button).

**About timeouts:** the test timer is automatically extended on each progress update, so long tests (e.g., hundreds of proxies) will not be cut off prematurely.

### 📋 Test log viewer

During any test, you can open the **log window** (the "📋 Log" button in the popup or in the testing block on the settings page). The log shows:

- Time of each event.
- Proxy being tested (with country flag and protocol).
- IP address obtained through the proxy.
- Availability of the test site.
- Final status (✅ success, ☑️ indirect success, ❔ IP‑only, ⛔ failure).
- Transitions to the next proxy.
- Stop and completion messages.

The log updates in real time and is buffered, so you won't miss any event. The separate window has a **"Pin"** button that tries to keep the window on top (focus on new messages) – this makes monitoring easier, but it is not a true "always on top" due to browser limitations.

---

## 📊 Rating and proxy statuses

Each proxy receives a **numeric rating** that automatically changes based on test results: `+1` for success, `–1` for failure. You can also manually change the rating via the context menu (right‑click).

Next to each proxy, a **status** is displayed for the chosen site:

- ✅ – definitely working (fresh success)
- ☑️ – probably working (data outdated or success obtained for another site)
- ❔ – IP obtained but page did not load (appears only when **direct IP detection is disabled** and the obtained IP differs from the proxy host)
- ❓ – no data
- ⛔ – not working (fresh failure)

In settings, you can set the **staleness time** (default 6 hours). After this period, the status becomes indirect (☑️).

Sorting in the popup and settings table takes into account **priority** (📌 pinned, ⭐ starred) and rating.

The ❔ status **does not affect** the proxy rating, because it is unclear whether the proxy actually works (IP obtained but site not loaded).

---

## 📝 Rules (filters)

Rules determine for which sites to enable or disable the proxy. They are configured in profiles (tab "Selective Profiles").

### Rule types
- **Domain and subdomains** – e.g., `google.com` will match `mail.google.com`.
- **Host / URL pattern** – e.g., `*.google.com`.
- **Regular expression** (for host or full URL).
- **Exact URL** – full match.
- **IP range (CIDR)** – e.g., `192.168.1.0/24`.

### Adding rules
- From the popup: click on a domain in the "Proxyable Resources" list.
- Manually: on the settings page, in the desired profile, click "Add Rule".
- Import: from GFWList or SwitchyOmega files.

**Priority:** whitelist rules always have higher priority and disable the proxy for the specified sites.

### AutoProxy behaviour
- For rules with **Auto** mode, the system automatically selects the best proxy based on test results and freshness.
- If a page fails to load without a proxy, a dialog suggests adding the site to AutoProxy (can be disabled in profile settings).
- After a successful test for a site, an auto‑rule is created (disabled) and, if Auto mode is active, automatically enabled.
- Manual rules (with an explicit proxy) always take precedence over auto‑rules.

---

## 🖱 Context menu

In the proxy table (on the settings page), right‑click on a proxy row. A menu appears where you can:

- Change rating (+1, –1, reset)
- Set priority: 📌 pin or ⭐ star
- Export selected proxies
- Copy addresses of selected proxies
- Delete selected proxies
- Clear statuses for selected or all proxies
- Run tests for selected proxies (with site selection)
- Move selected proxies up/down (in the table)

In the popup (control panel), right‑click on an active proxy lets you:

- Change rating
- Set priority
- Add a subscription proxy to the manual list (if clicked on a subscription proxy).

---

## 📤 Import / Export

In addition to the basic import/export of the proxy list, the following improvements have been implemented:

- **Automatic mode switching:** when you type text in the input field, the "Text proxy list" mode activates; when selecting a file, the "File proxy list" mode activates.
- **Export selected:** in the table context menu you can export only the checked servers.
- **CSV import support** – parse lists in CSV format with automatic field mapping.
- **Auto‑detection of format** – the extension sequentially tries JSON, CSV, and TXT to ensure correct parsing.

---

## 📋 Subscriptions to proxy lists and rules

### Proxy list subscriptions
- Tab "Proxy Server Subscriptions" → "Subscribe to a list".
- Provide the list URL (formats: PlainText, JSON, CSV).
- The extension will automatically update the list on a schedule (set in minutes).
- Subscription proxies appear in the main list with a source tag.

### Rules subscriptions
- Inside a profile → "Rules Subscriptions" → "Subscribe to a rules list".
- Supports AutoProxy/GFWList and SwitchyOmega formats.
- Rules are automatically added to the profile.

---

## 🔄 Synchronization and backup

### Synchronization
- Enable synchronization in the general settings.
- Choose the source: **browser sync** or **WebDAV server**.
- For WebDAV, provide the URL, file name, login, and password.
- Settings are synchronized automatically on change.

### Backup
- Tab "Backup/Restore".
- Click "Create full backup" – a file with all settings, rules, and proxies will be downloaded.
- To restore, select "Restore backup" and upload the file.

---

## 🎨 Themes

- In general settings, choose **light**, **dark**, or **auto** (follows browser theme).
- You can specify a **custom theme** – paste the URL of a CSS file (must be HTTPS).
- Themes from [bootswatch.com](https://bootswatch.com) are supported.

---

## ⌨️ Keyboard shortcuts

You can configure keyboard shortcuts in your browser (extension management → keyboard shortcuts). Available commands:

- **Next / previous proxy** (cyclic switching)
- **Switch profiles:** "No proxy", "Selective", "Always on", "System"

Defaults: `Ctrl+Shift+1` – Direct, `Ctrl+Shift+2` – Selective, `Ctrl+Shift+3` – Always, `Ctrl+Shift+4` – System.

---

## ⚠️ Troubleshooting

### Extension does not work in private (incognito) mode
In browser settings (extension management), allow the extension to run in incognito mode.

### Precise and express tests do not work in Firefox
This is due to browser API limitations. Use cyclic tests – they work in all browsers.

### Proxy does not connect
- Check the address and port.
- Ensure the proxy server is running and reachable.
- If authentication is used, verify login/password (Chrome does not support authentication for SOCKS).
- Run a test to check availability.

### Statuses and ratings are not displayed
Enable the option "Enable rating for proxies" on the "Proxy Servers" tab, or press F5 to refresh the page.

### Unable to import a proxy list
Make sure the list conforms to supported formats. Use the automatic mode switching (text/file). CSV files should have proper separators.

### Error during WebDAV synchronization
- Check the URL and credentials.
- Ensure the file is writable.
- Try performing a manual backup using the "Backup Now" button.

### Where to view error logs?
Open the developer console (`F12`) on the settings page or in the popup. Enable diagnostics (the "diag?" button at the bottom of the settings page) for detailed logging.

---

## 📄 License

ProxyMust is distributed under the **GNU General Public License v3.0**. Original SmartProxy (c) Salar Khalilzadeh, to whom we express deep gratitude for his enormous work and inspiration. The full license text is available in the `LICENSE` file.

- [GitHub repository](https://github.com/nana-xakep/ProxyMust)
- [Report an issue or suggest an idea](https://github.com/nana-xakep/ProxyMust/issues)
- [Original SmartProxy](https://github.com/salarcode/SmartProxy)

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)  
License [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Version 1.0.6 (based on SmartProxy 2.2.1).

Documentation version: 1.0.6 (2026-08-05)