// src/core/LocalProxyChecker.ts

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

import { ProxyServer } from "./definitions";
import { api } from "../lib/environment";
import { IP_SERVICES, ERROR_INDICATORS, CERT_ERROR_INDICATORS } from "./TestConstants";

// ==================== Tab creation without hidden window ====================
/**
 * English: Creates a new tab in the current window (no hidden window).
 * Russian: Создаёт новую вкладку в текущем окне (без скрытого окна).
 */
async function createTestTab(url: string): Promise<number> {
    const tab = await api.tabs.create({ url, active: false });
    if (!tab.id) throw new Error("Failed to create tab");
    console.log(`[LocalProxyChecker] Created test tab ID=${tab.id}`);
    return tab.id;
}

/**
 * English: Removes a URL from browser history.
 * Russian: Удаляет URL из истории браузера.
 */
async function removeFromHistory(url: string): Promise<void> {
    if (!url || url === "about:blank") return;
    try {
        await api.history.deleteUrl({ url });
        console.log(`[LocalProxyChecker] Removed from history: ${url}`);
    } catch (e) {
        console.warn(`[LocalProxyChecker] Failed to remove from history: ${url}`, e);
    }
}

type CheckResult = {
    alive: boolean;
    latencyMs: number;
    error?: string;
};

const VISUAL_MODE = false;

/**
 * English: Executes a function while temporarily switching proxy to direct (system) mode.
 * Russian: Выполняет функцию, временно переключив прокси на прямой доступ (system).
 */
async function withDirectProxy<T>(fn: () => Promise<T>): Promise<T> {
    const proxyAPI = api.proxy;
    if (!proxyAPI) return fn();

    const originalConfig = await new Promise<any>(resolve => {
        proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
    });

    try {
        await new Promise<void>((resolve, reject) => {
            proxyAPI.settings.set({ value: { mode: "system" }, scope: "regular" }, () => {
                if (api.runtime?.lastError) reject(new Error(api.runtime.lastError.message));
                else resolve();
            });
        });
        console.log(`[ProxyTest] Временно переключён прямой прокси для получения IP`);
        return await fn();
    } finally {
        await new Promise<void>(resolve => {
            proxyAPI.settings.set({ value: originalConfig || { mode: "system" }, scope: "regular" }, () => resolve());
        });
        console.log(`[ProxyTest] Прокси восстановлен`);
    }
}

function isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
        const num = Number(part);
        return !isNaN(num) && num >= 0 && num <= 255 && part === String(num);
    });
}

let fastestIpServiceUrl: string | null = null;
let directIp: string | null = null;
let isFindingFastestService = false;
let pendingFindPromise: Promise<string | null> | null = null;

// ========== Механизм ротации при залипании ==========
let ipServicesRanked: string[] | null = null;
let lastSeenIpByService: Map<string, string> = new Map();
let lastProxyKeyByService: Map<string, string> = new Map();

async function getRankedIpServices(): Promise<string[]> {
    const results: { url: string, time: number }[] = [];
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
                const elapsed = Date.now() - start;
                results.push({ url, time: elapsed });
                console.log(`[ProxyTest] IP-сервис ${url} ответил за ${elapsed}мс (протокол: HTTP)`);
            } else if (response.url.startsWith('https://')) {
                console.log(`[ProxyTest] IP-сервис ${url} редиректит на HTTPS, пропускаем`);
            }
        } catch (e) {
            console.log(`[ProxyTest] IP-сервис ${url} недоступен или редиректит`);
        }
    }
    if (results.length === 0) return [];
    results.sort((a, b) => a.time - b.time);
    return results.map(r => r.url);
}

async function findFastestIpService(): Promise<string | null> {
    if (fastestIpServiceUrl) return fastestIpServiceUrl;
    if (isFindingFastestService && pendingFindPromise) return pendingFindPromise;

    isFindingFastestService = true;
    pendingFindPromise = (async () => {
        if (!ipServicesRanked) {
            ipServicesRanked = await getRankedIpServices();
        }
        if (ipServicesRanked && ipServicesRanked.length) {
            fastestIpServiceUrl = ipServicesRanked[0];
            console.log(`[ProxyTest] Выбран быстрейший IP-сервис: ${fastestIpServiceUrl}`);
            return fastestIpServiceUrl;
        }
        return null;
    })();

    const result = await pendingFindPromise;
    isFindingFastestService = false;
    pendingFindPromise = null;
    return result;
}

async function getDirectIp(): Promise<string | null> {
    if (directIp) return directIp;
    const serviceUrl = await findFastestIpService();
    if (!serviceUrl) return null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(serviceUrl, {
            signal: controller.signal,
            cache: 'no-store',
            redirect: 'error'
        });
        clearTimeout(timeoutId);
        if (response.ok) {
            const text = (await response.text()).trim();
            if (isValidIPv4(text)) {
                directIp = text;
                console.log(`%c[ProxyTest] Прямой IP: ${directIp}`, 'color: #0088ff; font-weight: bold; font-size: 1.2em');
                return directIp;
            } else {
                console.warn(`[ProxyTest] Сервис вернул невалидный IP: ${text}`);
            }
        }
    } catch (e) {
        console.error(`[ProxyTest] Ошибка получения прямого IP:`, e);
    }
    return null;
}

// ========== Вспомогательные функции проверки ==========

async function knockProxy(proxy: ProxyServer, testUrl: string): Promise<void> {
    let tabId: number | undefined;
    try {
        tabId = await createTestTab(testUrl);
        await new Promise(r => setTimeout(r, 1000));
        if (tabId) {
            const tab = await api.tabs.get(tabId);
            const url = tab.url;
            await api.tabs.remove(tabId);
            await removeFromHistory(url);
        }
    } catch (err) {}
}

/**
 * English: Fetches public IP through the proxy using a tab.
 * Applies cache‑buster to avoid stale responses.
 * Automatically rotates IP service if sticky behaviour is detected.
 * Russian: Получает публичный IP через прокси, используя вкладку.
 * Добавляет параметр для обхода кеша. Автоматически ротирует IP‑сервис при залипании.
 */
async function fetchProxyIpViaTab(
    proxy: ProxyServer,
    ipServiceUrl: string,
    directIpStr: string | null,
    retryForSticky: boolean = true
): Promise<string | null> {
    const proxyKey = `${proxy.host}:${proxy.port}`;
    
    let workingServices = ipServicesRanked;
    if (!workingServices || workingServices.length === 0) {
        workingServices = await getRankedIpServices();
        ipServicesRanked = workingServices;
        fastestIpServiceUrl = workingServices[0] || null;
    }
    if (!workingServices.length) {
        console.log(`%c[ProxyTest] ❌ Нет доступных IP-сервисов`, 'color: #ff0000');
        return null;
    }
    
    const servicesToTry = workingServices.slice(0, 3);
    console.log(`[ProxyTest] 🔍 Параллельная проверка IP через ${servicesToTry.length} сервисов для прокси ${proxy.host}:${proxy.port}`);
    
    const testService = async (serviceUrl: string): Promise<string | null> => {
        const cacheBuster = (serviceUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
        const freshUrl = serviceUrl + cacheBuster;
        let ipTabId: number | undefined;
        try {
            ipTabId = await createTestTab(freshUrl);
            console.log(`%c[ProxyTest] IP-вкладка открыта id=${ipTabId} для ${freshUrl}`, 'color: #ff8800');
            
            await new Promise<void>((resolve, reject) => {
                const onUpdated = (tabId: number, changeInfo: any) => {
                    if (tabId === ipTabId && changeInfo.status === 'complete') {
                        api.tabs.onUpdated.removeListener(onUpdated);
                        resolve();
                    }
                };
                api.tabs.onUpdated.addListener(onUpdated);
                setTimeout(() => {
                    api.tabs.onUpdated.removeListener(onUpdated);
                    reject(new Error('Tab load timeout after 10 seconds'));
                }, 10000);
            });
            
            let ip: string | undefined;
            if (api.scripting && api.scripting.executeScript) {
                const results = await api.scripting.executeScript({
                    target: { tabId: ipTabId },
                    func: () => document.body.innerText.trim()
                });
                ip = results?.[0]?.result;
            } else if (api.tabs.executeScript) {
                const results = await new Promise<any>((resolve, reject) => {
                    api.tabs.executeScript(ipTabId, { code: 'document.body.innerText' }, (res: any) => {
                        if (api.runtime.lastError) reject(api.runtime.lastError);
                        else resolve(res);
                    });
                });
                ip = results?.[0];
            }
            const trimmedIp = ip?.trim();
            if (!trimmedIp || !isValidIPv4(trimmedIp)) return null;
            
            const lastIpForService = lastSeenIpByService.get(serviceUrl);
            const lastProxyForService = lastProxyKeyByService.get(serviceUrl);
            if (retryForSticky && lastIpForService && lastProxyForService && lastProxyForService !== proxyKey) {
                if (trimmedIp === lastIpForService && trimmedIp !== directIpStr) {
                    console.log(`[ProxyTest] ⚠️ Сервис ${serviceUrl} залип на IP ${trimmedIp} (был для ${lastProxyForService}, сейчас для ${proxyKey})`);
                    return null;
                }
            }
            lastSeenIpByService.set(serviceUrl, trimmedIp);
            lastProxyKeyByService.set(serviceUrl, proxyKey);
            console.log(`%c[ProxyTest] Получен IP через прокси: ${trimmedIp}`, 'color: #ff8800; font-weight: bold; font-size: 1.2em');
            return trimmedIp;
        } catch (err) {
            console.log(`[ProxyTest] Ошибка при проверке IP через ${serviceUrl}:`, err);
            return null;
        } finally {
            if (ipTabId) {
                try { 
                    await api.tabs.remove(ipTabId);
                    await removeFromHistory(freshUrl);
                } catch(e) {}
            }
        }
    };
    
    const promises = servicesToTry.map(service => testService(service));
    const result = await Promise.any(promises.map(p => p.then(ip => {
        if (ip !== null) return ip;
        throw new Error('no_ip');
    }))).catch(() => null);
    
    if (result) {
        console.log(`%c[ProxyTest] ✅ Получен IP через прокси: ${result}`, 'color: #00ff00');
        return result;
    }
    console.log(`%c[ProxyTest] ❌ Не удалось получить IP ни от одного сервиса`, 'color: #ff0000');
    return null;
}

export const LocalProxyChecker = {
    async checkProxy(
        proxy: ProxyServer,
        testUrls: string[],
        requireAll: boolean = false,
        _timeoutMs: number = 20000,
        retryForDirectIp: boolean = true
    ): Promise<CheckResult> {
        if (!testUrls || !testUrls[0]) {
            return { alive: false, latencyMs: 0, error: "Не указан тестовый URL" };
        }

        let testUrl = testUrls[0].trim();
        if (!testUrl) {
            return { alive: false, latencyMs: 0, error: "Empty test URL" };
        }
        if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
            testUrl = 'https://' + testUrl;
        }

        const startTime = Date.now();
        console.log(`[ProxyTest] Начало проверки ${proxy.host}:${proxy.port} для ${testUrl}`);

        let fastestIpService: string | null = null;
        let directIpStr: string | null = null;
        if (fastestIpServiceUrl !== null && directIp !== null) {
            fastestIpService = fastestIpServiceUrl;
            directIpStr = directIp;
            console.log(`[ProxyTest] Используем кэшированный IP-сервис: ${fastestIpService}, прямой IP: ${directIpStr}`);
        } else {
            try {
                await withDirectProxy(async () => {
                    if (!ipServicesRanked) {
                        ipServicesRanked = await getRankedIpServices();
                    }
                    if (ipServicesRanked && ipServicesRanked.length) {
                        fastestIpService = ipServicesRanked[0];
                        fastestIpServiceUrl = fastestIpService;
                        console.log(`[ProxyTest] Доступные IP-сервисы (по скорости): ${ipServicesRanked.join(', ')}`);
                    } else {
                        fastestIpService = await findFastestIpService();
                    }
                    if (fastestIpService) {
                        directIpStr = await getDirectIp();
                    }
                    return;
                });
                if (fastestIpService) {
                    console.log(`[ProxyTest] Быстрейший IP-сервис: ${fastestIpService}, прямой IP: ${directIpStr || 'не определён'}`);
                } else {
                    console.log(`[ProxyTest] Не удалось определить быстрейший IP-сервис, IP-проверка будет пропущена`);
                }
            } catch (err) {
                console.log(`[ProxyTest] Ошибка при получении IP-сервиса/прямого IP:`, err);
            }
        }

        const proxyAPI = api.proxy;
        if (!proxyAPI) {
            return { alive: false, latencyMs: 0, error: "Нет API прокси" };
        }

        let initialDelay = 2000;
        const protocolUpper = (proxy.protocol || 'HTTP').toUpperCase();
        if (protocolUpper.includes('SOCKS5')) initialDelay = 6500;
        else if (protocolUpper.includes('SOCKS4')) initialDelay = 5200;
        else if (protocolUpper === 'HTTPS') initialDelay = 3500;
        console.log(`[ProxyTest] Протокол ${protocolUpper}, задержка после установки ${initialDelay}мс`);

        const originalConfig = await new Promise<any>(resolve => {
            proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
        });

        let scheme = (proxy.protocol || 'HTTP').toLowerCase();
        if (scheme === 'socks') scheme = 'socks5';
        const tempConfig = {
            mode: "fixed_servers",
            rules: {
                singleProxy: { scheme, host: proxy.host, port: proxy.port },
                bypassList: ["<local>"]
            }
        };

        let tabId: number | undefined;
        let testCompleted = false;
        let faviconInterval: any = null;
        let updateListener: any = null;
        let responseReceived200 = false;
        let webListener: any = null;
        let navigationListener: any = null;
        let mainTimeoutId: any = null;
        let extendedTimer: any = null;
        
        let mainTabFailed = false;
        let hasIndirectSuccess = false;
        let directIpDetected = false;
        let ipCheckCompleted = false;
        let exactSuccessTriggered = false;
        
        let ipCheckPromiseResolve: ((value: string | null) => void) | null = null;
        let ipCheckPromise: Promise<string | null> | null = null;
        
        let finalResult: { alive: boolean, exact: boolean, error?: string } = { alive: false, exact: false };

        const decideFinalResult = async () => {
            if (testCompleted) return;
            if (ipCheckPromise && !ipCheckCompleted) {
                console.log(`[ProxyTest] Ожидание завершения IP-проверки перед принятием решения...`);
                await ipCheckPromise;
            }
            if (testCompleted) return;
            if (exactSuccessTriggered) {
                await finishTest(true, true);
                return;
            }
            if (hasIndirectSuccess) {
                if (mainTabFailed) {
                    console.log(`%c[ProxyTest] Косвенный успех: основная вкладка не загрузилась, но IP получен не прямой`, 'color: #0088ff');
                    await finishTest(true, false);
                    return;
                }
                if (mainTimeoutId) clearTimeout(mainTimeoutId);
                if (extendedTimer) clearTimeout(extendedTimer);
                console.log(`[ProxyTest] Косвенный успех получен, продлеваем ожидание до 30 секунд...`);
                extendedTimer = setTimeout(() => {
                    if (!testCompleted && hasIndirectSuccess && !exactSuccessTriggered) {
                        console.log(`%c[ProxyTest] Косвенный успех: IP получен, но целевой сайт не загружен`, 'color: #ffaa00');
                        finishTest(true, false);
                    }
                }, 30000);
                return;
            }
            if (directIpDetected && retryForDirectIp) {
                console.log(`[ProxyTest] Перезапуск проверки с очисткой...`);
                await finishTest(false, false, "DIRECT_IP_RETRY");
                return;
            }
            await finishTest(false, false, "Прокси не работает");
        };

        const finishTest = async (alive: boolean, exact: boolean, error?: string) => {
            if (testCompleted) return;
            console.log(`[ProxyTest] decideFinalResult: exactSuccess=${exactSuccessTriggered}, hasIndirectSuccess=${hasIndirectSuccess}, mainTabFailed=${mainTabFailed}, directIpDetected=${directIpDetected}`);
            testCompleted = true;
            finalResult = { alive, exact, error };
            if (mainTimeoutId) clearTimeout(mainTimeoutId);
            if (extendedTimer) clearTimeout(extendedTimer);
            if (faviconInterval) clearInterval(faviconInterval);
            if (updateListener) api.tabs.onUpdated.removeListener(updateListener);
            if (webListener && (api as any).webRequest) (api as any).webRequest.onResponseStarted.removeListener(webListener);
            if (navigationListener && api.webNavigation && api.webNavigation.onErrorOccurred) {
                api.webNavigation.onErrorOccurred.removeListener(navigationListener);
            }
            if (tabId) {
                try { 
                    const tab = await api.tabs.get(tabId);
                    const url = tab.url;
                    await api.tabs.remove(tabId);
                    await removeFromHistory(url);
                } catch(e) {}
                tabId = undefined;
            }
            const latency = Date.now() - startTime;
            if (alive && exact) {
                console.log(`%c[ProxyTest] Результат: ${proxy.host}:${proxy.port} = ЖИВ (${latency}мс)`, 'color: #00ff00; font-weight: bold');
            } else if (alive && !exact) {
                console.log(`%c[ProxyTest] Результат: ${proxy.host}:${proxy.port} = КОСВЕННЫЙ УСПЕХ (${latency}мс)`, 'color: #0088ff; font-weight: bold');
            } else {
                console.log(`%c[ProxyTest] Результат: ${proxy.host}:${proxy.port} = МЁРТВ (${latency}мс)`, 'color: #ff3333; font-weight: bold');
            }
        };

        try {
            await new Promise<void>((resolve, reject) => {
                proxyAPI.settings.set({ value: tempConfig, scope: "regular" }, () => {
                    if (api.runtime?.lastError) reject(new Error(api.runtime.lastError.message));
                    else resolve();
                });
            });
            console.log(`[ProxyTest] Прокси установлен`);

            await knockProxy(proxy, testUrl);
            console.log(`[ProxyTest] Прозвон выполнен`);

            await new Promise(r => setTimeout(r, initialDelay));

            if (VISUAL_MODE) {
                const tab = await api.tabs.create({ url: testUrl, active: true });
                tabId = tab.id!;
            } else {
                tabId = await createTestTab(testUrl);
            }
            console.log(`[ProxyTest] Основная вкладка открыта id=${tabId}`);

            ipCheckPromise = new Promise<string | null>((resolve) => {
                ipCheckPromiseResolve = resolve;
            });

            setTimeout(async () => {
                if (testCompleted) return;
                console.log(`%c[ProxyTest] Запуск проверки IP через прокси...`, 'color: #ff8800');
                const ip = await fetchProxyIpViaTab(proxy, fastestIpService, directIpStr, true);
                ipCheckCompleted = true;
                if (ipCheckPromiseResolve) {
                    ipCheckPromiseResolve(ip);
                    ipCheckPromiseResolve = null;
                }
                if (testCompleted) return;
                if (ip) {
                    if (directIpStr && ip === directIpStr) {
                        directIpDetected = true;
                        console.log(`%c[ProxyTest] IP-вкладка вернула ПРЯМОЙ IP: ${ip} – критическая ошибка`, 'color: #ff0000');
                        await decideFinalResult();
                    } else {
                        hasIndirectSuccess = true;
                        console.log(`%c[ProxyTest] IP-вкладка вернула не прямой IP: ${ip}`, 'color: #ffa500');
                        await decideFinalResult();
                    }
                } else {
                    console.log(`[ProxyTest] IP-вкладка не вернула IP`);
                    await decideFinalResult();
                }
            }, 70);

            if (api.webNavigation && api.webNavigation.onErrorOccurred) {
                navigationListener = (details: any) => {
                    if (testCompleted) return;
                    if (details.tabId === tabId && details.frameId === 0) {
                        console.log(`%c[ProxyTest] ⚠️ Ошибка навигации основной вкладки: ${details.error}`, 'color: #ffaa00');
                        mainTabFailed = true;
                        decideFinalResult();
                    }
                };
                api.webNavigation.onErrorOccurred.addListener(navigationListener);
            }

            updateListener = (id: number, info: any) => {
                if (testCompleted || id !== tabId) return;
                if (info.title) {
                    const titleLower = info.title.toLowerCase();
                    console.log(`[ProxyTest] Заголовок: "${info.title}"`);
                    if (CERT_ERROR_INDICATORS.some(e => titleLower.includes(e.toLowerCase()))) {
                        exactSuccessTriggered = true;
                        decideFinalResult();
                        return;
                    }
                    if (ERROR_INDICATORS.some(e => titleLower.includes(e.toLowerCase()))) {
                        console.log(`[ProxyTest] ❌ Общая ошибка в заголовке, прокси не работает`);
                        mainTabFailed = true;
                        decideFinalResult();
                        return;
                    }
                }
            };
            api.tabs.onUpdated.addListener(updateListener);

            const webReq = (api as any).webRequest;
            if (webReq && webReq.onResponseStarted) {
                webListener = (details: any) => {
                    if (testCompleted || details.tabId !== tabId) return;
                    if (details.statusCode === 200 && !responseReceived200) {
                        responseReceived200 = true;
                        console.log(`[ProxyTest] ★ Получен ответ 200 – прокси работает`);
                        exactSuccessTriggered = true;
                        decideFinalResult();
                    }
                };
                webReq.onResponseStarted.addListener(webListener, { urls: ["<all_urls>"], tabId: tabId });
            }

            faviconInterval = setInterval(async () => {
                if (testCompleted) return;
                try {
                    const tabInfo = await api.tabs.get(tabId);
                    const favUrl = tabInfo.favIconUrl;
                    if (favUrl) {
                        const lower = favUrl.toLowerCase();
                        const isCertError = CERT_ERROR_INDICATORS.some(e => lower.includes(e.toLowerCase()));
                        const isErrorFav = ERROR_INDICATORS.some(e => lower.includes(e.toLowerCase()));
                        if (isCertError) {
                            exactSuccessTriggered = true;
                            decideFinalResult();
                            return;
                        }
                        if (!isErrorFav) {
                            exactSuccessTriggered = true;
                            decideFinalResult();
                            return;
                        }
                    }
                } catch (err) {}
            }, 300);

            mainTimeoutId = setTimeout(() => {
                if (!testCompleted) {
                    console.log(`%c[ProxyTest] Первый таймаут (20 сек) – нет ответа 200 и нет признаков жизни`, 'color: #ffaa00');
                    mainTabFailed = true;
                    decideFinalResult();
                }
            }, 20000);

            while (!testCompleted) {
                await new Promise(r => setTimeout(r, 100));
            }

            return { 
                alive: finalResult.alive, 
                latencyMs: Date.now() - startTime, 
                error: finalResult.exact ? undefined : (finalResult.alive ? "INDIRECT" : finalResult.error)
            };

        } catch (err: any) {
            console.error(`[ProxyTest] Критическая ошибка:`, err);
            if (ipCheckPromise && !ipCheckCompleted) {
                await ipCheckPromise;
            }
            await finishTest(false, false, err.message);
            return { alive: false, latencyMs: Date.now() - startTime, error: err.message };
        } finally {
            try {
                await new Promise(r => proxyAPI.settings.set({ value: originalConfig || { mode: "system" }, scope: "regular" }, r));
            } catch {}
        }
    },

    async fetchPublicIpViaTab(proxy: ProxyServer): Promise<void> {
        let serviceUrl = fastestIpServiceUrl || 'http://api.ipify.org?format=text';
        let ipTabId: number | undefined;
        let finished = false;
        try {
            const cacheBuster = (serviceUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
            const freshUrl = serviceUrl + cacheBuster;
            ipTabId = await createTestTab(freshUrl);
            console.log(`%c[ProxyTest] fetchPublicIpViaTab: IP-вкладка открыта id=${ipTabId}`, 'color: #ff8800');
            await new Promise<void>((resolve, reject) => {
                const onUpdated = (tabId: number, changeInfo: any) => {
                    if (tabId === ipTabId && changeInfo.status === 'complete') {
                        api.tabs.onUpdated.removeListener(onUpdated);
                        resolve();
                    }
                };
                api.tabs.onUpdated.addListener(onUpdated);
                setTimeout(() => reject(new Error('Tab load timeout')), 5000);
            });
            if (finished) return;
            let ip: string | undefined;
            if (api.scripting && api.scripting.executeScript) {
                const results = await api.scripting.executeScript({
                    target: { tabId: ipTabId },
                    func: () => document.body.innerText.trim()
                });
                ip = results?.[0]?.result;
            } else if (api.tabs.executeScript) {
                const results = await new Promise<any>((resolve, reject) => {
                    api.tabs.executeScript(ipTabId, { code: 'document.body.innerText' }, (res: any) => {
                        if (api.runtime.lastError) reject(api.runtime.lastError);
                        else resolve(res);
                    });
                });
                ip = results?.[0];
            }
            if (ip) {
                console.log(
                    `%c[ProxyTest] Прокси %c${proxy.host}:${proxy.port}%c -> IP: %c${ip}`,
                    'color: #888', 'color: #ffa500; font-weight: bold; font-size: 1.2em',
                    'color: #888', 'color: #00ff00; font-weight: bold; font-size: 1.4em'
                );
            } else {
                console.log(`%c[ProxyTest] Не удалось получить IP для ${proxy.host}:${proxy.port}`, 'color: #ffaa00');
            }
        } catch (err: any) {
            console.log(`%c[ProxyTest] Ошибка получения IP для ${proxy.host}:${proxy.port}: ${err?.message || err}`, 'color: #ffaa00');
        } finally {
            finished = true;
            if (ipTabId) {
                console.log(`%c[ProxyTest] fetchPublicIpViaTab: IP-вкладка ${ipTabId} закрывается`, 'color: #ff8800');
                try { 
                    await api.tabs.remove(ipTabId);
                    await removeFromHistory(serviceUrl);
                } catch(e) {}
            }
        }
    },

    resetIpCache(): void {
        fastestIpServiceUrl = null;
        directIp = null;
        isFindingFastestService = false;
        pendingFindPromise = null;
        ipServicesRanked = null;
        lastSeenIpByService.clear();
        lastProxyKeyByService.clear();
        console.log(`[ProxyTest] Кэш IP-сервисов и прямого IP сброшен`);
    },

    /**
     * English: Force close the hidden test window if it exists (no-op now, kept for API compatibility).
     * Russian: Принудительно закрыть скрытое тестовое окно, если оно существует (ничего не делает, оставлено для совместимости API).
     */
    async forceCloseHiddenWindow(): Promise<void> {
        // No hidden window to close anymore
        console.log(`[ProxyTest] forceCloseHiddenWindow called but no hidden window exists`);
    }
};