// src/core/ProxyCheckerCore.ts

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
import { IpServiceManager } from "./IpServiceManager";
import { Settings } from "./Settings";

// ==================== Utility functions ====================
// English: Checks if a string is a valid IPv4 or IPv6 address
// Russian: Проверяет, является ли строка корректным IPv4 или IPv6 адресом
function isValidIp(ip: string): boolean {
    // IPv4 pattern
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => {
            const num = Number(part);
            return num >= 0 && num <= 255 && part === String(num);
        });
    }
    // IPv6 pattern (simplified)
    const ipv6Pattern = /^([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}$/i;
    return ipv6Pattern.test(ip);
}

// English: Checks if two IP addresses belong to the same subnet with given prefix length (default /24)
// Russian: Проверяет, принадлежат ли два IP-адреса одной подсети с заданной длиной префикса (по умолчанию /24)
function isSameSubnet(ip1: string, ip2: string, prefixLength: number = 24): boolean {
    if (!isValidIp(ip1) || !isValidIp(ip2)) return false;
    const parts1 = ip1.split('.').map(Number);
    const parts2 = ip2.split('.').map(Number);
    const mask = ~0 << (32 - prefixLength);
    const ip1Int = (parts1[0] << 24) | (parts1[1] << 16) | (parts1[2] << 8) | parts1[3];
    const ip2Int = (parts2[0] << 24) | (parts2[1] << 16) | (parts2[2] << 8) | parts2[3];
    return (ip1Int & mask) === (ip2Int & mask);
}

// ==================== Types ====================

export interface CheckerOptions {
    mainTimeout: number;
    extendedTimeout: number;
    faviconInterval: number;
    ipCheckDelay: number;
    retryOnDirectIp: boolean;
    useExpressMode: boolean;
}

export interface CheckResult {
    alive: boolean;
    exact: boolean;
    status: "success" | "indirect" | "ip-only" | "fail";
    latencyMs: number;
    ip?: string | null;
    error?: string;
}

export interface CycleCheckResult {
    status: "success" | "indirect" | "ip-only" | "fail";
    latencyMs: number;
    error?: string;
}

export interface CycleCheckOptions {
    mainTimeout: number;
    extendedTimeout: number;
    faviconInterval: number;
    ipCheckDelay: number;
    retryOnDirectIp: boolean;
}

// ==================== Прокси-конфиг: установка и восстановление ====================

/**
 * English: Applies a proxy configuration for testing.
 * Russian: Применяет конфигурацию прокси для тестирования.
 */
async function applyProxyConfig(
    proxy: { host: string; port: number; protocol: string },
    useExpressMode: boolean
): Promise<{ originalConfig: any; initialDelay: number }> {
    const proxyAPI = api.proxy;
    if (!proxyAPI) {
        throw new Error("Нет API прокси");
    }

    // Расчёт задержки
    let initialDelay = useExpressMode ? 1500 : 2000;
    const protocolUpper = (proxy.protocol || 'HTTP').toUpperCase();
    if (protocolUpper.includes('SOCKS5')) initialDelay = useExpressMode ? 3000 : 6500;
    else if (protocolUpper.includes('SOCKS4')) initialDelay = useExpressMode ? 2500 : 5200;
    else if (protocolUpper === 'HTTPS') initialDelay = useExpressMode ? 2000 : 3500;
    console.log(`[ProxyCheckerCore] Протокол ${protocolUpper}, задержка ${initialDelay}мс`);

    // Сохраняем оригинальную конфигурацию
    let originalConfig: any = null;
    try {
        originalConfig = await new Promise<any>((resolve, reject) => {
            proxyAPI.settings.get({}, (d: any) => {
                if (api.runtime?.lastError) {
                    reject(new Error(api.runtime.lastError.message));
                } else {
                    resolve(d?.value);
                }
            });
        });
        console.log(`[ProxyCheckerCore] Оригинальная конфигурация сохранена`);
    } catch (err) {
        console.error(`[ProxyCheckerCore] Ошибка получения оригинальной конфигурации:`, err);
    }

    // Формируем временную конфигурацию
    let scheme = (proxy.protocol || 'HTTP').toLowerCase();
    if (scheme === 'socks') scheme = 'socks5';
    const tempConfig = {
        mode: "fixed_servers",
        rules: {
            singleProxy: { scheme, host: proxy.host, port: proxy.port },
            bypassList: ["<local>"]
        }
    };
    console.log(`[ProxyCheckerCore] Временная конфигурация:`, tempConfig);

    // Устанавливаем
    await new Promise<void>((resolve, reject) => {
        proxyAPI.settings.set({ value: tempConfig, scope: "regular" }, () => {
            if (api.runtime?.lastError) {
                reject(new Error(api.runtime.lastError.message));
            } else {
                resolve();
            }
        });
    });
    console.log(`[ProxyCheckerCore] Прокси установлен`);

    return { originalConfig, initialDelay };
}

/**
 * English: Restores the original proxy configuration.
 * Russian: Восстанавливает оригинальную конфигурацию прокси.
 */
async function restoreProxyConfig(originalConfig: any): Promise<void> {
    const proxyAPI = api.proxy;
    if (!proxyAPI || !originalConfig) return;
    try {
        await new Promise(r => proxyAPI.settings.set({ value: originalConfig, scope: "regular" }, r));
        console.log(`[ProxyCheckerCore] Оригинальная конфигурация восстановлена`);
    } catch (e) {
        console.warn(`[ProxyCheckerCore] Не удалось восстановить конфигурацию`, e);
    }
}

// ==================== Основная проверка для обычных тестов (Precise / Express) ====================

export async function checkProxy(
    proxy: ProxyServer,
    testUrl: string,
    options: CheckerOptions
): Promise<CheckResult> {
    const startTime = Date.now();
    console.log(`[ProxyCheckerCore] === checkProxy START для ${proxy.host}:${proxy.port} ===`);

    let normalizedUrl = testUrl.trim();
    if (!normalizedUrl) {
        return { alive: false, exact: false, status: "fail", latencyMs: 0, error: "Пустой тестовый URL" };
    }
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
    }
    const mainUrl = normalizedUrl;
    const faviconUrl = mainUrl.replace(/\/$/, '') + '/favicon.ico';

    console.log(`[ProxyCheckerCore] ⚡ Проверка ${proxy.host}:${proxy.port} для ${mainUrl} (таймаут ${options.mainTimeout}мс)`);

    let directIpStr: string | null = null;
    if (Settings.current?.options?.enableDirectIpDetection === true) {
        try {
            directIpStr = await IpServiceManager.getDirectIp();
            console.log(`[ProxyCheckerCore] Прямой IP получен: ${directIpStr || 'null'}`);
        } catch (err) {
            console.error(`[ProxyCheckerCore] Ошибка получения прямого IP:`, err);
        }
    } else {
        console.log(`[ProxyCheckerCore] Определение прямого IP отключено в настройках.`);
    }

    // Применяем прокси
    let originalConfig: any = null;
    let initialDelay: number = 2000;
    try {
        const result = await applyProxyConfig(proxy, options.useExpressMode);
        originalConfig = result.originalConfig;
        initialDelay = result.initialDelay;
    } catch (err) {
        return { alive: false, exact: false, status: "fail", latencyMs: 0, error: String(err) };
    }

    // Прозвон (knock) – короткий fetch к основному URL
    try {
        await fetch(mainUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    } catch (_) { /* ignore */ }
    console.log(`[ProxyCheckerCore] Прозвон выполнен`);

    // Ожидание оседания
    await new Promise(r => setTimeout(r, initialDelay));

    let testCompleted = false;
    let hasIndirectSuccess = false;
    let directIpDetected = false;
    let exactSuccessTriggered = false;
    let mainTabFailed = false;
    let ipCheckCompleted = false;
    let retrievedIp: string | null = null;
    let isMatchHost: boolean = false; // English: true if IP matched proxy host (when direct IP detection disabled)
    let finalResult: CheckResult = { alive: false, exact: false, status: "fail", latencyMs: 0 };

    // IP-проверка через fetch (без вкладок)
    const ipCheckTimer = setTimeout(async () => {
        if (testCompleted) return;
        console.log(`%c[ProxyCheckerCore] Запуск проверки IP через прокси...`, 'color: #ff8800');
        let ip: string | null = null;
        try {
            const skipDirectIp = Settings.current?.options?.enableDirectIpDetection !== true;
            ip = await IpServiceManager.fetchIpViaProxy(proxy, true, skipDirectIp);
        } catch (err) {
            console.error(`[ProxyCheckerCore] Ошибка fetchIpViaProxy:`, err);
        }
        ipCheckCompleted = true;
        if (testCompleted) return;

        if (ip) {
            retrievedIp = ip;
            let isMatch = false;
            let isSameSubnetMatch = false;
            if (directIpStr !== null) {
                if (ip === directIpStr) {
                    isMatch = true;
                }
            } else {
                if (isValidIp(proxy.host) && ip === proxy.host) {
                    isMatch = true;
                } else if (isValidIp(proxy.host) && isSameSubnet(proxy.host, ip, 24)) {
                    isMatch = true;
                    isSameSubnetMatch = true;
                    console.log(`%c[ProxyCheckerCore] ☑️ Косвенный успех (IP в одной подсети с хостом): ${ip}`, 'color: #ffa500');
                }
            }
            if (isMatch) {
                if (Settings.current?.options?.enableDirectIpDetection === true) {
                    directIpDetected = true;
                    console.log(`%c[ProxyCheckerCore] ⚠️ Прямой IP (эталон) обнаружен: ${ip}`, 'color: #ff0000');
                } else {
                    // English: IP matches proxy host (or same subnet) – this is indirect success
                    // Russian: IP совпадает с хостом прокси (или подсетью) – это косвенный успех
                    hasIndirectSuccess = true;
                    isMatchHost = true; // remember that this was a host match
                    if (!isSameSubnetMatch) {
                        console.log(`%c[ProxyCheckerCore] ☑️ Косвенный успех (прокси вернул свой IP): ${ip}`, 'color: #ffa500');
                    }
                }
            } else {
                const directIpEnabled = Settings.current?.options?.enableDirectIpDetection === true;
                if (directIpEnabled) {
                    console.log(`%c[ProxyCheckerCore] IP через прокси: ${ip} (отличается от прямого IP)`, 'color: #ffa500');
                } else {
                    console.log(`%c[ProxyCheckerCore] IP через прокси: ${ip} (неизвестно, прямой или через прокси)`, 'color: #ffa500');
                }
                // We still set hasIndirectSuccess to true so the test doesn't fail prematurely
                // but we will later decide between indirect and ip-only based on isMatchHost
                hasIndirectSuccess = true;
                isMatchHost = false;
            }
        } else {
            console.log(`[ProxyCheckerCore] IP не получен`);
        }
        await decideFinalResult();
    }, options.ipCheckDelay);

    // Fetch основного URL и фавикона
    const mainFetch = async (url: string, timeoutMs: number): Promise<boolean> => {
        console.log(`[ProxyCheckerCore] ⏳ Fetch основного URL: ${url}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'error',
                headers: { 'Accept': 'text/html,application/xhtml+xml' }
            });
            clearTimeout(timeoutId);
            console.log(`[ProxyCheckerCore] ${response.ok ? '✅' : '❌'} Основной URL ответ: ${response.status} ${response.statusText}`);
            return response.ok;
        } catch (err) {
            clearTimeout(timeoutId);
            console.log(`[ProxyCheckerCore] ❌ Ошибка основного URL: ${err.message}`);
            return false;
        }
    };

    const faviconFetch = async (url: string, timeoutMs: number): Promise<boolean> => {
        console.log(`[ProxyCheckerCore] ⏳ Fetch фавикона: ${url}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'error',
                headers: { 'Accept': 'image/*' }
            });
            clearTimeout(timeoutId);
            const ok = response.ok && !response.url.includes('error') && !response.url.includes('404');
            console.log(`[ProxyCheckerCore] ${ok ? '✅' : '❌'} Фавикон ответ: ${response.status} ${response.statusText}`);
            return ok;
        } catch (err) {
            clearTimeout(timeoutId);
            console.log(`[ProxyCheckerCore] ❌ Ошибка фавикона: ${err.message}`);
            return false;
        }
    };

    const decideFinalResult = async () => {
        if (testCompleted) return;
        // English: If IP check is not completed, wait 100ms and try again
        // Russian: Если IP-проверка не завершена, ждём 100мс и повторяем
        if (!ipCheckCompleted) {
            setTimeout(() => decideFinalResult(), 100);
            return;
        }
        if (testCompleted) return;

        if (exactSuccessTriggered) {
            await finishTest("success");
            return;
        }

        if (hasIndirectSuccess) {
            if (mainTabFailed) {
                // English: Determine if this is a real indirect success or just unknown
                // Russian: Определяем, является ли это реальным косвенным успехом или просто неизвестно
                const directIpEnabled = Settings.current?.options?.enableDirectIpDetection === true;
                let isRealIndirect = false;
                if (directIpEnabled) {
                    // English: If direct IP detection is enabled and IP differs from direct IP, it's indirect success
                    // Russian: Если определение прямого IP включено и IP отличается от прямого, это косвенный успех
                    isRealIndirect = true; // hasIndirectSuccess already means it differs from direct IP
                } else {
                    // English: If direct IP detection is disabled, only host match is real indirect success
                    // Russian: Если определение прямого IP отключено, только совпадение с хостом — реальный косвенный успех
                    isRealIndirect = isMatchHost;
                }

                if (isRealIndirect) {
                    console.log(`%c[ProxyCheckerCore] ☑️ Косвенный успех (страница не загружена)`, 'color: #0088ff');
                    await finishTest("indirect", "Косвенный успех (страница не загружена)");
                } else {
                    console.log(`%c[ProxyCheckerCore] Неизвестно (IP получен, страница не загружена)`, 'color: #ffa500');
                    await finishTest("ip-only", "Неизвестно (IP получен, страница не загружена)");
                }
                return;
            }
            if (!extendedTimer) {
                console.log(`[ProxyCheckerCore] Косвенный успех, продлеваем до ${options.extendedTimeout}мс`);
                extendedTimer = setTimeout(() => {
                    if (!testCompleted && hasIndirectSuccess && !exactSuccessTriggered) {
                        console.log(`%c[ProxyCheckerCore] Косвенный успех по истечении расширенного таймаута`, 'color: #ffaa00');
                        finishTest("indirect");
                    }
                }, options.extendedTimeout);
            }
            return;
        }

        if (directIpDetected) {
            if (Settings.current?.options?.enableDirectIpDetection === false) {
                await finishTest("fail", "Прокси возвращает свой IP (эталон)");
                return;
            }
            if (options.retryOnDirectIp) {
                console.log(`[ProxyCheckerCore] Прямой IP, повторная проверка`);
                await finishTest("fail", "DIRECT_IP_RETRY");
                return;
            }
        }

        if (mainTabFailed && ipCheckCompleted) {
            // English: If IP was retrieved even though main tab failed, treat as ip-only (unknown)
            // Russian: Если IP был получен, даже если основная вкладка не загрузилась, считаем неизвестным (ip-only)
            if (retrievedIp !== null) {
                await finishTest("ip-only", "Неизвестно (IP получен, страница не загружена)");
            } else {
                await finishTest("fail", "Прокси не работает");
            }
        }
    };

    const finishTest = async (status: "success" | "indirect" | "ip-only" | "fail", error?: string) => {
        if (testCompleted) return;
        testCompleted = true;
        const alive = status === "success" || status === "indirect" || status === "ip-only";
        const exact = status === "success";
        finalResult = { alive, exact, status, latencyMs: Date.now() - startTime, ip: retrievedIp, error };

        clearTimeout(mainTimeoutId);
        clearTimeout(extendedTimer);
        clearTimeout(ipCheckTimer);

        // Восстанавливаем оригинальный прокси
        await restoreProxyConfig(originalConfig);

        const latency = finalResult.latencyMs;
        if (alive && exact) {
            console.log(`%c✅ УСПЕХ: ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #00ff00; font-weight: bold; font-size: 1.4em');
        } else if (status === "ip-only") {
            console.log(`%c❔ НЕИЗВЕСТНО (IP получен, страница не загружена): ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #ffa500; font-weight: bold; font-size: 1.4em');
        } else if (alive && !exact) {
            console.log(`%c☑️ КОСВЕННЫЙ УСПЕХ: ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #0088ff; font-weight: bold; font-size: 1.4em');
        } else {
            console.log(`%c❌ НЕУДАЧА: ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #ff3333; font-weight: bold; font-size: 1.4em');
        }
    };

    let extendedTimer: any = null;
    let mainTimeoutId: any = null;

    try {
        // Запускаем основные fetch запросы
        console.log(`[ProxyCheckerCore] 🌐 Запрос к основному URL: ${mainUrl}`);
        const mainFetchPromise = mainFetch(mainUrl, options.mainTimeout);
        console.log(`[ProxyCheckerCore] 🌐 Запрос к фавикону: ${faviconUrl}`);
        const faviconFetchPromise = faviconFetch(faviconUrl, options.mainTimeout);

        const [mainOk, favOk] = await Promise.all([mainFetchPromise, faviconFetchPromise]);
        if (testCompleted) return;

        const mainSuccess = mainOk;
        const faviconSuccess = favOk;

        if (mainSuccess || faviconSuccess) {
            exactSuccessTriggered = true;
            if (mainSuccess) console.log(`%c[ProxyCheckerCore] ★ Получен ответ 200 от основного URL`, 'color: #00ff00; font-weight: bold');
            if (faviconSuccess) console.log(`%c[ProxyCheckerCore] ★ Получен фавикон`, 'color: #00ff00; font-weight: bold');
        } else {
            mainTabFailed = true;
        }

        await decideFinalResult();

        // Основной таймаут
        mainTimeoutId = setTimeout(() => {
            if (!testCompleted) {
                console.log(`%c[ProxyCheckerCore] Таймаут ${options.mainTimeout}мс`, 'color: #ffaa00');
                mainTabFailed = true;
                decideFinalResult();
            }
        }, options.mainTimeout);

        while (!testCompleted) {
            await new Promise(r => setTimeout(r, 100));
        }

        if (!finalResult.alive && finalResult.error === "DIRECT_IP_RETRY" && options.retryOnDirectIp) {
            console.log(`[ProxyCheckerCore] Повторная проверка без retry`);
            const newOptions = { ...options, retryOnDirectIp: false };
            return checkProxy(proxy, testUrl, newOptions);
        }

        return finalResult;

    } catch (err: any) {
        console.error(`[ProxyCheckerCore] Критическая ошибка:`, err);
        await finishTest("fail", err.message);
        return finalResult;
    } finally {
        await restoreProxyConfig(originalConfig);
    }
}

// ==================== Проверка для циклических тестов (Cycle / Express-Cycle) ====================

export async function checkCycleProxy(
    proxy: { id: string; name: string; host: string; port: number; protocol: string },
    testUrl: string,
    directIp: string | null,
    options: CycleCheckOptions,
    cancelRequested: () => boolean
): Promise<CycleCheckResult> {
    const startTime = Date.now();
    let normalizedUrl = testUrl.trim();
    if (!normalizedUrl) {
        return { status: "fail", latencyMs: 0, error: "Пустой тестовый URL" };
    }
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
    }
    const mainUrl = normalizedUrl;
    const faviconUrl = mainUrl.replace(/\/$/, '') + '/favicon.ico';

    console.log(`[ProxyCheckerCore][Cycle] Проверка ${proxy.host}:${proxy.port} для ${mainUrl}`);

    let testCompleted = false;
    let hasIndirectSuccess = false;
    let directIpDetected = false;
    let exactSuccessTriggered = false;
    let mainTabFailed = false;
    let ipCheckCompleted = false;
    let retrievedIp: string | null = null;
    let isMatchHost: boolean = false;
    let finalResult: CycleCheckResult = { status: "fail", latencyMs: 0 };

    // IP-проверка через fetch (без вкладок)
    const ipCheckTimer = setTimeout(async () => {
        if (testCompleted) return;
        console.log(`[ProxyCheckerCore][Cycle] Запуск проверки IP...`);
        let ip: string | null = null;
        try {
            const skipDirectIp = Settings.current?.options?.enableDirectIpDetection !== true;
            ip = await IpServiceManager.fetchIpViaProxy(proxy, true, skipDirectIp);
        } catch (err) {
            console.error(`[ProxyCheckerCore][Cycle] Ошибка fetchIpViaProxy:`, err);
        }
        ipCheckCompleted = true;
        if (testCompleted) return;
        if (ip) {
            retrievedIp = ip;
            let isMatch = false;
            let isSameSubnetMatch = false;
            if (directIp !== null) {
                if (ip === directIp) {
                    isMatch = true;
                }
            } else {
                if (isValidIp(proxy.host) && ip === proxy.host) {
                    isMatch = true;
                } else if (isValidIp(proxy.host) && isSameSubnet(proxy.host, ip, 24)) {
                    isMatch = true;
                    isSameSubnetMatch = true;
                    console.log(`%c[ProxyCheckerCore][Cycle] ☑️ Косвенный успех (IP в одной подсети с хостом): ${ip}`, 'color: #ffa500');
                }
            }
            if (isMatch) {
                if (Settings.current?.options?.enableDirectIpDetection === true) {
                    directIpDetected = true;
                    console.log(`%c[ProxyCheckerCore][Cycle] ⚠️ Прямой IP (эталон) обнаружен: ${ip}`, 'color: #ff0000');
                } else {
                    hasIndirectSuccess = true;
                    isMatchHost = true;
                    if (!isSameSubnetMatch) {
                        console.log(`%c[ProxyCheckerCore][Cycle] ☑️ Косвенный успех (прокси вернул свой IP): ${ip}`, 'color: #ffa500');
                    }
                }
            } else {
                const directIpEnabled = Settings.current?.options?.enableDirectIpDetection === true;
                if (directIpEnabled) {
                    console.log(`%c[ProxyCheckerCore][Cycle] IP через прокси: ${ip} (отличается от прямого IP)`, 'color: #ffa500');
                } else {
                    console.log(`%c[ProxyCheckerCore][Cycle] IP через прокси: ${ip} (неизвестно, прямой или через прокси)`, 'color: #ffa500');
                }
                hasIndirectSuccess = true;
                isMatchHost = false;
            }
        } else {
            console.log(`[ProxyCheckerCore][Cycle] IP не получен`);
        }
        await decideFinalResult();
    }, options.ipCheckDelay);

    // Fetch основного URL и фавикона
    const mainFetch = async (url: string, timeoutMs: number): Promise<boolean> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'error',
                headers: { 'Accept': 'text/html,application/xhtml+xml' }
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (err) {
            clearTimeout(timeoutId);
            return false;
        }
    };

    const faviconFetch = async (url: string, timeoutMs: number): Promise<boolean> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                cache: 'no-store',
                redirect: 'error',
                headers: { 'Accept': 'image/*' }
            });
            clearTimeout(timeoutId);
            return response.ok && !response.url.includes('error') && !response.url.includes('404');
        } catch (err) {
            clearTimeout(timeoutId);
            return false;
        }
    };

    const decideFinalResult = async () => {
        if (testCompleted) return;
        // English: If IP check is not completed, wait 100ms and try again
        // Russian: Если IP-проверка не завершена, ждём 100мс и повторяем
        if (!ipCheckCompleted) {
            setTimeout(() => decideFinalResult(), 100);
            return;
        }
        if (testCompleted) return;

        if (exactSuccessTriggered) {
            await finishTest("success");
            return;
        }

        if (hasIndirectSuccess) {
            if (mainTabFailed) {
                // English: Determine if this is a real indirect success or just unknown
                // Russian: Определяем, является ли это реальным косвенным успехом или просто неизвестно
                const directIpEnabled = Settings.current?.options?.enableDirectIpDetection === true;
                let isRealIndirect = false;
                if (directIpEnabled) {
                    // English: If direct IP detection is enabled and IP differs from direct IP, it's indirect success
                    // Russian: Если определение прямого IP включено и IP отличается от прямого, это косвенный успех
                    isRealIndirect = true; // hasIndirectSuccess already means it differs from direct IP
                } else {
                    // English: If direct IP detection is disabled, only host match is real indirect success
                    // Russian: Если определение прямого IP отключено, только совпадение с хостом — реальный косвенный успех
                    isRealIndirect = isMatchHost;
                }

                if (isRealIndirect) {
                    console.log(`%c[ProxyCheckerCore][Cycle] ☑️ Косвенный успех (страница не загружена)`, 'color: #0088ff');
                    await finishTest("indirect", "Косвенный успех (страница не загружена)");
                } else {
                    console.log(`%c[ProxyCheckerCore][Cycle] Неизвестно (IP получен, страница не загружена)`, 'color: #ffa500');
                    await finishTest("ip-only", "Неизвестно (IP получен, страница не загружена)");
                }
                return;
            }
            if (!extendedTimer) {
                console.log(`[ProxyCheckerCore][Cycle] Косвенный успех, ожидание ${options.extendedTimeout}мс`);
                extendedTimer = setTimeout(() => {
                    if (!testCompleted && hasIndirectSuccess && !exactSuccessTriggered) {
                        console.log(`[ProxyCheckerCore][Cycle] Косвенный успех по таймауту`);
                        finishTest("indirect");
                    }
                }, options.extendedTimeout);
            }
            return;
        }

        if (directIpDetected) {
            if (Settings.current?.options?.enableDirectIpDetection === false) {
                await finishTest("fail", "Прокси возвращает свой IP (эталон)");
                return;
            }
            if (options.retryOnDirectIp) {
                console.log(`[ProxyCheckerCore][Cycle] Прямой IP, повторная проверка`);
                await finishTest("fail", "DIRECT_IP_RETRY");
                return;
            }
        }

        if (mainTabFailed && ipCheckCompleted) {
            // English: If IP was retrieved even though main tab failed, treat as ip-only (unknown)
            // Russian: Если IP был получен, даже если основная вкладка не загрузилась, считаем неизвестным (ip-only)
            if (retrievedIp !== null) {
                await finishTest("ip-only", "Неизвестно (IP получен, страница не загружена)");
            } else {
                await finishTest("fail", "Прокси не работает");
            }
        }
    };

    const finishTest = async (status: "success" | "indirect" | "ip-only" | "fail", error?: string) => {
        if (testCompleted) return;
        testCompleted = true;
        finalResult = { status, latencyMs: Date.now() - startTime, error };

        clearTimeout(mainTimeoutId);
        clearTimeout(extendedTimer);
        clearTimeout(ipCheckTimer);

        const latency = finalResult.latencyMs;
        if (status === "success") {
            console.log(`%c✅ УСПЕХ (цикл): ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #00ff00; font-weight: bold; font-size: 1.4em');
        } else if (status === "ip-only") {
            console.log(`%c❔ НЕИЗВЕСТНО (цикл, IP получен, страница не загружена): ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #ffa500; font-weight: bold; font-size: 1.4em');
        } else if (status === "indirect") {
            console.log(`%c☑️ КОСВЕННЫЙ УСПЕХ (цикл): ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #0088ff; font-weight: bold; font-size: 1.4em');
        } else {
            console.log(`%c❌ НЕУДАЧА (цикл): ${proxy.host}:${proxy.port} (${latency}мс)`, 'color: #ff3333; font-weight: bold; font-size: 1.4em');
        }
    };

    let extendedTimer: any = null;
    let mainTimeoutId: any = null;

    try {
        if (cancelRequested()) {
            return { status: "fail", latencyMs: 0, error: "CANCELLED" };
        }

        // Запускаем основные fetch запросы
        console.log(`[ProxyCheckerCore][Cycle] 🌐 Запрос к основному URL: ${mainUrl}`);
        const mainFetchPromise = mainFetch(mainUrl, options.mainTimeout);
        console.log(`[ProxyCheckerCore][Cycle] 🌐 Запрос к фавикону: ${faviconUrl}`);
        const faviconFetchPromise = faviconFetch(faviconUrl, options.mainTimeout);

        const [mainOk, favOk] = await Promise.all([mainFetchPromise, faviconFetchPromise]);
        if (testCompleted) return;

        const mainSuccess = mainOk;
        const faviconSuccess = favOk;

        if (mainSuccess || faviconSuccess) {
            exactSuccessTriggered = true;
            if (mainSuccess) console.log(`%c[ProxyCheckerCore][Cycle] ★ Получен ответ 200 от основного URL`, 'color: #00ff00; font-weight: bold');
            if (faviconSuccess) console.log(`%c[ProxyCheckerCore][Cycle] ★ Получен фавикон`, 'color: #00ff00; font-weight: bold');
        } else {
            mainTabFailed = true;
        }

        await decideFinalResult();

        // Основной таймаут
        mainTimeoutId = setTimeout(() => {
            if (!testCompleted) {
                console.log(`[ProxyCheckerCore][Cycle] Таймаут ${options.mainTimeout}мс`);
                mainTabFailed = true;
                decideFinalResult();
            }
        }, options.mainTimeout);

        while (!testCompleted) {
            if (cancelRequested()) {
                await finishTest("fail", "CANCELLED");
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }

        if (finalResult.error === "DIRECT_IP_RETRY" && options.retryOnDirectIp) {
            console.log(`[ProxyCheckerCore][Cycle] Повторная проверка без retry`);
            const newOptions = { ...options, retryOnDirectIp: false };
            return checkCycleProxy(proxy, testUrl, directIp, newOptions, cancelRequested);
        }

        return finalResult;

    } catch (err: any) {
        console.error(`[ProxyCheckerCore][Cycle] Ошибка:`, err);
        await finishTest("fail", err.message);
        return finalResult;
    }
}