// src/core/IpServiceManager.ts

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

import { api, environment } from "../lib/environment";
import { IP_SERVICES } from "./TestConstants";
import { Settings } from "./Settings";
import { ProxyEngine } from "./ProxyEngine";
import { SmartProfileTypeBuiltinIds } from "./definitions";
import { SettingsOperation } from "./SettingsOperation";
import { Core } from "./Core";

// ==================== Type Definitions ====================

export type IpServiceResult = {
    url: string;
    time: number;
    ip: string;
};

// ==================== Module State (cached) ====================

let directIp: string | null = null;
let ipServicesRanked: string[] | null = null;
let fastestIpServiceUrl: string | null = null;

// For sticky service rotation (kept per proxy session)
let lastSeenIpByService: Map<string, string> = new Map();
let lastProxyKeyByService: Map<string, string> = new Map();

// Lock to prevent concurrent initialisation
let isInitializing = false;
let pendingInitPromise: Promise<void> | null = null;

// ==================== Internal Helpers ====================

/**
 * English: Checks if a string is a valid IPv4 address.
 * Russian: Проверяет, является ли строка корректным IPv4-адресом.
 */
function isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
        const num = Number(part);
        return !isNaN(num) && num >= 0 && num <= 255 && part === String(num);
    });
}

/**
 * English: Gets sorted list of IP services by response time (only HTTP services that return plain IP).
 * Russian: Получает отсортированный по скорости список IP-сервисов (только HTTP, возвращающие чистый IP).
 */
async function getRankedIpServicesInternal(): Promise<IpServiceResult[]> {
    const results: IpServiceResult[] = [];
    for (const url of IP_SERVICES) {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'error'
            });
            clearTimeout(timeoutId);
            if (response.ok && !response.url.startsWith('https://')) {
                const text = await response.text();
                const ip = text.trim();
                if (isValidIPv4(ip)) {
                    results.push({ url, time: Date.now() - start, ip });
                }
            }
        } catch (e) {
            // Service unavailable or redirects – ignore
        }
    }
    results.sort((a, b) => a.time - b.time);
    return results;
}

/**
 * English: Executes a function while temporarily switching proxy to direct (system) mode.
 * Russian: Выполняет функцию, временно переключив прокси на прямой доступ (system).
 */
/**
 * English: Executes a function while temporarily switching proxy to Direct (no proxy).
 * Uses the same reliable mechanism as ProxyCycleTester (Settings + ProxyEngine).
 * Russian: Выполняет функцию, временно переключив прокси на Direct (без прокси).
 * Использует тот же надёжный механизм, что и ProxyCycleTester (Settings + ProxyEngine).
 */
async function withDirectProxy<T>(fn: () => Promise<T>): Promise<T> {
    const proxyAPI = api.proxy;
    if (!proxyAPI) return fn();

    // Save original profile ID
    const originalProfileId = Settings.current?.activeProfileId;
    let originalProxyConfig: any = null;

    try {
        // Get original proxy config
        originalProxyConfig = await new Promise<any>(resolve => {
            proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
        });

        // Switch to Direct via ProxyEngine
        Settings.current.activeProfileId = SmartProfileTypeBuiltinIds.Direct;
        SettingsOperation.saveActiveProfile();
        SettingsOperation.saveAllSync(false);
        Settings.updateActiveSettings();
        ProxyEngine.updateBrowsersProxyConfig();

        // Wait for proxy to apply
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Execute the function
        return await fn();
    } catch (err) {
        console.error("[withDirectProxy] Error:", err);
        throw err;
    } finally {
        // Restore original profile
        if (originalProfileId) {
            Settings.current.activeProfileId = originalProfileId;
            SettingsOperation.saveActiveProfile();
            SettingsOperation.saveAllSync(false);
            Settings.updateActiveSettings();
            ProxyEngine.updateBrowsersProxyConfig();
        } else if (originalProxyConfig) {
            // Fallback: restore via proxy API
            await new Promise<void>(resolve => {
                proxyAPI.settings.set({ value: originalProxyConfig, scope: "regular" }, () => resolve());
            });
        }
        // Wait for restore
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

/**
 * English: For Firefox, we need to open a popup to get direct IP (because proxy API is unreliable in background).
 * Russian: Для Firefox нужно открыть попап для получения прямого IP (т.к. API прокси в фоне ненадёжен).
 */
async function getDirectIpViaPopup(): Promise<{ directIp: string | null; workingServices: string[] }> {
    console.log("[IpServiceManager] Открываем попап для получения прямого IP и работающих сервисов...");
    return new Promise<{ directIp: string | null; workingServices: string[] }>((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const handler = (message: any) => {
            if (message && message.command === "DIRECT_IP_RESULT") {
                if (timeoutId) clearTimeout(timeoutId);
                api.runtime.onMessage.removeListener(handler);
                const ip = message.ip || null;
                const services = message.workingServices || [];
                console.log("[IpServiceManager] Получен прямой IP из попапа:", ip);
                console.log("[IpServiceManager] Работающие сервисы из попапа:", services);
                resolve({ directIp: ip, workingServices: services });
            }
        };
        api.runtime.onMessage.addListener(handler);
        timeoutId = setTimeout(() => {
            api.runtime.onMessage.removeListener(handler);
            console.warn("[IpServiceManager] Таймаут ожидания прямого IP из попапа");
            resolve({ directIp: null, workingServices: [] });
        }, 15000);
        const popupUrl = api.runtime.getURL("ui/popup.html?mode=getDirectIp");
        api.tabs.create({ url: popupUrl, active: false }).catch(err => {
            if (timeoutId) clearTimeout(timeoutId);
            api.runtime.onMessage.removeListener(handler);
            console.error("[IpServiceManager] Не удалось открыть попап для определения IP:", err);
            resolve({ directIp: null, workingServices: [] });
        });
    });
}

// ==================== Public API ====================

/**
 * English: Ensures that the direct IP and ranked IP services are initialised (cached).
 * Russian: Гарантирует, что прямой IP и ранжированные IP-сервисы инициализированы (закэшированы).
 * Should be called at the start of any test session.
 */
async function ensureInitialized(): Promise<void> {
    if (directIp !== null && ipServicesRanked !== null && ipServicesRanked.length > 0) {
        // Already initialised
        return;
    }

    if (isInitializing && pendingInitPromise) {
        await pendingInitPromise;
        return;
    }

    isInitializing = true;
    pendingInitPromise = (async () => {
        try {
            // Get direct IP and ranked services in one go (using the most efficient method)
            let ip: string | null = null;
            let services: string[] = [];

            if (environment.name === "Firefox") {
                // English: For Firefox, we switch to Direct profile using the same reliable mechanism as in settingsPage.
                // Russian: Для Firefox мы переключаемся на профиль Direct, используя тот же надёжный механизм, что и в settingsPage.
                const originalProfileId = Settings.current?.activeProfileId;
                try {
                    // Switch to Direct using PopupChangeActiveProfile command (works reliably in Firefox)
                    await new Promise<void>((resolve) => {
                        api.runtime.sendMessage({
                            command: "PopupChangeActiveProfile",
                            profileId: SmartProfileTypeBuiltinIds.Direct
                        }, () => {
                            resolve();
                        });
                    });
                    // Wait for profile to actually change (polling via PopupGetInitialData)
                    let attempts = 0;
                    const maxAttempts = 30; // 30 * 200ms = 6 seconds
                    let profileChanged = false;
                    while (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        const data = await new Promise<any>((resolve) => {
                            api.runtime.sendMessage("PopupGetInitialData", resolve);
                        });
                        if (data && data.activeProfileId === SmartProfileTypeBuiltinIds.Direct) {
                            profileChanged = true;
                            break;
                        }
                        attempts++;
                    }
                    if (!profileChanged) {
                        console.warn("[IpServiceManager] Не удалось переключиться на Direct через команду, пробуем прямой switch");
                        // Fallback: direct switch
                        Settings.current.activeProfileId = SmartProfileTypeBuiltinIds.Direct;
                        SettingsOperation.saveActiveProfile();
                        SettingsOperation.saveAllSync(false);
                        Settings.updateActiveSettings();
                        ProxyEngine.updateBrowsersProxyConfig();
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }
                    // Get IP services
                    const results = await getRankedIpServicesInternal();
                    if (results.length > 0) {
                        services = results.map(r => r.url);
                        ip = results[0].ip;
                        console.log(`%c[IpServiceManager] Прямой IP (Firefox, команда): ${ip} (через ${results[0].url} за ${results[0].time}мс)`, 'color: #00aaff; font-weight: bold; font-size: 1.2em');
                    } else {
                        console.warn("[IpServiceManager] Не удалось получить прямой IP через команду");
                    }
                } catch (err) {
                    console.error("[IpServiceManager] Ошибка при получении прямого IP через команду:", err);
                } finally {
                    // Restore original profile
                    if (originalProfileId) {
                        await new Promise<void>((resolve) => {
                            api.runtime.sendMessage({
                                command: "PopupChangeActiveProfile",
                                profileId: originalProfileId
                            }, () => resolve());
                        });
                        // Wait for restore
                        let attempts = 0;
                        while (attempts < 30) {
                            await new Promise(resolve => setTimeout(resolve, 200));
                            const data = await new Promise<any>((resolve) => {
                                api.runtime.sendMessage("PopupGetInitialData", resolve);
                            });
                            if (data && data.activeProfileId === originalProfileId) break;
                            attempts++;
                        }
                    }
                }
                // If still no IP, try old popup method as fallback
                if (!ip && !services.length) {
                    console.log("[IpServiceManager] Команда не дала IP, пробуем попап...");
                    const result = await getDirectIpViaPopup();
                    ip = result.directIp;
                    if (result.workingServices && result.workingServices.length) {
                        services = result.workingServices;
                    } else if (ip) {
                        services = [...IP_SERVICES];
                    }
                }
            } else {
                // For Chrome/Edge/Opera: use direct proxy API
                await withDirectProxy(async () => {
                    const results = await getRankedIpServicesInternal();
                    if (results.length === 0) {
                        console.warn("[IpServiceManager] Нет доступных IP-сервисов");
                        return;
                    }
                    services = results.map(r => r.url);
                    // The fastest service's IP is our direct IP
                    ip = results[0].ip;
                    console.log(`%c[IpServiceManager] Прямой IP: ${ip} (через ${results[0].url} за ${results[0].time}мс)`, 'color: #00aaff; font-weight: bold; font-size: 1.2em');
                });
            }

            if (ip) directIp = ip;
            if (services.length) {
                ipServicesRanked = services;
                fastestIpServiceUrl = services[0] || null;
            } else {
                // Fallback: use full list
                ipServicesRanked = [...IP_SERVICES];
                fastestIpServiceUrl = ipServicesRanked[0];
                console.warn("[IpServiceManager] Используем запасной список IP-сервисов");
            }

            console.log(`[IpServiceManager] Инициализация завершена: прямой IP=${directIp}, сервисов=${ipServicesRanked.length}`);
			// English: Send direct IP to log
			// Russian: Отправляем прямой IP в лог
			Core.sendTestLogStep({
				type: 'direct-ip',
				ip: ip,
				timestamp: Date.now()
			});
        } catch (err) {
            console.error("[IpServiceManager] Ошибка инициализации:", err);
            // Set fallback to avoid blocking
            if (!ipServicesRanked || ipServicesRanked.length === 0) {
                ipServicesRanked = [...IP_SERVICES];
                fastestIpServiceUrl = ipServicesRanked[0];
            }
        } finally {
            isInitializing = false;
            pendingInitPromise = null;
        }
    })();

    await pendingInitPromise;
}

/**
 * English: Returns the cached direct IP. If not initialised, calls ensureInitialized().
 * Russian: Возвращает закэшированный прямой IP. Если не инициализирован, вызывает ensureInitialized().
 */
async function getDirectIp(): Promise<string | null> {
    if (directIp === null) {
        await ensureInitialized();
    }
    return directIp;
}

/**
 * English: Returns the cached ranked list of IP services (fastest first).
 * Russian: Возвращает закэшированный ранжированный список IP-сервисов (сначала самые быстрые).
 */
async function getIpServices(): Promise<string[]> {
    if (ipServicesRanked === null) {
        await ensureInitialized();
    }
    return ipServicesRanked || [...IP_SERVICES];
}

/**
 * English: Returns the fastest IP service URL.
 * Russian: Возвращает URL самого быстрого IP-сервиса.
 */
async function getFastestIpService(): Promise<string | null> {
    if (fastestIpServiceUrl === null) {
        await ensureInitialized();
    }
    return fastestIpServiceUrl;
}

/**
 * English: Resets the cache (useful for a new test session or after network changes).
 * Russian: Сбрасывает кэш (полезно для новой сессии тестирования или после изменений в сети).
 */
function resetCache(): void {
    directIp = null;
    ipServicesRanked = null;
    fastestIpServiceUrl = null;
    lastSeenIpByService.clear();
    lastProxyKeyByService.clear();
    isInitializing = false;
    pendingInitPromise = null;
    console.log("[IpServiceManager] Кэш сброшен");
}

/**
 * English: Fetches a public IP through a specific proxy using the cached IP services.
 * Russian: Получает публичный IP через заданный прокси, используя закэшированные IP-сервисы.
 * Returns the detected IP (or null if failed).
 */
/**
 * English: Fetches a public IP through a specific proxy using fetch (no tabs, no downloads).
 * Russian: Получает публичный IP через заданный прокси, используя fetch (без вкладок и скачиваний).
 * Returns the detected IP (or null if failed).
 */
async function fetchIpViaProxy(
    proxy: { host: string; port: number; protocol: string },
    retryForSticky: boolean = true,
    skipDirectIp: boolean = false // English: skip fetching direct IP / Russian: пропустить получение прямого IP
): Promise<string | null> {
    let services: string[];
    if (skipDirectIp) {
        services = IP_SERVICES;
        console.log(`[IpServiceManager] Используем фиксированный список IP-сервисов (прямой IP не запрашивается)`);
    } else {
        services = ipServicesRanked;
        if (!services || services.length === 0) {
            services = await getIpServices();
        }
        if (!services.length) {
            console.warn("[IpServiceManager] Нет доступных IP-сервисов");
            return null;
        }
    }

    const proxyKey = `${proxy.host}:${proxy.port}`;
    const servicesToTry = services.slice(0, 9); // Use top 9 fastest (or just first 9 if fixed)

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per service

    const testService = async (serviceUrl: string): Promise<string | null> => {
        console.log(`[IpServiceManager] ⏳ Запрос IP к ${serviceUrl} через прокси ${proxy.host}:${proxy.port}`);
        try {
            const cacheBuster = (serviceUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
            const freshUrl = serviceUrl + cacheBuster;
            const response = await fetch(freshUrl, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'error',
                headers: { 'Accept': 'text/plain' }
            });
            if (!response.ok) {
                console.log(`[IpServiceManager] ❌ ${serviceUrl} вернул ${response.status}`);
                return null;
            }
            const text = await response.text();
            const ip = text.trim();
            if (isValidIPv4(ip)) {
                console.log(`[IpServiceManager] ✅ ${serviceUrl} вернул IP: ${ip}`);
                // Sticky check (only when direct IP is used)
                if (!skipDirectIp && retryForSticky) {
                    const lastIpForService = lastSeenIpByService.get(serviceUrl);
                    const lastProxyForService = lastProxyKeyByService.get(serviceUrl);
                    if (lastIpForService && lastProxyForService && lastProxyForService !== proxyKey) {
                        if (ip === lastIpForService && ip !== directIp) {
                            console.log(`[IpServiceManager] Сервис ${serviceUrl} залип на IP ${ip} (был для ${lastProxyForService}, сейчас для ${proxyKey})`);
                            return null;
                        }
                    }
                    lastSeenIpByService.set(serviceUrl, ip);
                    lastProxyKeyByService.set(serviceUrl, proxyKey);
                } else {
                    // Still store seen IP for possible future use, but no comparison
                    lastSeenIpByService.set(serviceUrl, ip);
                    lastProxyKeyByService.set(serviceUrl, proxyKey);
                }
                return ip;
            }
            console.log(`[IpServiceManager] ❌ ${serviceUrl} вернул невалидный IP: "${ip}"`);
            return null;
        } catch (err) {
            // Timeout or network error – ignore
            console.log(`[IpServiceManager] ❌ Ошибка ${serviceUrl}: ${err.message}`);
            return null;
        }
    };

    // Try services sequentially (or in parallel with Promise.any)
    // English: Wrap each service promise to abort all others on first success
    // Russian: Оборачиваем каждый промис сервиса, чтобы прервать все остальные при первом успехе
    const wrappedPromises = servicesToTry.map(service => {
        return testService(service).then(ip => {
            if (ip !== null) {
                // Abort all other pending requests
                // Прерываем все остальные ожидающие запросы
                controller.abort();
                return ip;
            }
            throw new Error('no_ip');
        });
    });
    const result = await Promise.any(wrappedPromises).catch(() => null);
    clearTimeout(timeoutId);
    return result;
}

// ==================== Export object ====================

export const IpServiceManager = {
    ensureInitialized,
    getDirectIp,
    getIpServices,
    getFastestIpService,
    resetCache,
    fetchIpViaProxy
};