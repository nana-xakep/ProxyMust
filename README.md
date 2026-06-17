# ProxyMust – extended selective proxy manager

**ProxyMust** is a fork of [SmartProxy](https://github.com/salarcode/SmartProxy) by Salar Khalilzadeh. We express deep gratitude to Salar for his tremendous work and inspiration. The original extension became the foundation for ProxyMust, and all added features develop the idea of convenient and flexible proxy management.

ProxyMust automatically enables/disables proxy for sites you visit based on customizable rules, allows testing proxy servers, sorting by rating, and setting priorities. Works in all modern browsers (Chrome, Firefox, Edge, Opera, Firefox for Android) and is fully translated into **24 languages**.

## Quick features
- Selective proxy (rules‑based)
- Proxy rating and statuses (✅ ☑️ ❓ ⛔)
- Testing: cycle test, express cycle test, precise test, express test
- Import/export, subscriptions, country flags, context menu
- Sync via browser or WebDAV, backup/restore
- 24 languages, light/dark/auto themes

## Installation

### From source
1. `git clone https://github.com/nana-xakep/ProxyMust.git`
2. `npm install`
3. `npm run build`
4. Load unpacked extension in your browser:
   - **Firefox**: `about:debugging` → "Load Temporary Add‑on" → select any file in `dist/firefox`
   - **Chrome**: `chrome://extensions` → Developer mode → "Load unpacked" → select `dist/chrome`

### Pre‑built releases
Download from [releases page](https://github.com/nana-xakep/ProxyMust/releases).

## Documentation
Full description, all features and usage instructions are available in the [repository](https://github.com/nana-xakep/ProxyMust).

## License
GNU General Public License v3.0.  
Original SmartProxy (c) Salar Khalilzadeh, used with permission.

---

**ProxyMust** – maintained by [nana-xakep](https://github.com/nana-xakep)