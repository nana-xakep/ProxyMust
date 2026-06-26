# ProxyMust

**Advanced selective proxy manager**  
Version: 1.0.3 (based on SmartProxy 2.1)  
Fork maintainer: nana-xakep  
Source code: [github.com/nana-xakep/ProxyMust](https://github.com/nana-xakep/ProxyMust)

---

## 📖 Introduction

**ProxyMust** is a fork of [SmartProxy](https://github.com/salarcode/SmartProxy), created for more flexible and convenient proxy server management. The extension automatically enables or disables proxy for websites based on configured rules, allows you to test proxy availability, assign ratings, and sort by priority.

ProxyMust works in **Chrome, Firefox, Edge, Opera, and Firefox for Android**, and is fully translated into **21 languages**.

> **⚠️ Important:** This extension **does not provide** its own proxy servers. You must add them yourself. It also **does not collect or transmit** any user data.

---

## 🆕 What's New in Version 1.0.3

- **Built-in test log viewer** – proxy test progress is now displayed in real-time both on the settings page and in a separate popup window. The log shows every step: start of check, IP retrieval, site availability, final status, and transition to the next proxy.
- **Country flags in logs** – a country flag is displayed next to the proxy address (based on IP address).
- **Full log localization** – all messages, labels, and statuses are translated into all supported languages.
- **Instant stop feedback** – clicking the "Stop" button immediately displays a message in the log, informing you that cancellation has started.
- **"Pin" button in the log window** – attempts to keep the window on top of others: the window automatically focuses when new messages appear (but does not guarantee persistent "always on top" due to browser limitations). The pinned state is preserved for the window session.
- **Fixed duplicate stop messages** – now only one stop message is sent when "Stop" is clicked.
- **Log now updates in real-time** – even when the viewer is hidden; all missed messages are displayed instantly when opened.

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
License [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html). Version 1.0.3 (based on SmartProxy 2.1).  

Documentation version: 1.0.3 (2026-06-26)