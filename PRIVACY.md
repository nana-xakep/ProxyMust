# Privacy Policy for ProxyMust

**Last updated:** June 2026

ProxyMust is a fork of SmartProxy, developed and maintained by [nana-xakep](https://github.com/nana-xakep). We are committed to protecting your privacy. This policy explains what data our extension may collect, why, and how you can control it.

## Data we collect

ProxyMust **does not** collect, store, or sell any personal data.  
The extension does not use tracking, analytics, or advertising.

## Transmission of data (IP address)

When you use the **proxy testing** feature, the extension may send your current IP address to public IP‑detection services. This occurs **only if** you have enabled the **"Enable direct IP detection"** option in the settings and you run a **precise**, **express**, **cycle**, or **express cycle** test.

The purpose is to verify whether the tested proxy server is actually being used (by comparing your visible IP with the proxy's IP) and to determine if the proxy is working correctly.

If the option is **disabled**, your real IP is **never** sent to any external IP service. In that case, the extension relies solely on website‑loading checks and, when needed, compares the proxy's own host IP (if it is an IP address) with the IP obtained through the proxy, without having access to your real IP.

### How testing works

ProxyMust performs all tests **without opening visible or invisible browser tabs**:
- The main test page is loaded using `fetch` requests.
- IP detection services are queried using `fetch` requests.
- This means no tabs are created, no history entries are added, and no unwanted downloads occur.
- All requests are made directly from your browser and are not relayed through any intermediate servers.

## Third‑party IP services

The following public services are used solely for proxy verification:

- `http://api.ipify.org`
- `http://ifconfig.me`
- `http://checkip.amazonaws.com`
- `http://ipv4.icanhazip.com`
- `http://icanhazip.com`
- `http://ipecho.net/plain`
- `http://whatismyip.akamai.com`
- `http://l2.io/ip`
- `http://ip.tyk.nu`
- `http://ipinfo.io/ip`
- `http://ip.brightfur.net/`

These services are contacted only during active testing and **only in the background**; no data is stored or logged by ProxyMust.  
The requests are made directly from your browser and are not relayed through any intermediate servers.

## User control

You can control whether your real IP is sent to external IP services:

1. Open **Settings** → **Proxy Servers** tab.
2. Locate the **"Enable direct IP detection"** checkbox in the Proxy Test section.

### When the checkbox is **ON** (default: OFF):
- The extension will send your real IP to IP‑detection services to verify proxy connectivity.
- This allows for the most accurate results, **eliminating** the ❔ (unknown) status because there is a direct IP reference for comparison.
- Available statuses: ✅, ☑️, ⛔.

### When the checkbox is **OFF** (default):
- Your real IP is **never** sent to external IP services.
- The extension relies on website‑loading checks and, when possible, compares the proxy's own host IP with the IP obtained through the proxy.
- This mode is more private but may produce the ❔ (unknown) status in cases where the obtained IP differs from the proxy host and we cannot determine whether it is your real IP or the proxy's IP.
- Available statuses: ✅, ☑️, ❔, ⛔.

### Additional privacy features

- **No tabs are created** during testing – all checks are performed using `fetch` requests.
- **No browser history entries** are added for test requests.
- **No files are downloaded** automatically during testing.
- The **ip-only** status (❔) – indicating that an IP was obtained but the page did not load – **does not affect** the proxy rating, preserving the integrity of the rating system.

## No data storage or sharing

Even when the advanced testing is enabled, ProxyMust **does not**:

- Store your IP address or any other data.
- Share your IP address or any data with third parties beyond the technical request to the IP services listed above.
- Use the data for any purpose other than the immediate test.

## Changes to this policy

We may update this privacy policy from time to time. Any changes will be posted in this repository.

## Contact

If you have questions about this policy, please open an issue on [GitHub Issues](https://github.com/nana-xakep/ProxyMust/issues).

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)