# ProxyMust

**Advanced selective proxy manager**  
Version: 1.0.5 (based on SmartProxy 2.2.1)  
Fork maintainer: nana-xakep  
Source code: [github.com/nana-xakep/ProxyMust](https://github.com/nana-xakep/ProxyMust)

---

## 📖 Introduction

**ProxyMust** is a fork of [SmartProxy](https://github.com/salarcode/SmartProxy), created for more flexible and convenient management of proxy servers. The extension automatically enables or disables a proxy for websites based on configured rules, allows testing proxy availability, assigns ratings, and sorts by priority.

ProxyMust works in **Chrome, Firefox, Edge, Opera, and Firefox for Android** and is fully translated into **21 languages**.

> **⚠️ Important:** This extension **does not provide** its own proxy servers. You must add them yourself. It also **does not collect or transmit** any user data.

---

## 🆕 What's new in version 1.0.5

- **Codebase updated to SmartProxy 2.2.1** – all improvements and fixes from upstream integrated.
- **Rule management directly from the popup** – now you can delete, enable/disable a rule, and also enable **"Proxy per tab"** mode (Firefox only) without going to settings.
- **"Proxy per tab" mode for individual rules** – if a rule matches one request, enabling this mode will proxy the whole tab through the same proxy (available only in Firefox).
- **Display and editing of the "Proxy per tab" mode in rule settings** – added a checkbox in the rule edit modal.
- **Automatic import mode switching for rules** – now when you paste text, the "Text" mode activates; when you select a file, the "File" mode activates.
- **Automatic reload of settings page** after rule changes from the popup – no need to manually press F5.
- **Localised tooltips for new popup buttons**.
- **Fixed import of rules from SwitchyOmega** – CIDR/IP rules are now correctly handled.
- **Chromium fix** – exception rules (whitelist) from subscriptions now correctly apply proxies in Chrome/Edge.
- **Fixed restoration of rule-to-proxy relationships** when importing a backup.
- **Fixed deletion and enabling/disabling rules from the popup** – all buttons now work correctly.

All previous features (proxy testing, rating, auto‑protocol detection, statuses, context menu, test log, etc.) are retained and improved.

For a detailed list of changes, see [CHANGELOG.md](CHANGELOG.md).

---

## 📦 Installation

### From the store (recommended)
- **Firefox Add-ons:** go to the store, search for "ProxyMust", and click "Install".
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
- **Selective proxy** – proxy is enabled only for sites that match the rules (blacklist).
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
- Supported formats: `host:port`, `host:port [protocol]`, `protocol://user:pass@host:port`.
- The extension automatically detects protocols and removes duplicates.

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
Make sure the list conforms to supported formats. Use the automatic mode switching (text/file).

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
License [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Version 1.0.5 (based on SmartProxy 2.2.1).

Documentation version: 1.0.5 (2026-07-12)