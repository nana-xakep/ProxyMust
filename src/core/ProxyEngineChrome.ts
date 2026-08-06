/*
 * Original SmartProxy copyright:
 * This file is part of SmartProxy <https://github.com/salarcode/SmartProxy>,
 * Copyright (C) 2023 Salar Khalilzadeh <salar2k@gmail.com>
 *
 * SmartProxy is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * SmartProxy is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartProxy.  If not, see <http://www.gnu.org/licenses/>.
 */
/*
 * Modifications for ProxyMust:
 * Copyright (C) 2026 nana-xakep <xakep.nana@gmail.com>
 * - Added rating system, proxy testing, country flags, etc.
 */
import { ProxyServer, CompiledProxyRule, SmartProfileType, CompiledProxyRuleType } from "./definitions";
import { api } from "../lib/environment";
import { Debug, DiagDebug } from "../lib/Debug";
import { Settings } from "./Settings";
import { SettingsOperation } from './SettingsOperation';
import { ProxyEngine } from './ProxyEngine';

export class ProxyEngineChrome {
	
	    private static buildDynamicProxyMapForPAC(): { [site: string]: string } {
        const map: { [site: string]: string } = {};
        const overrides = ProxyEngine.getAllDynamicProxies();
//console.log(`[ProxyEngineChrome] buildDynamicProxyMapForPAC: overrides =`, JSON.stringify(overrides))
        for (const site in overrides) {
            const proxyId = overrides[site];
            const proxy = SettingsOperation.findProxyServerById(proxyId);
            if (proxy) {
                const proxyString = ProxyEngineChrome.convertActiveProxyServer(proxy);
//console.log(`[ProxyEngineChrome] site=${site}, proxyId=${proxyId}, proxyString=${proxyString}`)
                if (proxyString !== "DIRECT") {
                    map[site] = proxyString;
                }
            }
        }
//console.log(`[ProxyEngineChrome] buildDynamicProxyMapForPAC: map =`, JSON.stringify(map))
        return map;
    }

	/**  Chrome only. Updating Chrome proxy config. */
	public static updateChromeProxyConfig() {
		let settingsActive = Settings.active;

		if (settingsActive.activeProfile.profileType == SmartProfileType.SystemProxy) {

			let config = {
				mode: "system"
			};
			api.proxy.settings.set(
				{ value: config, scope: "regular" },
				function () {
					if (api.runtime.lastError) {
						Debug.error("updateChromeProxyConfig failed with ", api.runtime.lastError);
					}
				});
			return;
		}
		else if (settingsActive.activeProfile.profileType == SmartProfileType.Direct) {
			let config = {
				mode: "direct"
			};
			api.proxy.settings.set(
				{ value: config, scope: "regular" },
				function () {
					if (api.runtime.lastError) {
						Debug.error("updateChromeProxyConfig failed with ", api.runtime.lastError);
					}
				});
			return;
		}
		// generate PAC script specific to Chrome
//console.log(`[ProxyEngineChrome] updateChromeProxyConfig: generating PAC script`)
//		const dynamicMap = ProxyEngineChrome.buildDynamicProxyMapForPAC();
//console.log(`[ProxyEngineChrome] dynamicProxyMap для PAC:`, dynamicMap)
		let pacScript = this.generateChromePacScript();
//console.log(`[ProxyEngineChrome] PAC script length: ${pacScript.length}`)

		let config = {
			mode: "pac_script",
			pacScript: {
				data: pacScript
			}
		};
		api.proxy.settings.set(
			{ value: config, scope: "regular" },
			function () {
				if (api.runtime.lastError) {
					Debug.error("updateChromeProxyConfig failed with ", api.runtime.lastError);
				} else {
//console.log(`[ProxyEngineChrome] PAC script applied successfully`)
				}
			});
	}

	private static generateChromePacScript(): string {
		//let settings = Settings.current;
		let settingsActive = Settings.active;

		let profileType = settingsActive.activeProfile.profileType;
		let resultCurrentProxyServer = this.convertActiveProxyServer(settingsActive.currentProxyServer);

		let compiledRules = settingsActive.activeProfile.compiledRules;
		let compiledRules_WhitelistRules = this.regexHostArrayToString(compiledRules.WhitelistRules).join(",");
		let compiledRules_Rules = this.regexHostArrayToString(compiledRules.Rules).join(",");
		let compiledRules_WhitelistSubscriptionRules = this.regexHostArrayToString(compiledRules.WhitelistSubscriptionRules).join(",");
		let compiledRules_SubscriptionRules = this.regexHostArrayToString(compiledRules.SubscriptionRules).join(",");

		let pacTemplateString = `
const compiledRules = {
	/** User defined whitelist rules. P2 */
	WhitelistRules: [${compiledRules_WhitelistRules}],
	/** User defined rules. P1 */
	Rules: [${compiledRules_Rules}],
	/** Subscription whitelist rules. P3  */
	WhitelistSubscriptionRules: [${compiledRules_WhitelistSubscriptionRules}],
	/** Subscription rules. P4 */
	SubscriptionRules: [${compiledRules_SubscriptionRules}]
};
const dynamicProxyMap = ${JSON.stringify(ProxyEngineChrome.buildDynamicProxyMapForPAC())};
const SmartProfileType = {
	Direct: ${SmartProfileType.Direct},
	SystemProxy: ${SmartProfileType.SystemProxy},
	SmartRules: ${SmartProfileType.SmartRules},
	AlwaysEnabledBypassRules: ${SmartProfileType.AlwaysEnabledBypassRules},
	IgnoreFailureRules: ${SmartProfileType.IgnoreFailureRules},
}
const CompiledProxyRuleType = {
	RegexHost: ${CompiledProxyRuleType.RegexHost},
	RegexUrl: ${CompiledProxyRuleType.RegexUrl},
	Exact: ${CompiledProxyRuleType.Exact},
	SearchUrl: ${CompiledProxyRuleType.SearchUrl},
	SearchDomain: ${CompiledProxyRuleType.SearchDomain},
	SearchDomainSubdomain: ${CompiledProxyRuleType.SearchDomainSubdomain},
	SearchDomainAndPath: ${CompiledProxyRuleType.SearchDomainAndPath},
	SearchDomainSubdomainAndPath: ${CompiledProxyRuleType.SearchDomainSubdomainAndPath}
}
const activeProfileType = +'${profileType}';
const currentProxyServer = "${resultCurrentProxyServer}";
const resultDirect = "DIRECT";
const resultSystem = "SYSTEM";
const verboseDiagnostics = ${(DiagDebug?.enabled == true)}; // set to true for verbose logs using chrome flag. https://support.google.com/chrome/a/answer/6271171?hl=en#zippy=%2Cview-network-data%2Cget-network-logs
// -------------------------
// required PAC function that will be called to determine
// if a proxy should be used.
function FindProxyForURL(url, host, noDiagnostics) {
	if (verboseDiagnostics && !noDiagnostics) {
		let finalResult = FindProxyForURL(url, host, true);
		alert('SmartProxy-FindProxyForURL-Result=' + finalResult + '; host=' + host + '; url=' + url + '; activeProfile=' + activeProfileType);
		return finalResult;
	}

	if (activeProfileType == SmartProfileType.SystemProxy)
		return resultSystem;

	if (activeProfileType == SmartProfileType.Direct || !host)
		return resultDirect;

	host = host.toLowerCase();
	
    // Check dynamic proxy override
    if (dynamicProxyMap[host]) {
        return dynamicProxyMap[host];
    }	

	// applying ProxyPerOrigin
	// is not applicable for Chromium

	// correcting 'host' because it doesn't include port number
	const hostAndPort = extractHostFromUrl(url)?.toLowerCase() || host;

	if (activeProfileType == SmartProfileType.AlwaysEnabledBypassRules) {

		// user skip the bypass rules/ don't apply proxy
		let userMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.Rules);
		if (userMatchedRule) {
			return makeResultForAlwaysEnabledForced(userMatchedRule)
		}

		// user bypass rules/ apply proxy by force
		let userWhitelistMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.WhitelistRules)
		if (userWhitelistMatchedRule) {
			return resultDirect;
		}

		// subscription skip bypass rules/ don't apply proxy
		let subMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.SubscriptionRules);
		if (subMatchedRule) {
			return makeResultForAlwaysEnabledForced(userMatchedRule)
		}

		// subscription bypass rules/ apply proxy by force
		let subWhitelistMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.WhitelistSubscriptionRules)
		if (subWhitelistMatchedRule) {
			return resultDirect;
		}

		//** Always Enabled is forced by a rule, so other rules can't skip it */
		function makeResultForAlwaysEnabledForced(matchedRule) {

			if (matchedRule.proxy)
				// this rule has its own proxy setup
				return matchedRule.proxy;
			return currentProxyServer;
		}

		// no rule is matched, going with proxy
		return currentProxyServer;
	}

	if (activeProfileType == SmartProfileType.SmartRules) {

		// user whitelist rules/ don't apply proxy
		let userWhitelistMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.WhitelistRules)
		if (userWhitelistMatchedRule) {
			return makeResultForWhitelistRule(userWhitelistMatchedRule);
		}

		// user rules/ apply proxy
		let userMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.Rules);
		if (userMatchedRule) {
			return makeResultForMatchedRule(userMatchedRule);
		}

		// subscription whitelist rules/ don't apply proxy
		let subWhitelistMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.WhitelistSubscriptionRules)
		if (subWhitelistMatchedRule) {
			return makeResultForWhitelistRule(subWhitelistMatchedRule);
		}

		// subscription rules/ apply proxy
		let subMatchedRule = findMatchedUrlInRules(url, host, hostAndPort, compiledRules.SubscriptionRules);
		if (subMatchedRule) {
			return makeResultForMatchedRule(subMatchedRule);
		}

		/**
		 * Generate result for matched whitelist rule
		 */
		const makeResultForWhitelistRule = () => {
			return resultDirect;
		}

		/**
		 * Generate result for matched proxy rule
		 */
		function makeResultForMatchedRule(matchedRule) {
			if (matchedRule.proxy)
				// this rule has its own proxy setup
				return matchedRule.proxy;
			return currentProxyServer;
		}
	}

	if (activeProfileType == SmartProfileType.IgnoreFailureRules) {
		// NOTE: this is not a proxy profile, it is used elsewhere
		// No logic is needed here
	}

	// let the browser decide
	return "";
}

function findMatchedUrlInRules(searchUrl, host, hostAndPort, rules) {
	if (searchUrl == null || rules == null || rules.length == 0)
		return null;

	let schemaLessUrlLowerCase = null;
	let lowerCaseUrl = searchUrl.toLowerCase();

	try {
		for (let rule of rules) {

			switch (rule.compiledRuleType) {
				case CompiledProxyRuleType.SearchDomainSubdomain:

					// domain
					if (host == rule.search)
						return rule;

					// subdomains
					if (host.endsWith('.' + rule.search))
						return rule;

					break;

				case CompiledProxyRuleType.SearchDomainSubdomainAndPath:
					{
						schemaLessUrlLowerCase ??= removeSchemaFromUrl(lowerCaseUrl);
						if (schemaLessUrlLowerCase == null)
							continue;

						if (schemaLessUrlLowerCase.startsWith(rule.search))
							return rule;

						rule.searchHost ??= extractHostFromInvalidUrl(rule.search);
						if (rule.searchHost != null) {

							// should be the same
							if (rule.searchHost != host && !host.endsWith('.' + rule.searchHost))
								continue;

							// after this state, we are sure that the url is for the same domain, now just checking the path
						}

						// subdomains
						if (schemaLessUrlLowerCase.includes('.' + rule.search))
							return rule;
						break;
					}

				case CompiledProxyRuleType.SearchDomainAndPath:

					schemaLessUrlLowerCase ??= removeSchemaFromUrl(lowerCaseUrl);
					if (schemaLessUrlLowerCase == null)
						continue;

					if (schemaLessUrlLowerCase.startsWith(rule.search))
						return rule;

					break;

				case CompiledProxyRuleType.SearchUrl:

					if (lowerCaseUrl.startsWith(rule.search))
						return rule;
					break;

				case CompiledProxyRuleType.RegexUrl:
					// Using original url with case sensitivity
					if (rule.regex.test(searchUrl))
						return rule;
					break;

				case CompiledProxyRuleType.RegexHost:
					
					if (rule.regex.test(host))
						return rule;
					break;

				case CompiledProxyRuleType.SearchDomain:

					if (rule.search == host)
						return rule;
					break;

				case CompiledProxyRuleType.Exact:

					if (lowerCaseUrl == rule.search)
						return rule;
					break;
			}
		}

		// reaching this point nothing is matched
		// if host has custom port number we need to check again
		if (host != hostAndPort) {
			host = hostAndPort;
			
			for (let rule of rules) {

				// NOTE: Only rules that work on hostName should be checked, others can be ignored
				switch (rule.compiledRuleType) {

					case CompiledProxyRuleType.SearchDomainSubdomain:

						// domain
						if (host == rule.search)
							return rule;

						// subdomains
						if (host.endsWith('.' + rule.search))
							return rule;

						break;

					case CompiledProxyRuleType.SearchDomainSubdomainAndPath:
						{
							schemaLessUrlLowerCase ??= removeSchemaFromUrl(lowerCaseUrl);
							if (schemaLessUrlLowerCase == null) {
								continue;
							}
							if (schemaLessUrlLowerCase.startsWith(rule.search))
								return rule;

							rule.searchHost ??= extractHostFromInvalidUrl(rule.search);
							if (rule.searchHost != null) {

								// should be the same
								if (rule.searchHost != host && !host.endsWith('.' + rule.searchHost))
									continue;

								// after this state, we are sure that the url is for the same domain, now just checking the path
							}

							// subdomains
							if (schemaLessUrlLowerCase.includes('.' + rule.search))
								return rule;
							break;
						}

					case CompiledProxyRuleType.RegexHost:

						if (rule.regex.test(host))
							return rule;
						break;

					case CompiledProxyRuleType.SearchDomain:

						if (rule.search == host)
							return rule;
						break;

					case CompiledProxyRuleType.Exact:
					case CompiledProxyRuleType.RegexUrl:
					case CompiledProxyRuleType.SearchUrl:
					case CompiledProxyRuleType.SearchDomainAndPath:
						break;
				}
			}
		}

	} catch (e) {
		console.warn('SmartProxy> findMatchForUrl failed for ' + lowerCaseUrl, e);
	}
	return null;
}

function removeSchemaFromUrl(url) {
	if (url == null)
		return url;
	const schemaSep = '://';
	let index = url.indexOf(schemaSep);
	if (index > -1)
		return url.substring(index + schemaSep.length, url.length);
	else
		return url;
}
function extractHostFromInvalidUrl(url) {
	try {
		if (!url.includes(":/"))
			url = 'http://' + url;

		return extractHostFromUrl(url);
	}
	catch (e) { return null; }
}
function extractHostFromUrl(url) {
	// Unescaped RegEx (/^(?:\w)*\:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
	const extractPattern = (/^(?:\\w)*\\:\\/\\/([^\\/?#]+)(?:[\\/?#]|$)/i);

	const match = extractPattern.exec(url);
	if (!match) {
		return null;
	}
	const [, host] = match;
	return host;
}`;
		return pacTemplateString;
	};

	private static convertActiveProxyServer(proxyServer: ProxyServer): string {
		const resultDirect = "DIRECT";

		// invalid active proxy server
		if (!proxyServer || !proxyServer.host || !proxyServer.protocol || !proxyServer.port)
			return resultDirect;

		switch (proxyServer.protocol) {
			case "HTTP":
				return `PROXY ${proxyServer.host}:${proxyServer.port}`;

			case "HTTPS":
				return `HTTPS ${proxyServer.host}:${proxyServer.port}`;

			case "SOCKS4":
				return `SOCKS4 ${proxyServer.host}:${proxyServer.port}`;

			case "SOCKS5":
				return `SOCKS5 ${proxyServer.host}:${proxyServer.port}`;
		}

		// invalid proxy protocol
		return resultDirect;
	}

	private static regexHostArrayToString(compiledRules: CompiledProxyRule[]) {
		let compiledRulesAsStringArray = [];
		for (let index = 0; index < compiledRules.length; index++) {
			let rule = compiledRules[index];

			let search: string;
			if (rule.search) {
				search = `unescape('${escape(rule.search)}')`;
			}
			else
				search = 'null';

			if (rule.proxy) {
				compiledRulesAsStringArray.push(`{search:${search},regex:${rule.regex?.toString() || 'null'},compiledRuleType:${rule.compiledRuleType},proxy:"${this.convertActiveProxyServer(rule.proxy)}"}`);
			} else {
				compiledRulesAsStringArray.push(`{search:${search},regex:${rule.regex?.toString() || 'null'},compiledRuleType:${rule.compiledRuleType}}`);
			}
		}
		return compiledRulesAsStringArray;
	}
}