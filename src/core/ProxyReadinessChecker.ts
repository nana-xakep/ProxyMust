// src/core/ProxyReadinessChecker.ts

/*
 * This file is part of ProxyMust – a fork of SmartProxy <https://github.com/salarcode/SmartProxy>.
 * Copyright (C) 2026 nana-xakep <xakep.nana@gmail.com>
 *
 * ProxyMust is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * ProxyMust is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with ProxyMust. If not, see <http://www.gnu.org/licenses/>.
 */

import { api } from "../lib/environment";
import { Settings } from "./Settings";
import { SettingsOperation } from "./SettingsOperation";
import { SmartProfileTypeBuiltinIds } from "./definitions";
import { Core } from "./Core";
import { IpServiceManager } from "./IpServiceManager";
import { CountryCode } from "../lib/CountryCode";

// English: Types for readiness check results
// Russian: Типы для результатов проверки готовности

export interface ReadinessCheckResult {
    name: string;
    passed: boolean;
    details?: any;
    duration: number;
    error?: string;
}

export interface ReadinessSummary {
    proxyId: string;
    timestamp: number;
    checks: ReadinessCheckResult[];
    overall: boolean;
    confidence: number;           // English: 0-1 / Russian: 0-1
    passedCount: number;
    totalCount: number;
    summary: string;
}

// English: Individual check function type
// Russian: Тип функции отдельной проверки
type ReadinessCheckFn = (proxyId: string) => Promise<{ passed: boolean; details?: any }>;

// English: Check configuration
// Russian: Конфигурация проверки
interface ReadinessCheckConfig {
    name: string;
    fn: ReadinessCheckFn;
    weight: number;               // English: 1-10 importance / Russian: 1-10 важность
    timeoutMs: number;            // English: Max time for this check / Russian: Макс. время для проверки
}

// ============================================================
// English: Individual check implementations
// Russian: Реализации отдельных проверок
// ============================================================

/**
 * English: Check 1: Proxy settings via proxy.settings.get
 * Russian: Проверка 1: Настройки прокси через proxy.settings.get
 * Note: In Firefox this may always return 'none' due to API limitations.
 */
async function checkProxySettings(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    try {
        const proxyAPI = api.proxy;
        if (!proxyAPI) {
            return { passed: false, details: { error: 'proxy API not available' } };
        }

        const config = await new Promise<any>((resolve) => {
            proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
        });

        if (!config || config.mode !== 'fixed_servers') {
            return {
                passed: false,
                details: {
                    mode: config?.mode || 'none',
                    expected: 'fixed_servers'
                }
            };
        }

        const singleProxy = config.rules?.singleProxy;
        if (!singleProxy) {
            return { passed: false, details: { error: 'no singleProxy in config' } };
        }

        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (!proxy) {
            return { passed: false, details: { error: `proxy ${proxyId} not found` } };
        }

        const isMatch =
            singleProxy.host === proxy.host &&
            singleProxy.port === proxy.port &&
            (singleProxy.scheme || '').toLowerCase() === proxy.protocol.toLowerCase();

        return {
            passed: isMatch,
            details: {
                configured: `${singleProxy.scheme}://${singleProxy.host}:${singleProxy.port}`,
                expected: `${proxy.protocol}://${proxy.host}:${proxy.port}`,
                match: isMatch
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

/**
 * English: Check 2: Active profile verification via Settings
 * Russian: Проверка 2: Проверка активного профиля через Settings
 */
async function checkActiveProfile(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    try {
        Settings.updateActiveSettings();
        const settings = Settings.current;
        const active = Settings.active;

        const profileOk = settings.activeProfileId === SmartProfileTypeBuiltinIds.AlwaysEnabled;
        const proxyOk = active.currentProxyServer?.id === proxyId;

        return {
            passed: profileOk && proxyOk,
            details: {
                activeProfileId: settings.activeProfileId,
                expectedProfile: SmartProfileTypeBuiltinIds.AlwaysEnabled,
                currentProxyId: active.currentProxyServer?.id || 'none',
                expectedProxyId: proxyId,
                profileMatch: profileOk,
                proxyMatch: proxyOk
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

/**
 * English: Check 3: DNS resolution via api.dns.resolve (Firefox only)
 * Russian: Проверка 3: DNS-резолвинг через api.dns.resolve (только Firefox)
 * May be unreliable, kept for informational purposes.
 */
async function checkDnsResolution(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    try {
        const dnsAPI = (api as any).dns;
        if (!dnsAPI || typeof dnsAPI.resolve !== 'function') {
            return {
                passed: false,
                details: { error: 'DNS API not available (not Firefox or no permission)' }
            };
        }

        const result = await new Promise<any>((resolve) => {
            try {
                dnsAPI.resolve('api.ipify.org', (res: any) => {
                    resolve(res);
                });
            } catch (err) {
                resolve({ status: 'error', error: String(err) });
            }
        });

        const passed = result && result.status === 'success' && result.addresses && result.addresses.length > 0;

        return {
            passed: passed,
            details: {
                status: result?.status || 'unknown',
                addresses: result?.addresses || [],
                count: result?.addresses?.length || 0
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

/**
 * English: Check 4: IP request via IpServiceManager (reliable, uses parallel requests)
 * Russian: Проверка 4: IP-запрос через IpServiceManager (надёжный, использует параллельные запросы)
 * This is the primary readiness indicator.
 * Это основной индикатор готовности.
 */
async function checkIpRequest(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    const start = Date.now();
    try {
        // English: Find the proxy object by ID
        // Russian: Находим объект прокси по ID
        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (!proxy) {
            return { passed: false, details: { error: `proxy ${proxyId} not found` } };
        }

        // English: Use IpServiceManager to fetch IP through this proxy
        // Russian: Используем IpServiceManager для получения IP через этот прокси
        // skipDirectIp = true means we don't compare with direct IP, just get the IP
        const ip = await IpServiceManager.fetchIpViaProxy(
            { host: proxy.host, port: proxy.port, protocol: proxy.protocol },
            true,  // retryForSticky
            true   // skipDirectIp - we only care about getting any IP
        );

        const duration = Date.now() - start;
        const passed = !!ip;

        return {
            passed: passed,
            details: {
                ip: ip || null,
                duration: duration,
                success: passed
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

/**
 * English: Check 5: WebRequest monitoring (informational)
 * Russian: Проверка 5: Мониторинг WebRequest (информационный)
 * Kept for future use, currently not reliable in diagnostic context.
 */
async function checkWebRequestTraffic(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    try {
        const webRequestAPI = (api as any).webRequest;
        if (!webRequestAPI || typeof webRequestAPI.onCompleted?.addListener !== 'function') {
            return {
                passed: false,
                details: { error: 'WebRequest API not available' }
            };
        }

        let detected = false;
        let requestUrl = '';

        const handler = (details: any) => {
            if (details.url && (
                details.url.includes('ipify.org') ||
                details.url.includes('icanhazip.com') ||
                details.url.includes('checkip.amazonaws.com')
            )) {
                detected = true;
                requestUrl = details.url;
                webRequestAPI.onCompleted.removeListener(handler);
            }
        };

        webRequestAPI.onCompleted.addListener(handler, {
            urls: ['*://*.ipify.org/*', '*://*.icanhazip.com/*', '*://*.checkip.amazonaws.com/*']
        });

        await new Promise(resolve => setTimeout(resolve, 1200));
        webRequestAPI.onCompleted.removeListener(handler);

        return {
            passed: detected,
            details: {
                detected: detected,
                url: requestUrl || 'none'
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

/**
 * English: Check 6: Browser action icon state (informational)
 * Russian: Проверка 6: Состояние иконки браузера (информационный)
 */
async function checkBrowserActionState(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    try {
        const badgeText = await new Promise<string>((resolve) => {
            api.browserAction.getBadgeText({}, (text: string) => {
                resolve(text || '');
            });
        });

        return {
            passed: true,
            details: {
                badgeText: badgeText || '(empty)'
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

/**
 * English: Check 7: Tab proxy status (informational)
 * Russian: Проверка 7: Статус прокси вкладки (информационный)
 */
async function checkTabProxyStatus(proxyId: string): Promise<{ passed: boolean; details?: any }> {
    try {
        let currentTabId: number | null = null;

        const tabs = await new Promise<any[]>((resolve) => {
            api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs || []);
            });
        });

        if (tabs && tabs.length > 0) {
            currentTabId = tabs[0].id;
        }

        if (!currentTabId) {
            return { passed: false, details: { error: 'No active tab found' } };
        }

        const popupData = await new Promise<any>((resolve) => {
            api.runtime.sendMessage('PopupGetInitialData', (data) => {
                resolve(data);
            });
        });

        const isProxified = popupData && popupData.currentTabId === currentTabId;

        return {
            passed: isProxified || false,
            details: {
                tabId: currentTabId,
                isProxified: isProxified || false,
                dataReceived: !!popupData
            }
        };
    } catch (err) {
        return { passed: false, details: { error: String(err) } };
    }
}

// ============================================================
// English: Main checker class
// Russian: Основной класс проверки
// ============================================================

export class ProxyReadinessChecker {
    // English: All registered checks with their weights and timeouts
    // Russian: Все зарегистрированные проверки с их весами и таймаутами
    private static readonly CHECKS: ReadinessCheckConfig[] = [
        {
            name: 'proxy_settings',
            fn: checkProxySettings,
            weight: 10,
            timeoutMs: 500
        },
        {
            name: 'active_profile',
            fn: checkActiveProfile,
            weight: 9,
            timeoutMs: 100
        },
        {
            name: 'dns_resolution',
            fn: checkDnsResolution,
            weight: 6,
            timeoutMs: 1500
        },
        {
            name: 'ip_request',
            fn: checkIpRequest,
            weight: 8,
            timeoutMs: 7000   // Increased to allow IpServiceManager to complete
        },
        {
            name: 'webrequest_traffic',
            fn: checkWebRequestTraffic,
            weight: 5,
            timeoutMs: 1500
        },
        {
            name: 'browser_action',
            fn: checkBrowserActionState,
            weight: 2,
            timeoutMs: 200
        },
        {
            name: 'tab_proxy_status',
            fn: checkTabProxyStatus,
            weight: 4,
            timeoutMs: 500
        }
    ];

    /**
     * English: Runs all readiness checks for a given proxy
     * Russian: Запускает все проверки готовности для заданного прокси
     */
    static async checkReadiness(
        proxyId: string,
        logToConsole: boolean = true,
        logToTestLog: boolean = true
    ): Promise<ReadinessSummary> {
        const startTime = Date.now();
        const results: ReadinessCheckResult[] = [];
        let totalWeight = 0;
        let passedWeight = 0;

        console.log(`%c[Readiness] ========== НАЧАЛО ПРОВЕРКИ ДЛЯ ПРОКСИ ${proxyId} ==========`, 'color: #ffaa00; font-weight: bold; font-size: 1.1em');

        for (const check of this.CHECKS) {
            const checkStart = Date.now();
            let passed = false;
            let details: any = null;
            let error: string | undefined = undefined;

            try {
                const result = await Promise.race([
                    check.fn(proxyId),
                    new Promise<{ passed: boolean; details?: any }>((resolve) => {
                        setTimeout(() => {
                            resolve({
                                passed: false,
                                details: { error: `Timeout after ${check.timeoutMs}ms` }
                            });
                        }, check.timeoutMs);
                    })
                ]);

                passed = result.passed || false;
                details = result.details || null;
            } catch (err) {
                passed = false;
                error = String(err);
                details = { error: error };
            }

            const duration = Date.now() - checkStart;

            const result: ReadinessCheckResult = {
                name: check.name,
                passed: passed,
                details: details,
                duration: duration,
                error: error
            };

            results.push(result);

            if (passed) {
                passedWeight += check.weight;
            }
            totalWeight += check.weight;

            const statusIcon = passed ? '✅' : '❌';
            const durationStr = `${duration}ms`;
            console.log(`[Readiness] ${statusIcon} ${check.name.padEnd(20)} ${durationStr.padEnd(8)} ${passed ? 'ПРОЙДЕНА' : 'НЕ ПРОЙДЕНА'}${details ? ' | ' + JSON.stringify(details).substring(0, 100) : ''}`);
        }

        const confidence = totalWeight > 0 ? passedWeight / totalWeight : 0;
        const threshold = 0.6;
        const overall = confidence >= threshold;
        const passedCount = results.filter(r => r.passed).length;
        const totalCount = results.length;

        const summary: ReadinessSummary = {
            proxyId: proxyId,
            timestamp: Date.now(),
            checks: results,
            overall: overall,
            confidence: confidence,
            passedCount: passedCount,
            totalCount: totalCount,
            summary: `Готовность: ${Math.round(confidence * 100)}% (${passedCount}/${totalCount} проверок) — ${overall ? 'ГОТОВ' : 'НЕ ГОТОВ'}`
        };

        if (logToConsole) {
            console.log(`%c[Readiness] ${summary.summary}`, overall ? 'color: #00ff88; font-weight: bold' : 'color: #ff5555; font-weight: bold');
            console.log(`[Readiness] Общее время: ${Date.now() - startTime}мс`);
            console.log(`[Readiness] Детали проверок:`, results.map(r => ({
                name: r.name,
                passed: r.passed,
                duration: r.duration,
                details: r.details
            })));
            console.log(`%c[Readiness] ========== КОНЕЦ ПРОВЕРКИ ==========`, 'color: #ffaa00; font-weight: bold');
        }

        if (logToTestLog) {
            const proxy = SettingsOperation.findProxyServerById(proxyId);
            const host = proxy?.host || proxyId;
            const port = proxy?.port || '';
            const countryCode = proxy?.countryCode || CountryCode.getCountryCode(host) || '';

		Core.sendTestLogStep({
			type: 'readiness',
			proxyId: proxyId,
			host: host,
			port: port,
			protocol: proxy?.protocol || '',
			countryCode: countryCode,
			overall: overall,
			confidence: Math.round(confidence * 100),
			passedCount: passedCount,
			totalCount: totalCount,
			totalDurationMs: Date.now() - startTime,
			checks: results.map(r => ({
				name: r.name,
				passed: r.passed,
				duration: r.duration
			})),
			timestamp: Date.now()
		});
        }

        return summary;
    }

    /**
     * English: Quick readiness check (uses only ip_request and active_profile)
     * Russian: Быстрая проверка готовности (использует только ip_request и active_profile)
     * This is the method that can be used to dynamically adjust delay.
     * Это метод, который можно использовать для динамической регулировки задержки.
     */
    static async quickCheck(proxyId: string): Promise<boolean> {
        // English: Only check ip_request (primary) and active_profile (secondary)
        // Russian: Проверяем только ip_request (основной) и active_profile (вторичный)
        try {
            const ipResult = await Promise.race([
                checkIpRequest(proxyId),
                new Promise<{ passed: boolean }>((resolve) => {
                    setTimeout(() => resolve({ passed: false }), 5000);
                })
            ]);

            if (ipResult.passed) {
                return true; // IP получен — прокси точно работает
            }

            // Если IP не получен, проверяем активный профиль (может быть, прокси просто медленный)
            const profileResult = await checkActiveProfile(proxyId);
            return profileResult.passed;
        } catch {
            return false;
        }
    }

    /**
     * English: Gets the list of all registered check names
     * Russian: Возвращает список имён всех зарегистрированных проверок
     */
    static getCheckNames(): string[] {
        return this.CHECKS.map(c => c.name);
    }
}