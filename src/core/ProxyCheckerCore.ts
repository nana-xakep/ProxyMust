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
import { api, environment } from "../lib/environment";
import { IpServiceManager } from "./IpServiceManager";
import { Settings } from "./Settings";
import { Core } from "./Core";
import { CountryCode } from "../lib/CountryCode";
import { detectWorkingProtocol } from "./ProtocolTester";
import { SettingsOperation } from "./SettingsOperation";
import { TestManager } from "./TestManager";

// ==================== Utility functions ====================
function isValidIp(ip: string): boolean {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => {
            const num = Number(part);
            return num >= 0 && num <= 255 && part === String(num);
        });
    }
    const ipv6Pattern = /^([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}$/i;
    return ipv6Pattern.test(ip);
}

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
    skipApplyProxy?: boolean;
    skipProtocolDetection?: boolean;
}

export interface CheckResult {
    alive: boolean;
    exact: boolean;
    status: "success" | "indirect" | "ip-only" | "fail";
    latencyMs: number;
    ip?: string | null;
    error?: string;
    detectedProtocol?: string;
    protocolChanged?: boolean;
}

export interface CycleCheckResult {
    status: "success" | "indirect" | "ip-only" | "fail";
    latencyMs: number;
    error?: string;
    detectedProtocol?: string;
    protocolChanged?: boolean;
}

export interface CycleCheckOptions {
    mainTimeout: number;
    extendedTimeout: number;
    faviconInterval: number;
    ipCheckDelay: number;
    retryOnDirectIp: boolean;
    skipProtocolDetection?: boolean;
    skipApplyProxy?: boolean;
}

// ==================== Прокси-конфиг: установка и восстановление ====================
// (Оставляем для checkProxy, но в cycle не используем)

async function applyProxyConfig(
    proxy: { host: string; port: number; protocol: string },
    useExpressMode: boolean
): Promise<{ originalConfig: any; initialDelay: number }> {
    const proxyAPI = api.proxy;
    if (!proxyAPI) {
        throw new Error(api.i18n.getMessage('proxyCheckerNoProxyApi'));
    }

    let initialDelay = useExpressMode ? 1500 : 2000;
    const protocolUpper = (proxy.protocol || 'HTTP').toUpperCase();
    if (protocolUpper.includes('SOCKS5')) initialDelay = useExpressMode ? 3000 : 6500;
    else if (protocolUpper.includes('SOCKS4')) initialDelay = useExpressMode ? 2500 : 5200;
    else if (protocolUpper === 'HTTPS') initialDelay = useExpressMode ? 2000 : 3500;
    console.log(`[ProxyCheckerCore] Протокол ${protocolUpper}, задержка ${initialDelay}мс`);

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
        return { alive: false, exact: false, status: "fail", latencyMs: 0, error: api.i18n.getMessage('proxyCheckerEmptyUrl') };
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

    let originalConfig: any = null;
    let initialDelay: number = 2000;

    if (options.skipApplyProxy) {
        console.log(`[ProxyCheckerCore] skipApplyProxy=true, пропускаем применение прокси`);
        try {
            const proxyAPI = api.proxy;
            if (proxyAPI) {
                originalConfig = await new Promise<any>((resolve, reject) => {
                    proxyAPI.settings.get({}, (d: any) => {
                        if (api.runtime?.lastError) {
                            reject(new Error(api.runtime.lastError.message));
                        } else {
                            resolve(d?.value);
                        }
                    });
                });
                console.log(`[ProxyCheckerCore] Оригинальная конфигурация сохранена (skipApplyProxy)`);
            }
        } catch (err) {
            console.error(`[ProxyCheckerCore] Ошибка получения оригинальной конфигурации:`, err);
        }
    } else {
        try {
            const result = await applyProxyConfig(proxy, options.useExpressMode);
            originalConfig = result.originalConfig;
            initialDelay = result.initialDelay;
        } catch (err) {
            return { alive: false, exact: false, status: "fail", latencyMs: 0, error: String(err) };
        }
    }

    try {
        await fetch(mainUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    } catch (_) { /* ignore */ }
    console.log(`[ProxyCheckerCore] Прозвон выполнен`);

    await CountryCode.ensureInitialized();

    Core.sendTestLogStep({
        type: 'start',
        proxyId: proxy.id || 'unknown',
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol,
        countryCode: proxy.countryCode || CountryCode.getCountryCode(proxy.host) || '',
    });

    await new Promise(r => setTimeout(r, initialDelay));

    let testCompleted = false;
    let isMatch = false;
    let hasIndirectSuccess = false;
    let directIpDetected = false;
    let exactSuccessTriggered = false;
    let mainTabFailed = false;
    let ipCheckCompleted = false;
    let retrievedIp: string | null = null;
    let isMatchHost: boolean = false;
    let finalResult: CheckResult = { alive: false, exact: false, status: "fail", latencyMs: 0 };
    let skipRestore = false;
//    let protocolDetectionInProgress = false; // English: flag to suppress status log during protocol detection / Russian: флаг для подавления лога статуса во время автоопределения протокола

    let ipCheckResolve: (() => void) | null = null;
    const ipCheckPromise = new Promise<void>((resolve) => {
        ipCheckResolve = resolve;
    });

    const performIpCheck = async () => {
        if (testCompleted) {
            if (ipCheckResolve) ipCheckResolve();
            return;
        }
        console.log(`%c[ProxyCheckerCore] Запуск проверки IP через прокси...`, 'color: #ff8800');
        let ip: string | null = null;
        try {
            const skipDirectIp = Settings.current?.options?.enableDirectIpDetection !== true;
            ip = await IpServiceManager.fetchIpViaProxy(proxy, true, skipDirectIp);
        } catch (err) {
            console.error(`[ProxyCheckerCore] Ошибка fetchIpViaProxy:`, err);
        }
        ipCheckCompleted = true;
        retrievedIp = ip;

        if (!testCompleted && ip) {
            isMatch = false;
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
                    hasIndirectSuccess = true;
                    isMatchHost = true;
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
                hasIndirectSuccess = true;
                isMatchHost = false;
            }
            Core.sendTestLogStep({
                type: 'ip',
                proxyId: proxy.id || 'unknown',
                ip: ip,
                directIp: directIpStr,
                isMatch: isMatch,
                success: true
            });
        } else if (!testCompleted) {
            console.log(`[ProxyCheckerCore] IP не получен`);
            Core.sendTestLogStep({
                type: 'ip',
                proxyId: proxy.id || 'unknown',
                ip: null,
                directIp: directIpStr,
                isMatch: false,
                success: false
            });
        }

        if (ipCheckResolve) ipCheckResolve();
    };

    performIpCheck();

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
        if (!ipCheckCompleted) {
            setTimeout(() => decideFinalResult(), 100);
            return;
        }
        if (testCompleted) return;

        // English: Determine if protocol auto-detection will be attempted
        // Russian: Определяем, будет ли выполнено автоопределение протокола
        const willAutoDetect = !options.skipProtocolDetection &&
                               Settings.current?.options?.autoDetectProtocol !== false &&
                               finalResult?.status === "fail" &&
                               !finalResult?.protocolChanged;

        if (exactSuccessTriggered) {
            await finishTest("success");
            return;
        }

        if (hasIndirectSuccess) {
            if (mainTabFailed) {
                const directIpEnabled = Settings.current?.options?.enableDirectIpDetection === true;
                let isRealIndirect = false;
                if (directIpEnabled) {
                    isRealIndirect = true;
                } else {
                    isRealIndirect = isMatchHost;
                }

                if (isRealIndirect) {
                    console.log(`%c[ProxyCheckerCore] ☑️ Косвенный успех (страница не загружена)`, 'color: #0088ff');
                    await finishTest("indirect", api.i18n.getMessage('proxyCheckerIndirectSuccessPageNotLoaded'));
                } else {
                    console.log(`%c[ProxyCheckerCore] Неизвестно (IP получен, страница не загружена)`, 'color: #ffa500');
                    await finishTest("ip-only", api.i18n.getMessage('proxyCheckerUnknownIpOnly'));
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
                await finishTest("fail", api.i18n.getMessage('proxyCheckerProxyReturnsOwnIp'), !willAutoDetect);
                return;
            }
            if (options.retryOnDirectIp) {
                console.log(`[ProxyCheckerCore] Прямой IP, повторная проверка`);
                skipRestore = true;
                await finishTest("fail", "DIRECT_IP_RETRY", !willAutoDetect);
                return;
            }
        }

        if (mainTabFailed && ipCheckCompleted) {
            if (retrievedIp !== null) {
                await finishTest("ip-only", api.i18n.getMessage('proxyCheckerUnknownIpOnly'));
            } else {
                await finishTest("fail", api.i18n.getMessage('proxyCheckerProxyNotWorking'), !willAutoDetect);
            }
        }
    };

    const finishTest = async (status: "success" | "indirect" | "ip-only" | "fail", error?: string, sendLog: boolean = true, protocolOverride?: string) => {
        if (testCompleted) return;
        testCompleted = true;
        if (sendLog) {
            Core.sendTestLogStep({
                type: 'status',
                proxyId: proxy.id || 'unknown',
                status: status,
                statusText: status,
                host: proxy.host,
                port: proxy.port,
                protocol: protocolOverride || proxy.protocol,
                countryCode: proxy.countryCode || CountryCode.getCountryCode(proxy.host) || ''
            });
        }
        const alive = status === "success" || status === "indirect" || status === "ip-only";
        const exact = status === "success";
        finalResult = { alive, exact, status, latencyMs: Date.now() - startTime, ip: retrievedIp, error };

        clearTimeout(mainTimeoutId);
        clearTimeout(extendedTimer);

        if (!skipRestore) {
            await restoreProxyConfig(originalConfig);
        }

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
        console.log(`[ProxyCheckerCore] 🌐 Запрос к основному URL: ${mainUrl}`);
        // English: Send log message that site check is starting
        // Russian: Отправляем сообщение о начале проверки сайта
        Core.sendTestLogStep({
            type: 'info',
            message: api.i18n.getMessage('proxyCheckerCheckingSite').replace('{0}', mainUrl),
            timestamp: Date.now()
        });

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

        Core.sendTestLogStep({
            type: 'page',
            proxyId: proxy.id || 'unknown',
            site: mainUrl,
            pageSuccess: mainSuccess || faviconSuccess
        });

        await ipCheckPromise;
        await decideFinalResult();

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

        // ==================== Обработка прямого IP с переключением профиля ====================
        if (finalResult.error === "DIRECT_IP_RETRY" && options.retryOnDirectIp) {
            console.log(`[ProxyCheckerCore] DIRECT_IP_RETRY detected, forcing proxy application and retesting...`);
            const proxyId = proxy.id || `${proxy.host}:${proxy.port}`;
            await TestManager.switchToAlwaysEnabledProfile();
            await TestManager.setProxyAndWait(proxyId);
            await new Promise(r => setTimeout(r, 1500));

            const retestOptions: CheckerOptions = {
                ...options,
                skipApplyProxy: true,
                retryOnDirectIp: false
            };
            console.log(`[ProxyCheckerCore] 🔁 Retesting ${proxy.host}:${proxy.port} after forcing proxy application...`);
            const retestResult = await checkProxy(proxy, testUrl, retestOptions);
            finalResult = {
                ...retestResult,
                detectedProtocol: retestResult.detectedProtocol,
                protocolChanged: retestResult.protocolChanged
            };
            await restoreProxyConfig(originalConfig);
        }
        // ==================== End обработки прямого IP ====================

        // ==================== Protocol Auto-Detection ====================
        if (!options.skipProtocolDetection &&
            Settings.current?.options?.autoDetectProtocol !== false &&
            finalResult.status === "fail" &&
            !finalResult.protocolChanged) {

            // English: Set flag to suppress status logging from finishTest during detection
            // Russian: Устанавливаем флаг, чтобы подавить логирование статуса из finishTest во время поиска
//            protocolDetectionInProgress = true;

            const proxyId = proxy.id || `${proxy.host}:${proxy.port}`;
            const attempts = (global as any).__protocolAutoDetectionAttempts?.[proxyId] || 0;

            if (attempts < 1) {
                if (!(global as any).__protocolAutoDetectionAttempts) {
                    (global as any).__protocolAutoDetectionAttempts = {};
                }
                (global as any).__protocolAutoDetectionAttempts[proxyId] = attempts + 1;

                console.log(`[ProxyCheckerCore] 🔁 Proxy ${proxy.host}:${proxy.port} failed with protocol ${proxy.protocol}. Trying to detect working protocol... (attempt ${attempts + 1})`);

                const detectionResult = await detectWorkingProtocol(
                    proxy,
                    testUrl,
                    options,
                    finalResult,
                    true,
                    attempts,
                    () => false
                );

                if (detectionResult && detectionResult.switched) {
                    const newProtocol = detectionResult.protocol;
                    console.log(`%c[ProxyCheckerCore] ✅ Working protocol found: ${newProtocol} for ${proxy.host}:${proxy.port}`, 'color: #00ff88; font-weight: bold');

                    if (proxyId) {
                        const settingsProxy = Settings.current?.proxyServers?.find((p: any) => p.id === proxyId);
                        if (settingsProxy) {
                            settingsProxy.protocol = newProtocol;
                            console.log(`[ProxyCheckerCore] ✅ Protocol saved in Settings: ${proxy.host}:${proxy.port} -> ${newProtocol}`);
                            SettingsOperation.saveProxyServers();
                            SettingsOperation.saveAllSync(false);
                            Settings.updateActiveSettings();
                            try {
                                api.runtime.sendMessage({
                                    command: "PROXY_PROTOCOL_CHANGED",
                                    proxyId: proxyId,
                                    newProtocol: newProtocol
                                });
                            } catch (e) { /* ignore */ }
                        } else {
                            console.warn(`[ProxyCheckerCore] ⚠️ Proxy ${proxyId} not found in Settings`);
                        }
                    }

                    // Применяем прокси через стандартный механизм
                    await TestManager.switchToAlwaysEnabledProfile();
                    const updatedProxy = SettingsOperation.findProxyServerById(proxyId);
                    if (updatedProxy) {
                        await TestManager.setProxyAndWait(updatedProxy.id);
                        await new Promise(r => setTimeout(r, 1500));
                    } else {
                        await TestManager.setProxyAndWait(proxy.id);
                    }

                    const retestOptions: CheckerOptions = {
                        ...options,
                        skipProtocolDetection: true,
                        skipApplyProxy: true
                    };
                    // English: Use updatedProxy for retest (with new protocol) if available, otherwise create a copy with new protocol
                    // Russian: Используем updatedProxy для ретеста (с новым протоколом) если доступен, иначе создаём копию с новым протоколом
                    const retestProxy = updatedProxy || Object.assign({}, proxy, { protocol: newProtocol });
                    console.log(`[ProxyCheckerCore] 🔁 Retesting ${retestProxy.host}:${retestProxy.port} with new protocol ${newProtocol}...`);
                    const retestResult = await checkProxy(retestProxy, testUrl, retestOptions);

                    let finalStatus = retestResult.status;
                    let finalIp = retestResult.ip;
                    if (detectionResult.switched) {
                        if (retestResult.status === "fail") {
                            finalStatus = "indirect";
                            if (detectionResult.result && detectionResult.result.ip) {
                                finalIp = detectionResult.result.ip;
                            }
                        } else {
                            finalStatus = retestResult.status;
                            finalIp = retestResult.ip || (detectionResult.result ? detectionResult.result.ip : null);
                        }
                    }

                    finalResult = {
                        ...retestResult,
                        status: finalStatus,
                        alive: finalStatus === "success" || finalStatus === "indirect" || finalStatus === "ip-only",
                        ip: finalIp,
                        detectedProtocol: newProtocol,
                        protocolChanged: true
                    };
                    delete (global as any).__protocolAutoDetectionAttempts[proxyId];

                    // English: Finish test with corrected status and new protocol
                    // Russian: Завершаем тест с исправленным статусом и новым протоколом
                    await finishTest(finalStatus, undefined, true, newProtocol);
                } else {
                    console.log(`[ProxyCheckerCore] ❌ No working protocol found for ${proxy.host}:${proxy.port}`);
                    // English: Finish test with fail status and old protocol
                    // Russian: Завершаем тест со статусом fail и старым протоколом
                    await finishTest("fail", undefined, true);
                }
            }

            // English: Reset protocol detection flag after detection attempt
            // Russian: Сбрасываем флаг поиска протокола после попытки
 //           protocolDetectionInProgress = false;
        }
        // ==================== End Protocol Auto-Detection ====================

        return finalResult;

    } catch (err: any) {
        console.error(`[ProxyCheckerCore] Критическая ошибка:`, err);
        await finishTest("fail", err.message);
        return finalResult;
    } finally {
        if (!skipRestore) {
            await restoreProxyConfig(originalConfig);
        }
    }
}

// ==================== Проверка для циклических тестов (Cycle / Express-Cycle) ====================
// В этом варианте мы НЕ используем applyProxyConfig, а полагаемся на TestManager
export async function checkCycleProxy(
    proxy: { id: string; name: string; host: string; port: number; protocol: string; countryCode?: string },
    testUrl: string,
    directIp: string | null,
    options: CycleCheckOptions,
    cancelRequested: () => boolean
): Promise<CycleCheckResult> {
    const startTime = Date.now();
    let normalizedUrl = testUrl.trim();
    if (!normalizedUrl) {
        return { status: "fail", latencyMs: 0, error: api.i18n.getMessage('proxyCheckerEmptyUrl') };
    }
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
    }
    const mainUrl = normalizedUrl;
    const faviconUrl = mainUrl.replace(/\/$/, '') + '/favicon.ico';

    console.log(`[ProxyCheckerCore][Cycle] Проверка ${proxy.host}:${proxy.port} для ${mainUrl}`);

    await CountryCode.ensureInitialized();
    const countryCode = (proxy as any).countryCode || CountryCode.getCountryCode(proxy.host) || '';
    Core.sendTestLogStep({
        type: 'start',
        proxyId: proxy.id || 'unknown',
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol,
        countryCode: countryCode,
    });

    let testCompleted = false;
    let isMatch = false;
    let hasIndirectSuccess = false;
    let directIpDetected = false;
    let exactSuccessTriggered = false;
    let mainTabFailed = false;
    let ipCheckCompleted = false;
    let retrievedIp: string | null = null;
    let isMatchHost: boolean = false;
    let finalResult: CycleCheckResult = { status: "fail", latencyMs: 0 };
    let protocolDetectionInProgress = false; // English: flag to suppress status log during protocol detection / Russian: флаг для подавления лога статуса во время автоопределения протокола

    // Здесь НЕТ применения прокси через applyProxyConfig

    let ipCheckResolve: (() => void) | null = null;
    const ipCheckPromise = new Promise<void>((resolve) => {
        ipCheckResolve = resolve;
    });

    const performIpCheck = async () => {
        if (testCompleted) {
            if (ipCheckResolve) ipCheckResolve();
            return;
        }
        console.log(`[ProxyCheckerCore][Cycle] Запуск проверки IP...`);
        let ip: string | null = null;
        try {
            const skipDirectIp = Settings.current?.options?.enableDirectIpDetection !== true;
            ip = await IpServiceManager.fetchIpViaProxy(proxy, true, skipDirectIp);
        } catch (err) {
            console.error(`[ProxyCheckerCore][Cycle] Ошибка fetchIpViaProxy:`, err);
        }
        ipCheckCompleted = true;
        retrievedIp = ip;

        if (!testCompleted && ip) {
            isMatch = false;
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
            Core.sendTestLogStep({
                type: 'ip',
                proxyId: proxy.id || 'unknown',
                ip: ip,
                directIp: directIp,
                isMatch: isMatch,
                success: true
            });
        } else if (!testCompleted) {
            console.log(`[ProxyCheckerCore][Cycle] IP не получен`);
            Core.sendTestLogStep({
                type: 'ip',
                proxyId: proxy.id || 'unknown',
                ip: null,
                directIp: directIp,
                isMatch: false,
                success: false
            });
        }

        if (ipCheckResolve) ipCheckResolve();
    };

    performIpCheck();

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
                const directIpEnabled = Settings.current?.options?.enableDirectIpDetection === true;
                let isRealIndirect = false;
                if (directIpEnabled) {
                    isRealIndirect = true;
                } else {
                    isRealIndirect = isMatchHost;
                }

                if (isRealIndirect) {
                    console.log(`%c[ProxyCheckerCore][Cycle] ☑️ Косвенный успех (страница не загружена)`, 'color: #0088ff');
                    await finishTest("indirect", api.i18n.getMessage('proxyCheckerIndirectSuccessPageNotLoaded'));
                } else {
                    console.log(`%c[ProxyCheckerCore][Cycle] Неизвестно (IP получен, страница не загружена)`, 'color: #ffa500');
                    await finishTest("ip-only", api.i18n.getMessage('proxyCheckerUnknownIpOnly'));
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
                await finishTest("fail", api.i18n.getMessage('proxyCheckerProxyReturnsOwnIp'));
                return;
            }
            if (options.retryOnDirectIp) {
                console.log(`[ProxyCheckerCore][Cycle] Прямой IP, повторная проверка`);
                await finishTest("fail", "DIRECT_IP_RETRY");
                return;
            }
        }

        if (mainTabFailed && ipCheckCompleted) {
            if (retrievedIp !== null) {
                await finishTest("ip-only", api.i18n.getMessage('proxyCheckerUnknownIpOnly'));
            } else {
                await finishTest("fail", api.i18n.getMessage('proxyCheckerProxyNotWorking'));
            }
        }
    };

    const finishTest = async (status: "success" | "indirect" | "ip-only" | "fail", error?: string) => {
        if (testCompleted) return;
        testCompleted = true;
        // English: Do not send status log if protocol detection is in progress (will be sent after retest)
        // Russian: Не отправляем лог статуса, если идёт поиск протокола (будет отправлен после ретеста)
        if (!protocolDetectionInProgress) {
            Core.sendTestLogStep({
                type: 'status',
                proxyId: proxy.id || 'unknown',
                status: status,
                statusText: status,
                host: proxy.host,
                port: proxy.port,
                protocol: proxy.protocol,
                countryCode: (proxy as any).countryCode || CountryCode.getCountryCode(proxy.host) || ''
            });
        }
        finalResult = { status, latencyMs: Date.now() - startTime, error };

        clearTimeout(mainTimeoutId);
        clearTimeout(extendedTimer);

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

        console.log(`[ProxyCheckerCore][Cycle] 🌐 Запрос к основному URL: ${mainUrl}`);
        // English: Send log message that site check is starting
        // Russian: Отправляем сообщение о начале проверки сайта
        Core.sendTestLogStep({
            type: 'info',
            message: api.i18n.getMessage('proxyCheckerCheckingSite').replace('{0}', mainUrl),
            timestamp: Date.now()
        });

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

        Core.sendTestLogStep({
            type: 'page',
            proxyId: proxy.id || 'unknown',
            site: mainUrl,
            pageSuccess: mainSuccess || faviconSuccess
        });

        await ipCheckPromise;
        await decideFinalResult();

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

        // ==================== Обработка прямого IP с переключением профиля для цикла ====================
        if (finalResult.error === "DIRECT_IP_RETRY" && options.retryOnDirectIp) {
            console.log(`[ProxyCheckerCore][Cycle] DIRECT_IP_RETRY detected, forcing proxy application and retesting...`);
            const proxyId = proxy.id || `${proxy.host}:${proxy.port}`;
            await TestManager.switchToAlwaysEnabledProfile();
            await TestManager.setProxyAndWait(proxyId);
            await new Promise(r => setTimeout(r, 1500));

            const retestOptions: CycleCheckOptions = {
                ...options,
                skipApplyProxy: true,
                retryOnDirectIp: false
            };
            console.log(`[ProxyCheckerCore][Cycle] 🔁 Retesting ${proxy.host}:${proxy.port} after forcing proxy application...`);
            const retestResult = await checkCycleProxy(proxy, testUrl, directIp, retestOptions, cancelRequested);
            finalResult = {
                ...retestResult,
                detectedProtocol: retestResult.detectedProtocol,
                protocolChanged: retestResult.protocolChanged
            };
        }
        // ==================== End обработки прямого IP для цикла ====================

        // ==================== Protocol Auto-Detection for Cycle ====================
        if (!options.skipProtocolDetection &&
            Settings.current?.options?.autoDetectProtocol !== false &&
            finalResult.status === "fail" &&
            !finalResult.protocolChanged) {

            // English: Set flag to suppress status logging from finishTest during detection
            // Russian: Устанавливаем флаг, чтобы подавить логирование статуса из finishTest во время поиска
            protocolDetectionInProgress = true;

            const cycleProxyId = proxy.id || `${proxy.host}:${proxy.port}`;
            const attempts = (global as any).__protocolAutoDetectionAttempts?.[cycleProxyId] || 0;

            if (attempts < 1) {
                if (environment.name === "Firefox") {
                    console.log(`[ProxyCheckerCore][Cycle] Firefox: forcing proxy ${proxy.host}:${proxy.port} (${proxy.protocol}) before detection`);
                    await TestManager.switchToAlwaysEnabledProfile();
                    await TestManager.setProxyAndWait(proxy.id);
                    await new Promise(r => setTimeout(r, 500));
                }

                if (!(global as any).__protocolAutoDetectionAttempts) {
                    (global as any).__protocolAutoDetectionAttempts = {};
                }
                (global as any).__protocolAutoDetectionAttempts[cycleProxyId] = attempts + 1;

                console.log(`[ProxyCheckerCore][Cycle] 🔁 Proxy ${proxy.host}:${proxy.port} failed. Trying protocol detection... (attempt ${attempts + 1})`);

                const cycleResult: CheckResult = {
                    alive: true,
                    exact: false,
                    status: finalResult.status,
                    latencyMs: finalResult.latencyMs,
                    ip: retrievedIp,
                    error: finalResult.error
                };

                const checkerOptions: CheckerOptions = {
                    mainTimeout: options.mainTimeout,
                    extendedTimeout: options.extendedTimeout,
                    faviconInterval: options.faviconInterval,
                    ipCheckDelay: options.ipCheckDelay,
                    retryOnDirectIp: options.retryOnDirectIp,
                    useExpressMode: false,
                    skipApplyProxy: false, // не используется, но оставим
                    skipProtocolDetection: true
                };

                const proxyForDetection: ProxyServer = {
                    ...proxy,
                    rating: 0,
                    failoverTimeout: 0,
                    priority: null,
                    createdAt: Date.now(),
                    CopyFrom: function() {},
                    isValid: function() { return true; }
                } as unknown as ProxyServer;

                const detectionResult = await detectWorkingProtocol(
                    proxyForDetection,
                    testUrl,
                    checkerOptions,
                    cycleResult,
                    true,
                    attempts,
                    cancelRequested
                );

                if (detectionResult && detectionResult.switched) {
                    const newProtocol = detectionResult.protocol;
                    console.log(`%c[ProxyCheckerCore][Cycle] ✅ Working protocol found: ${newProtocol} for ${proxy.host}:${proxy.port}`, 'color: #00ff88; font-weight: bold');

                    let updatedProxy: ProxyServer | null = null;
                    if (cycleProxyId) {
                        const settingsProxy = Settings.current?.proxyServers?.find((p: any) => p.id === cycleProxyId);
                        if (settingsProxy) {
                            settingsProxy.protocol = newProtocol;
                            console.log(`[ProxyCheckerCore][Cycle] ✅ Protocol saved in Settings: ${proxy.host}:${proxy.port} -> ${newProtocol}`);
                            SettingsOperation.saveProxyServers();
                            SettingsOperation.saveAllSync(false);
                            Settings.updateActiveSettings();
                            try {
                                api.runtime.sendMessage({
                                    command: "PROXY_PROTOCOL_CHANGED",
                                    proxyId: cycleProxyId,
                                    newProtocol: newProtocol
                                });
                            } catch (e) { /* ignore */ }
                            updatedProxy = Settings.current?.proxyServers?.find((p: any) => p.id === cycleProxyId) || null;
                        } else {
                            console.warn(`[ProxyCheckerCore][Cycle] ⚠️ Proxy ${cycleProxyId} not found in Settings`);
                        }
                    }

                    const retestProxy = updatedProxy || Object.assign({}, proxy, { protocol: newProtocol });

                    // ---- Применяем прокси через унифицированный метод TestManager ----
                    await TestManager.applyProxyAndWait(retestProxy.id, retestProxy.protocol);

                    // Дополнительная проверка готовности (опционально, но оставим)
                    let proxyReady = false;
                    let attempts = 0;
                    while (attempts < 3 && !proxyReady) {
                        await new Promise(r => setTimeout(r, 1000));
                        try {
                            const ip = await IpServiceManager.fetchIpViaProxy(
                                { host: retestProxy.host, port: retestProxy.port, protocol: newProtocol },
                                true,
                                true // skipDirectIp
                            );
                            if (ip) {
                                proxyReady = true;
                                console.log(`[ProxyCheckerCore][Cycle] ✅ Proxy ${retestProxy.host}:${retestProxy.port} ready with IP: ${ip}`);
                            }
                        } catch (e) {
                            console.log(`[ProxyCheckerCore][Cycle] ⏳ Waiting for proxy to be ready (attempt ${attempts + 1})...`);
                        }
                        attempts++;
                    }
                    if (!proxyReady) {
                        console.warn(`[ProxyCheckerCore][Cycle] ⚠️ Proxy ${retestProxy.host}:${retestProxy.port} not ready after ${attempts} attempts, proceeding anyway...`);
                    }

                    const retestOptions: CycleCheckOptions = {
                        ...options,
                        skipProtocolDetection: true,
                        skipApplyProxy: true
                    };
                    console.log(`[ProxyCheckerCore][Cycle] 🔁 Retesting ${retestProxy.host}:${retestProxy.port} with new protocol ${newProtocol} (skipApplyProxy=true)...`);
                    const retestResult = await checkCycleProxy(retestProxy, testUrl, directIp, retestOptions, cancelRequested);

                    let finalStatus = retestResult.status;
                    if (detectionResult.switched) {
                        if (retestResult.status === "fail") {
                            finalStatus = "indirect";
                        } else {
                            finalStatus = retestResult.status;
                        }
                    }

                    finalResult = {
                        ...retestResult,
                        status: finalStatus,
                        detectedProtocol: newProtocol,
                        protocolChanged: true
                    };
                    delete (global as any).__protocolAutoDetectionAttempts[cycleProxyId];

                    // English: Send corrected status to log if protocol was switched
                    // Russian: Отправляем исправленный статус в лог, если протокол был переключён
                    Core.sendTestLogStep({
                        type: 'status',
                        proxyId: proxy.id || 'unknown',
                        status: finalStatus,
                        statusText: finalStatus,
                        host: proxy.host,
                        port: proxy.port,
                        protocol: newProtocol,
                        countryCode: (proxy as any).countryCode || CountryCode.getCountryCode(proxy.host) || ''
                    });
                } else {
                    console.log(`[ProxyCheckerCore][Cycle] ❌ No working protocol found for ${proxy.host}:${proxy.port}`);
                    // English: Send fail status to log if detection failed
                    // Russian: Отправляем статус fail в лог, если поиск не удался
                    Core.sendTestLogStep({
                        type: 'status',
                        proxyId: proxy.id || 'unknown',
                        status: "fail",
                        statusText: "fail",
                        host: proxy.host,
                        port: proxy.port,
                        protocol: proxy.protocol,
                        countryCode: (proxy as any).countryCode || CountryCode.getCountryCode(proxy.host) || ''
                    });
                }
            }

            // English: Reset protocol detection flag after detection attempt
            // Russian: Сбрасываем флаг поиска протокола после попытки
            protocolDetectionInProgress = false;
        }
        // ==================== End Protocol Auto-Detection for Cycle ====================

        return finalResult;

    } catch (err: any) {
        console.error(`[ProxyCheckerCore][Cycle] Ошибка:`, err);
        await finishTest("fail", err.message);
        return finalResult;
    } finally {
        // Ничего не восстанавливаем, т.к. не применяли proxy через applyProxyConfig
    }
}