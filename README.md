# ProxyMust

**Advanced selective proxy manager with automatic selection of working proxy for sites**  
Version: 1.0.8 (based on SmartProxy 2.2.1)  
Fork maintainer: nana-xakep  
Source code: [github.com/nana-xakep/ProxyMust](https://github.com/nana-xakep/ProxyMust)

---

## 📖 Introduction

**ProxyMust** is a fork of [SmartProxy](https://github.com/salarcode/SmartProxy), created for more flexible and convenient proxy management. The extension automatically enables or disables proxy for sites based on configured rules, allows testing proxy availability, assigns ratings, and sorts by priority. The key feature is the **AutoProxy mode**, which automatically finds a working proxy for sites that are not directly accessible.

ProxyMust works on **Chrome, Firefox, Edge, Opera and Firefox for Android** and is fully translated into **21 languages**.

> **⚠️ Important:** This extension **does not provide** its own proxy servers. You must add them yourself. It also **does not collect or transmit** any user data.

---

## 🆕 What's new in version 1.0.8

### Added

- **Sorting of AutoProxy rules table columns** – now you can sort by "Filter Type", "Source", "Rule", "Enabled" and "Mode". The "Proxy Server" column is non‑sortable.
- **Automatic saving of rule changes** – changes (import, toggling, mode switching, proxy selection, deletion) are saved instantly without the need to press a "Save" button.
- **Context menu in the AutoProxy rules table** – right‑click on a rule to:
  - Enable/Disable
  - Toggle mode (Auto/Manual)
  - Set proxy (choose from available proxies or block)
  - Delete selected rules
  - Test the site (with modal for test type selection and options)
- **Testing from the context menu** – for a single rule, you can run a test (Precise, Quick, Cyclic, Express‑Cyclic) with the same options as on the "Proxy Servers" page.
- **Delete key support** – use the `Delete` key to remove one or more selected rules.
- **Improved rule import** – a new universal format (extracts domains from any text) is selected by default; changes are auto‑saved after import.
- **Traffic blocking (AdBlock‑like functionality)** – a dummy proxy `0.0.0.0:0` named **"🛑Block (no connection)❌"** is now available. When selected for a rule, the rule switches to **Manual** mode and all requests to the specified domains are blocked.
- **Dynamic tooltip for the AutoProxy button (🔄) in the popup** – the tooltip now reflects the actual state of the rule for the current site (no rule, disabled, manual mode, auto mode with/without pinned proxy), making the button's action predictable.

### Changed

- **Table layout optimised** – the "Source" and "Rule" columns are merged when they contain the same value; the "Enabled" and "Mode" columns are narrower with truncated headers and hover tooltips.
- **Proxy display in dialogs** – pin and change dialogs now show full proxy information (flag, country code, host, port, protocol).
- **Improved user‑stop flag handling** – the `user‑stopped` flag is correctly reset on new navigation, and the system no longer shows the change dialog when clicking links within the same domain.
- **Settings page auto‑reload** – after changes that require a page refresh (e.g., deleting rules or selecting blocking), the page reloads automatically.

### Fixed

- Various stability and performance improvements, including better failover state cleanup and accurate sorting by status and rating.

For a detailed list of changes, see [CHANGELOG.md](CHANGELOG.md).

---

## 📦 Installation

### From the store (recommended)
- **Firefox Add-ons:** go to the store, find "ProxyMust" and click "Install".
- **Chrome Web Store:** similarly.
- **Edge, Opera:** through their respective extension stores.

### Manually (for developers)
1. Download the latest release from [GitHub Releases](https://github.com/nana-xakep/ProxyMust/releases).
2. Extract the archive to a separate folder.
3. **Chrome/Edge/Opera:** open `chrome://extensions`, enable "Developer mode", click "Load unpacked" and select the extension folder.
4. **Firefox:** open `about:debugging`, click "Load Temporary Add‑on" and select any file in the extension folder.

---

## 🎛 Operating modes (profiles)

In the popup (toolbar icon) you can switch modes:

- **Direct (no proxy)** – all requests go directly, proxy is not used.
- **AutoProxy (formerly "Selective Proxy")** – proxy is enabled only for sites that match the rules. For each rule you can choose **Auto** mode (automatic selection) or **Manual** (manual proxy selection). In Auto mode, the system automatically switches proxies on errors and pins the working one.
- **Always Enabled** – proxy works for all sites except those added to exceptions (whitelist).
- **System Proxy** – proxy decision is delegated to the operating system (system settings).

You can also create **custom profiles** with unique rule sets and proxy bindings.

---

## 🤖 AutoProxy Mode

AutoProxy mode (in the "AutoProxy" profile, formerly "Selective") allows the system to automatically find a working proxy for sites that are not directly accessible (due to regional restrictions or blocks).

### How it works

1. **Adding rules** – you can add a rule manually on the "AutoProxy" tab or via the popup ("Add site" button). Also, when visiting an unreachable site, a dialog offers to add it to AutoProxy (if the option is enabled).
2. **Proxy selection** – the system analyses all available proxies (manual and from subscriptions), excludes those with status **fail** for this site, and sorts the remaining by priority (pin → star → none), then by status (success → indirect → ip-only → unknown), and within each group by rating.
3. **Application and testing** – the best proxy is applied to the site, and the page reloads. If loading fails (error), the system switches to the next proxy in the list and retries.
4. **Pinning** – when the page loads successfully, a dialog "Pin proxy for this site?" appears. On agreement, the proxy is pinned (temporarily, until browser restart) and auto‑logic for this site no longer runs (except when the user manually initiates a change).
5. **Manual change** – the user can initiate a search for a new proxy via the 🔄 button in the popup, page reload (F5), or re‑entering the address. In these cases, a "Change the assigned proxy for this site?" dialog appears.
6. **Attempt limit** – in profile settings you can set the maximum number of full passes through the proxy list (default 3). After reaching the limit, failover stops.

### AutoProxy settings in profile

In the profile settings (AutoProxy tab) you have:

- **Selection mode** – "Manual" (uses the explicitly set proxy) or "Automatic" (system selects automatically).
- **Max failover attempts** – number of full passes through the proxy list (1–10).
- **Show auto‑proxy change dialog** – if disabled, all switching‑related dialogs are suppressed.
- **Automatically pin successful proxy (without confirmation)** – if enabled, proxy is pinned immediately after successful load without dialog (disabled by default).
- **Suggest adding unreachable sites to auto‑proxy** – when a page fails to load without proxy, a dialog offers to add the site (enabled by default).

### Managing rules (new in 1.0.8)

- **Context menu** – right‑click any rule to enable/disable, switch mode, set proxy, delete, or run a test.
- **Instant saving** – all changes are saved automatically.
- **Blocking** – choose the special "Block" proxy to block access to specific domains.
- **Keyboard shortcut** – press `Delete` to remove selected rules.

---

## 🖥 Managing proxy servers

On the settings page (Proxy Servers tab) you can manage your proxy list.

### Manual addition
1. Click "Add Server".
2. Specify:
   - **Name** (for convenience)
   - **Address** (IP or domain)
   - **Port**
   - **Protocol** (HTTP, HTTPS, SOCKS4, SOCKS5)
   - Optionally — **username and password** (not supported for SOCKS in Chrome).
3. Click "Save".

### Importing a list
- Click "Import Proxies".
- Paste the proxy list text or upload a file.
- Supported formats: `host:port`, `host:port [protocol]`, `protocol://user:pass@host:port`, as well as CSV (with comma, semicolon or tab delimiters).
- The extension automatically detects protocols and removes duplicates.

### Export
- Click "Export Proxies" – the whole list is saved.
- Or select several proxies in the table, right‑click → "Export selected" (context menu).

---

## 🧪 Proxy testing

Check if a proxy works for the site you need. Select a site from the dropdown (or add your own) and click "Test". Four test types are available:

- **Cycle test** (works in all browsers) – sequentially switches the active profile and each proxy in the list, checking site loading. Most reliable but slow.
- **Express‑cycle test** (all browsers) – faster version, suitable for preliminary evaluation.
- **Precise test** (does not work in Firefox) – thorough check, gives accurate results.
- **Express test** (does not work in Firefox) – quick check.

> **🛡️ Privacy control:** you can enable or disable the **"Enable direct IP detection"** checkbox in settings (disabled by default).  
> When **disabled**, your real IP is *never* sent to external IP services – the extension relies only on site loading checks and compares the proxy host (if IP) with the IP obtained through the proxy.  
> When **enabled**, your IP is sent to IP services for more accurate results (status ❔ is eliminated).

> **⚡ Performance and privacy:** ProxyMust now performs all tests **without opening browser tabs**. All checks (main page loading and IP service requests) are done via `fetch` requests. This means no history entries, no unwanted downloads, and faster testing.

Tests can be run for:
- all proxies in the table,
- only selected ones (via context menu),
- the current site directly from the popup ("Test" button),
- **and now from the context menu of a rule in the AutoProxy table**.

**About timeouts:** the test timer is automatically extended on every progress update, so long tests (e.g., hundreds of proxies) are not interrupted prematurely.

### 📋 Test log viewer

During any test, you can open the **log window** (the "📋 Log" button in the popup or in the test control block on the settings page). The log shows:

- Time of each event.
- The proxy being tested (with country flag and protocol).
- IP address obtained via the proxy.
- Availability of the test site.
- Final status (✅ success, ☑️ indirect success, ❔ IP‑only, ⛔ failure).
- Transitions to the next proxy.
- Stop and completion messages.

The log updates in real time and is buffered, so you won't miss any event. In the separate window, there is a **"Pin"** button that attempts to keep the window on top (focus on new messages) – this helps monitoring, but is not a true "always on top" due to browser limitations.

---

## 📊 Proxy rating and statuses

Each proxy gets a **numeric rating**, which is automatically adjusted based on test results: `+1` for success, `–1` for failure. You can also manually change the rating via the context menu (right‑click).

Next to each proxy, a **status** is displayed for the selected site:

- ✅ – definitely works (fresh success)
- ☑️ – probably works (data stale or success obtained for another site)
- ❔ – IP received but page not loaded (appears only when **direct IP detection is off** and the obtained IP differs from the proxy host)
- ❓ – no data
- ⛔ – does not work (fresh failure)

You can set the **stale time** (default 6 hours) in settings. After that period, the status becomes indirect (☑️).

Sorting in the popup and settings table considers **priority** (📌 pinned, ⭐ starred) and rating.

Status ❔ **does not affect** the proxy rating, since it is unclear whether the proxy actually works (IP obtained, but site not loaded).

---

## 📝 Rules (filters)

Rules determine for which sites proxy should be enabled or disabled. They are configured in profiles (AutoProxy tab).

### Rule types
- **Domain and subdomains** – e.g., `google.com` matches `mail.google.com`.
- **Host / URL pattern** – e.g., `*.google.com`.
- **Regular expression** (for host or full URL).
- **Exact URL** – exact match.
- **IP range (CIDR)** – e.g., `192.168.1.0/24`.

### Rule modes
Each rule has a mode switch:
- **Auto** – the system automatically picks the best proxy for this site (considering statuses, rating, priority). On errors, failover is triggered.
- **Manual** – uses the proxy specified by the user (or default if not set). Auto‑selection is disabled.

When manually changing the proxy via dropdown, the rule automatically switches to **Manual**. When adding a site from the popup (🔄 button), a new rule is created with mode **Auto**.

### Managing rules (new in 1.0.8)
- **Context menu** – right‑click any rule to:
  - Enable/Disable
  - Toggle mode (Auto/Manual)
  - Set proxy (choose from available proxies or the new **Block** proxy)
  - Delete selected rules
  - Test the site (with modal for test type and options)
- **Instant save** – all changes are automatically saved.
- **Delete key** – select one or more rules and press `Delete` to remove them.
- **Blocking** – select the special proxy `0.0.0.0:0` (named "🛑Block (no connection)❌") to block traffic to the specified domains. The rule will automatically switch to Manual mode.

### Adding rules
- From popup: click on the domain in the "Proxiable items" list or use the 🔄 button (tooltip now shows current state).
- Manually: on the settings page in the desired profile, click "Add Rule".
- Import: from GFWList or SwitchyOmega files (new universal format available).
- **Automatic creation** – if a site fails to load without proxy and the corresponding option is enabled, you will be offered to add a rule to AutoProxy. Also, on a successful test for a site, a disabled rule is automatically created.

**Priority:** whitelist rules always have higher priority and disable proxy for the specified sites.

---

## 🖱 Context menu

In the proxy table (settings page), right‑click on a proxy row. A menu appears allowing you to:

- Change rating (+1, –1, reset)
- Set priority: 📌 pin or ⭐ add to favourites
- Export selected proxies
- Copy addresses of selected proxies
- Delete selected proxies
- Clear statuses for selected or all proxies
- Run tests for selected proxies (with site selection)
- Move selected proxies up/down (in the table)

In the popup (toolbar), right‑clicking on the active proxy allows you to:

- Change rating
- Set priority
- Add a subscription proxy to the manual list (if clicked on a subscription proxy).

---

## 📤 Import / Export

In addition to basic import/export of proxy lists, the following improvements are implemented:

- **Automatic mode switching:** when you type in the input field, "Text proxy list" mode is activated; when you select a file, "File proxy list" mode is activated.
- **Export selected:** in the table context menu, you can export only the selected servers.
- **CSV import:** supports CSV lists with delimiters (comma, semicolon, tab), with or without headers.
- **Rule import** – supports universal format (extract domains from any text) and imports from GFWList/SwitchyOmega.

---

## 📋 Subscriptions to proxy lists and rule lists

### Proxy list subscriptions
- "Proxy Server Subscriptions" tab → "Subscribe to a list".
- Specify the list URL (formats: PlainText, JSON, CSV).
- The extension will automatically update the list on a schedule (set in minutes).
- Proxies from subscriptions appear in the main list with the source label.

### Rule list subscriptions
- Inside a profile → "Rules Subscriptions" → "Subscribe to a rules list".
- Supports AutoProxy/GFWList and SwitchyOmega formats.
- Rules are automatically added to the profile.

---

## 🔄 Synchronisation and backup

### Synchronisation
- Enable synchronisation in general settings.
- Choose source: **browser sync** or **WebDAV server**.
- For WebDAV, specify URL, filename, login and password.
- Settings are automatically synchronised on change.

### Backup
- "Backup/Restore" tab.
- Click "Create full backup" – a file with all settings, rules and proxies will be downloaded.
- To restore, select "Restore backup" and upload the file.

---

## 🎨 Themes

- In general settings, choose **light**, **dark** or **automatic** theme (follows browser theme).
- You can specify a **custom theme** – paste the URL of a CSS file (must be HTTPS).
- Themes from [bootswatch.com](https://bootswatch.com) are supported.

---

## ⌨️ Keyboard shortcuts

You can configure keyboard shortcuts in your browser (extension management → keyboard shortcuts). Available commands:

- **Next / previous proxy** (cyclic switching)
- **Profile switching:** "No proxy", "AutoProxy", "Always Enabled", "System"

Default: `Ctrl+Shift+1` – Direct, `Ctrl+Shift+2` – AutoProxy, `Ctrl+Shift+3` – Always, `Ctrl+Shift+4` – System.

---

## ⚠️ Troubleshooting

### Extension does not work in incognito mode
In your browser's extension settings, allow the extension to run in incognito mode.

### Precise and Express tests do not work in Firefox
This is due to browser API limitations. Use cycle tests – they work in all browsers.

### Proxy does not connect
- Check address and port.
- Make sure the proxy server is running and reachable.
- If authentication is used, check login/password (Chrome does not support authentication for SOCKS).
- Run a test to check availability.

### AutoProxy does not switch on errors
- Make sure the profile is set to "AutoProxy" (formerly "Selective").
- Check that the rule has **Auto** mode selected.
- Check the "Max failover attempts" setting – the limit may have been reached.
- Enable the log viewer to see which proxies are being tried.

### Statuses and rating are not displayed
Enable the "Enable rating for proxies" option on the Proxy Servers tab or press F5 to refresh the page.

### Cannot import proxy list
Make sure the list matches the supported formats. Use automatic mode switching (text/file). For CSV, ensure the delimiter is correct (comma, semicolon, or tab).

### WebDAV synchronisation error
- Check the URL and credentials.
- Make sure the file is writable.
- Try manual backup with the "Backup Now" button.

### Where can I see error logs?
Open the developer console (`F12`) on the settings page or popup. Enable diagnostics (the "diag?" button at the bottom of the settings page) for detailed logging. Also use the built‑in test log viewer.

---

## 📄 License

ProxyMust is distributed under the **GNU General Public License v3.0**. The original SmartProxy (c) Salar Khalilzadeh, we express our deep gratitude for his great work and inspiration. The full license text is available in the `LICENSE` file.

- [GitHub repository](https://github.com/nana-xakep/ProxyMust)
- [Report an issue or suggest an idea](https://github.com/nana-xakep/ProxyMust/issues)
- [Original SmartProxy](https://github.com/salarcode/SmartProxy)

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)  
License [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Version 1.0.8 (based on SmartProxy 2.2.1).

Documentation version: 1.0.8 (2026-08-22)