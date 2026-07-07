# ProxyMust

**Advanced selective proxy manager**  
Version: 1.0.4 (based on SmartProxy 2.1)  
Fork maintainer: nana-xakep  
Source code: [github.com/nana-xakep/ProxyMust](https://github.com/nana-xakep/ProxyMust)

---

## 📖 Introduction

**ProxyMust** is a fork of [SmartProxy](https://github.com/salarcode/SmartProxy), created for more flexible and convenient proxy server management. The extension automatically enables or disables proxy for websites based on configured rules, allows you to test proxy availability, assign ratings, and sort by priority.

ProxyMust works in **Chrome, Firefox, Edge, Opera, and Firefox for Android**, and is fully translated into **21 languages**.

> **⚠️ Important:** This extension **does not provide** its own proxy servers. You must add them yourself. It also **does not collect or transmit** any user data.

---

## 🆕 What's New in Version 1.0.4

### Automatic Protocol Switching
- **Automatic detection of working protocol during testing** – if a proxy doesn't work with its declared protocol (SOCKS, HTTP, HTTPS), the extension automatically tries other protocols to find a working one. Saves manual trial and error.
- **Two switch modes:**
  - **"Probable" (recommended)** – SOCKS → HTTP, HTTP → HTTPS, HTTPS → HTTP.
  - **"Full"** – HTTP → HTTPS → SOCKS4 → SOCKS5 (exhaustive, slower).
- **Global toggle** – checkbox "Enable automatic protocol detection" and mode switcher (Probable / Full).
- **Logging** – during protocol switching, the log shows attempts and successful changes.
- **Indirect success preservation** – if IP is obtained during protocol detection (even if page doesn't load), the final status becomes `indirect` instead of `fail`, correctly reflecting proxy operability.

### UI Improvements
- **Automatic switch to Direct when saving subscriptions** – if you were on Always Enabled with a non‑working proxy, you no longer have to manually switch to Direct before saving a subscription. The extension now temporarily switches to Direct, loads the list, saves the subscription, and restores the original profile automatically.
- **Auto‑save subscriptions** – after successful addition, changes are saved immediately, eliminating extra clicks.
- **Embedded test log viewer** – integrated into the settings page (in the left menu column) and available as a separate floating window from the popup. Shows real‑time test progress with detailed steps: proxy start, IP detection, site availability, final status, and next proxy transition.
- **Info message on test start** – whenever a test is launched, the log displays `🔍 Proxy Accessibility Check` so you know the process has begun.
- **Direct IP display in log** – when `enableDirectIpDetection` is on, the log shows the direct IP at the start (colored `#00aaff`).
- **IP comparison in log** – for each proxy, the IP step shows:  
  - `☑️ differs from direct IP: ...` (blue) – proxy works.  
  - `⚠️ matches direct IP (proxy not working)` (red) – proxy is not connected; it will be re‑applied and retested.
- **Site check start message** – before requesting the target site, the log shows `🔍 Checking site: https://...` so you know active site checking is in progress.
- **Country flags in test logs** – flags appear next to proxy hosts using the `Twemoji Country Flags` font (cross‑browser).
- **Full localization** – all log messages, labels, and statuses are translated into all 21 supported languages.
- **Instant stop feedback** – clicking the "Stop" button immediately shows a stop message in the log, confirming cancellation.
- **"Log" toggle button** – in the proxy test block on the settings page, toggles the built‑in log viewer.
- **"Pin" button in the log window** – attempts to keep the window on top of others (focuses on new messages), making it easier to monitor long tests.
- **Log layout** – compact design with smaller font and padding; height increased to 550px, width default enlarged from 320 to 450px for better readability. Header centered; "Clear" and "Close" buttons placed next to each other.
- **Centered test type menu in popup** – the menu that appears when clicking the **Test** button in the popup is now horizontally centered within the popup, improving UI and preventing misalignment.
- **Vertical alignment of test controls in popup** – buttons, progress, and "Add working" are vertically centered for better UX.
- **Export button disabled when no proxies** – instead of creating an empty file, the button is inactive when the proxy list is empty.

### Fixes
- **Loss of test buttons in popup when enabling "Enable direct IP detection"** – fixed by correctly reading general options with fallback to current values.
- **HTML tags in floating log window** – fixed rendering so that IP steps show formatted text (colors and icons) correctly.
- **Overlapping messages in floating log** – fixed display: text now wraps properly without overlapping, thanks to corrected CSS.
- **Empty file on proxy export** – export button is now disabled when the list is empty.
- **Version display in footer** – version number is now dynamically inserted via localization, ensuring correct display.
- **Visual separation of manual and subscription proxies in popup** – subscription proxies are now grouped by subscription name (as in settings) with indentation; manual proxies are ungrouped.
- **False error message when starting express‑cycle test in Firefox** – fixed by switching to a unified callback with success check, ensuring cross‑browser stability.
- **Profile and proxy switching in cycle tests** – fixed order of settings updates to guarantee the browser applies the new proxy before the test.
- **`ip-only` status no longer triggers protocol auto‑change** – protocol detection is only attempted on explicit `fail`, not on `ip-only`.
- **Indirect success after protocol detection** – if IP was obtained and the retest fails, the final status becomes `indirect`, not `fail`.
- **Retest after protocol detection now uses proxy with updated protocol** – previously, retest used the old protocol, causing wrong logs and tests. Now the retest uses the proxy object with the new protocol.
- **Duplicate statuses in logs after protocol auto‑detection eliminated** – for precise/quick tests, only one final status is sent (with the correct protocol).
- **Test launch blocking after standard tests fixed** – `try-finally` blocks ensure `_isRunning` is reset even on errors; no more manual reload required.
- **Anti‑duplicate in log now compares displayed HTML, not message hash** – correctly removes exact consecutive duplicates regardless of source.

---

## 📦 Installation

### From the store (recommended)
- **Firefox Add-ons:** go to the store, find "ProxyMust", and click "Install".
- **Chrome Web Store:** same.
- **Edge, Opera:** through their respective extension stores.

### Manually (for developers)
1. Download the latest release from [GitHub Releases](https://github.com/nana-xakep/ProxyMust/releases).
2. Extract the archive to a separate folder.
3. **Chrome/Edge/Opera:** open `chrome://extensions`, enable "Developer mode", click "Load unpacked", and select the extension folder.
4. **Firefox:** open `about:debugging`, click "Load Temporary Add-on", and select any file in the extension folder.

---

## 🎛 Operation modes (profiles)

In the popup (toolbar icon), you can switch between modes:

- **Direct (No Proxy)** – all requests go directly, no proxy is used.
- **Selective Proxy** – proxy is enabled only for sites that match rules (blacklist).
- **Always Enabled** – proxy works for all sites except those added to exclusions (whitelist).
- **System Proxy** – the decision to use a proxy is delegated to the operating system (system settings).

You can also create **custom profiles** with unique rule sets and proxy bindings.

---

## 🖥 Managing Proxy Servers

On the settings page (tab "Proxy Servers"), you can manage your proxy list.

### Manual addition
1. Click "Add Server".
2. Specify:
   - **Name** (for convenience)
   - **Address** (IP or domain)
   - **Port**
   - **Protocol** (HTTP, HTTPS, SOCKS4, SOCKS5)
   - If necessary — **login and password** (not supported for SOCKS in Chrome).
3. Click "Save".

### Import list
- Click "Import Proxies".
- Paste text with a proxy list or upload a file.
- Supported formats: `host:port`, `host:port [protocol]`, `protocol://user:pass@host:port`.
- The extension automatically detects protocols and removes duplicates.

### Export
- Click "Export Proxies" – the entire list will be saved.
- Or select several proxies in the table, right-click → "Export selected" (context menu).

---

## 🧪 Testing Proxies

Check if a proxy works for the site you need. Select a site from the dropdown (or add your own) and click "Test". Four test types are available:

- **Cycle test** (works in all browsers) – sequentially switches the active profile and each proxy in the list, checking site loading. Most reliable but slower.
- **Express cycle test** (all browsers) – faster version, suitable for preliminary evaluation.
- **Precise (slower) test** (does not work in Firefox) – thorough check, gives accurate results.
- **Express test** (does not work in Firefox) – quick check.

> **🛡️ Privacy management:** In settings, you can enable or disable the checkbox **"Enable direct IP detection"** (disabled by default).  
> When **disabled**, your real IP is *never* sent to external IP services – the extension relies only on site load checks and compares the proxy host (if it's an IP) with the IP obtained through the proxy.  
> When **enabled**, your IP is sent to IP services for more accurate results (status ❔ is excluded).

> **⚡ Performance and privacy:** ProxyMust now performs all tests **without opening browser tabs**. All checks (main page load and IP service requests) are done via `fetch` requests. This means no history entries, no unwanted downloads, and faster testing.

Tests can be run for:
- all proxies in the table,
- only selected (via context menu),
- the current site directly from the popup (button "Test").

**About timeouts:** The test timer is automatically extended on every progress update, so long tests (e.g., hundreds of proxies) will not be interrupted prematurely.

### 📋 Viewing the test log

During any test run, you can open the **log window** (button "📋 Log" in the popup or in the test block on the settings page). The log shows:

- Time of each event.
- The proxy being tested (with country flag and protocol).
- IP address obtained through the proxy.
- Availability of the test site.
- Final status (✅ success, ☑️ indirect success, ❔ IP only, ⛔ fail).
- Transitions to the next proxy.
- Stop and completion messages.

The log updates in real-time and is buffered, so you won't miss any event. In the separate window, there is a **"Pin"** button, which attempts to keep the window on top (focus on new messages) – this eases monitoring but is not a true "always on top" due to browser limitations.

---

## 📊 Rating and Proxy Statuses

Each proxy gets a **numeric rating**, which automatically changes based on test results: `+1` for success, `–1` for failure. You can also manually change the rating via the context menu (right-click).

Next to each proxy, a **status** is shown for the selected site:

- ✅ – definitely works (fresh success)
- ☑️ – likely works (data stale or success obtained for another site)
- ❔ – IP obtained but page did not load (appears only when **direct IP detection is disabled** and the obtained IP differs from the proxy host)
- ❓ – no data
- ⛔ – does not work (fresh failure)

In settings, you can set **stale time** (default 6 hours). After this period, the status becomes indirect (☑️).

Sorting in the popup and the settings table takes into account **priority** (📌 pinned, ⭐ favorites) and rating.

Status ❔ **does not affect** the proxy rating, since it's unclear whether the proxy actually works (IP obtained but site didn't load).

---

## 📝 Rules (Filters)

Rules determine which sites should have proxy enabled or disabled. They are configured in profiles (tab "Selective Profiles").

### Rule types
- **Domain and subdomains** – e.g., `google.com` will match `mail.google.com`.
- **Host / URL pattern** – e.g., `*.google.com`.
- **Regular expression** (for host or full URL).
- **Exact URL** – exact match.
- **IP range (CIDR)** – e.g., `192.168.1.0/24`.

### Adding rules
- From the popup: click on a domain in the "Proxyable Resources" list.
- Manually: on the settings page in the desired profile, click "Add Rule".
- Import: from GFWList or SwitchyOmega files.

**Priority:** whitelist rules always have higher priority and disable proxy for specified sites.

---

## 🖱 Context Menu

In the proxy table (on the settings page), right-click on a proxy row. A menu appears where you can:

- Change rating (+1, –1, reset)
- Set priority: 📌 pin or ⭐ add to favorites
- Export selected proxies
- Copy addresses of selected proxies
- Delete selected proxies
- Clear statuses for selected or all proxies
- Run tests for selected proxies (with site selection)
- Move selected proxies up/down (in the table)

In the popup (toolbar), right-clicking on the active proxy allows you to:

- Change rating
- Set priority
- Add a subscription proxy to the manual list (if clicked on a subscription proxy).

---

## 📤 Import / Export

Besides basic proxy list import/export, the following improvements are implemented:

- **Automatic mode switching:** when you type text into the input field, "Text proxy list" mode is activated; when you select a file, "File proxy list" mode is activated.
- **Export selected:** in the table context menu, you can export only selected servers.

---

## 📋 Subscriptions to Proxy and Rule Lists

### Proxy list subscriptions
- Tab "Proxy Server Subscriptions" → "Subscribe to a list".
- Specify the list URL (formats: PlainText, JSON, CSV).
- The extension will automatically refresh the list on a schedule (set in minutes).
- Proxies from subscriptions appear in the main list with a source label.

### Rule list subscriptions
- Inside a profile → "Rules Subscriptions" → "Subscribe to a rules list".
- Supports AutoProxy/GFWList and SwitchyOmega formats.
- Rules are automatically added to the profile.

---

## 🔄 Synchronization and Backup

### Synchronization
- Enable synchronization in general settings.
- Choose source: **browser sync** or **WebDAV server**.
- For WebDAV, specify URL, filename, login, and password.
- Settings are automatically synchronized when changed.

### Backup
- Tab "Backup/Restore".
- Click "Create full backup" – a file with all settings, rules, and proxies will be downloaded.
- To restore, select "Restore from backup" and upload the file.

---

## 🎨 Themes

- In general settings, choose **light**, **dark**, or **auto** theme (follows browser theme).
- You can specify a **custom theme** – paste a CSS file URL (must be HTTPS).
- Supports themes from [bootswatch.com](https://bootswatch.com).

---

## ⌨️ Keyboard Shortcuts

You can configure keyboard shortcuts in the browser (extension management → keyboard shortcuts). Available commands:

- **Next / previous proxy** (cyclic switching)
- **Profile switching:** "No Proxy", "Selective", "Always Enabled", "System"

Default: `Ctrl+Shift+1` – Direct, `Ctrl+Shift+2` – Selective, `Ctrl+Shift+3` – Always, `Ctrl+Shift+4` – System.

---

## ⚠️ Troubleshooting

### Extension doesn't work in incognito mode
In browser settings (extension management), allow the extension to work in incognito mode.

### Precise and Express tests don't work in Firefox
This is due to browser API limitations. Use cycle tests – they work in all browsers.

### Proxy doesn't connect
- Check the address and port.
- Ensure the proxy server is running and accessible.
- If authentication is used, check login/password (Chrome does not support authentication for SOCKS).
- Run a test to check availability.

### Statuses and ratings not displayed
Enable the "Enable rating for proxies" option on the "Proxy Servers" tab, or press F5 to refresh the page.

### Can't import proxy list
Make sure the list matches supported formats. Use automatic mode switching (text/file).

### WebDAV sync error
- Check the URL and credentials.
- Ensure the file is writable.
- Try manual backup with the "Backup Now" button.

### Where to see error logs?
Open the developer console (`F12`) on the settings page or in the popup. Enable diagnostics (button "diag?" at the bottom of the settings page) for detailed logging.

---

## 📄 License

ProxyMust is distributed under the **GNU General Public License v3.0**. The original SmartProxy (c) Salar Khalilzadeh, we express our deep gratitude for his tremendous work and inspiration. The full license text is available in the `LICENSE` file.

- [GitHub repository](https://github.com/nana-xakep/ProxyMust)
- [Report an issue or suggest an idea](https://github.com/nana-xakep/ProxyMust/issues)
- [Original SmartProxy](https://github.com/salarcode/SmartProxy)

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)  
License [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Version 1.0.4 (based on SmartProxy 2.1).  

Documentation version: 1.0.4 (2026-07-07)