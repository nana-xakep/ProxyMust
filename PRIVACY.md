# Privacy Policy for ProxyMust

**Last updated:** June 2026

ProxyMust is a fork of SmartProxy, developed and maintained by [nana-xakep](https://github.com/nana-xakep). We are committed to protecting your privacy. This policy explains what data our extension may collect, why, and how you can control it.

## Data we collect

ProxyMust **does not** collect, store, or sell any personal data.  
The extension does not use tracking, analytics, or advertising.

## Transmission of data (IP address)

When you use the **proxy testing** feature, the extension may send your current IP address to public IP‑detection services. This happens only when:

- You run a **precise**, **express**, **cycle**, or **express cycle** test.
- The purpose is to verify whether the tested proxy server is actually being used (by comparing your visible IP with the proxy's IP) and to determine if the proxy is working correctly.

## Third‑party IP services

The following public services are used solely for proxy verification:

- `http://api.ipify.org`
- `http://ip-api.com`
- `http://ifconfig.me`
- `http://checkip.amazonaws.com`
- `http://ipv4.icanhazip.com`
- `http://ipinfo.io`
- `http://ident.me`
- `http://myexternalip.com`
- `http://ipecho.net`
- `https://whatismyip.akamai.com`
- `http://wtfismyip.com`
- `http://ip.me`
- `http://2ip.io`

These services are contacted only during active testing and **only in the background**; no data is stored or logged by ProxyMust.  
The requests are made directly from your browser and are not relayed through any intermediate servers.

## User control

You can disable the transmission of your IP address at any time:

1. Open **Settings** → **Proxy Servers** tab.
2. Uncheck the **“Enable advanced testing”** option (if available in your version).

When disabled, the extension will rely solely on website‑loading checks, which do not send your IP to external services.  
However, in this mode, test statuses will be less accurate (only ✅ or ⛔, without the ☑️ indirect indicator).

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