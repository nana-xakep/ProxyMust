// src/core/ProtocolTester.ts

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
import { Settings } from "./Settings";
import { checkProxy, CheckResult, CheckerOptions } from "./ProxyCheckerCore";
import { Core } from "./Core";
import { environment } from "../lib/environment";
import { TestManager } from "./TestManager";
import { SettingsOperation } from "./SettingsOperation";
import { IpServiceManager } from "./IpServiceManager";

// ==================== Types ====================

export enum ProtocolSwitchMode {
    Probable = 'probable',
    Full = 'full'
}

export interface ProtocolDetectionResult {
    protocol: string;
    result: CheckResult;
    switched: boolean;
    failedProtocols: string[];
}

// ==================== Protocol Tester Core ====================

function isAutoDetectEnabled(): boolean {
    return Settings.current?.options?.autoDetectProtocol !== false;
}

function getProtocolSwitchMode(): ProtocolSwitchMode {
    const mode = Settings.current?.options?.protocolSwitchMode;
    if (mode === ProtocolSwitchMode.Full) {
        return ProtocolSwitchMode.Full;
    }
    return ProtocolSwitchMode.Probable;
}

function isSocksProxy(protocol: string): boolean {
    const upper = protocol.toUpperCase();
    return upper === 'SOCKS4' || upper === 'SOCKS5';
}

function getFallbackProtocols(originalProtocol: string, mode: ProtocolSwitchMode): string[] {
    const upper = originalProtocol.toUpperCase();
    const fallbacks: string[] = [];

    if (mode === ProtocolSwitchMode.Probable) {
        if (isSocksProxy(upper)) {
            fallbacks.push('HTTP');
            if (upper === 'SOCKS5') {
                fallbacks.push('HTTPS');
            }
        } else if (upper === 'HTTP') {
            fallbacks.push('HTTPS');
        } else if (upper === 'HTTPS') {
            fallbacks.push('HTTP');
        }
    } else {
        const allProtocols = ['HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5'];
        for (const proto of allProtocols) {
            if (proto !== upper) {
                fallbacks.push(proto);
            }
        }
    }

    return fallbacks;
}

/**
 * English: Checks if the proxy is ready and returns IP if successful
 * Russian: Проверяет готовность прокси и возвращает IP в случае успеха
 */
async function checkProxyReady(proxyId: string): Promise<{ ready: boolean; ip?: string }> {
    const proxy = SettingsOperation.findProxyServerById(proxyId);
    if (!proxy) {
        console.log(`[ProtocolTester] Прокси ${proxyId} не найден`);
        return { ready: false };
    }
    try {
        const ip = await IpServiceManager.fetchIpViaProxy(
            { host: proxy.host, port: proxy.port, protocol: proxy.protocol },
            true,   // retryForSticky
            true    // skipDirectIp
        );
        if (ip) {
            console.log(`[ProtocolTester] ✅ Прокси ${proxyId} готов, IP: ${ip}`);
            return { ready: true, ip };
        }
        return { ready: false };
    } catch (err) {
        console.log(`[ProtocolTester] Ошибка получения IP для ${proxyId}:`, err);
        return { ready: false };
    }
}

/**
 * English: Tests a proxy with a specific protocol and returns the result
 * Russian: Проверяет прокси с определённым протоколом и возвращает результат
 */
async function testWithProtocol(
    proxy: ProxyServer,
    testUrl: string,
    protocol: string,
    options: CheckerOptions
): Promise<CheckResult> {
    console.log(`[ProtocolTester] ⏳ Проверка ${proxy.host}:${proxy.port} с протоколом ${protocol}`);

    // English: Create a copy of the proxy with the new protocol
    // Russian: Создаём копию прокси с новым протоколом
    const testProxy = Object.assign(Object.create(Object.getPrototypeOf(proxy)), proxy);
    testProxy.protocol = protocol;

    // English: For Firefox, use the same mechanism as cycle test: temporary proxy + PopupChangeActiveProxyServer
    // Russian: Для Firefox используем тот же механизм, что и в циклическом тесте: временный прокси + PopupChangeActiveProxyServer
    let tempProxyId: string | null = null;
    let originalProxyServers: ProxyServer[] = [];

    if (environment.name === "Firefox") {
        console.log(`[ProtocolTester] Firefox: применение прокси ${testProxy.host}:${testProxy.port} с протоколом ${protocol} через временный прокси`);

        // 1. Создаём временный прокси с новым протоколом и добавляем его в Settings
        const tempProxy = new ProxyServer();
        tempProxy.CopyFrom(testProxy);
        tempProxy.id = `${testProxy.id || testProxy.host}-${protocol}`;
        tempProxy.name = `${testProxy.name || testProxy.host} (${protocol})`;
        tempProxy.protocol = protocol;

        console.log(`[ProtocolTester] Создан временный прокси: ${tempProxy.id} (${tempProxy.protocol})`);

        // Сохраняем оригинальный список прокси
        originalProxyServers = Settings.current.proxyServers.slice();

        // Добавляем временный прокси в список
        Settings.current.proxyServers.push(tempProxy);
        SettingsOperation.saveProxyServers();

        // Сохраняем ID временного прокси
        tempProxyId = tempProxy.id;

        // 2. Переключаемся на AlwaysEnabled и устанавливаем временный прокси через стандартный механизм
        await TestManager.switchToAlwaysEnabledProfile();
        await TestManager.setProxyAndWait(tempProxyId, 15);

        // 3. Проверяем готовность и получаем IP
        const { ready, ip } = await checkProxyReady(tempProxyId);

        if (!ready) {
            console.log(`[ProtocolTester] ❌ Прокси не готов с протоколом ${protocol}, пропускаем`);
            // Удаляем временный прокси
            const index = Settings.current.proxyServers.findIndex(p => p.id === tempProxyId);
            if (index !== -1) Settings.current.proxyServers.splice(index, 1);
            SettingsOperation.saveProxyServers();
            // Восстанавливаем оригинальный список
            Settings.current.proxyServers = originalProxyServers;
            SettingsOperation.saveProxyServers();
            return {
                alive: false,
                exact: false,
                status: "fail",
                latencyMs: 0,
                error: `Proxy not ready with protocol ${protocol}`
            };
        }

        // 4. Прокси готов, возвращаем результат без повторного checkProxy
        console.log(`[ProtocolTester] ✅ Прокси готов с протоколом ${protocol}, IP: ${ip}`);

        // Удаляем временный прокси
        const index = Settings.current.proxyServers.findIndex(p => p.id === tempProxyId);
        if (index !== -1) Settings.current.proxyServers.splice(index, 1);
        SettingsOperation.saveProxyServers();
        // Восстанавливаем оригинальный список
        Settings.current.proxyServers = originalProxyServers;
        SettingsOperation.saveProxyServers();

        // Возвращаем indirect (успех без загрузки страницы)
        return {
            alive: true,
            exact: false,
            status: "indirect",
            latencyMs: Date.now() - (proxy as any)._startTime || 0,
            ip: ip || null
        };
    }

    // English: For other browsers, use direct API (works in Chrome)
    // Russian: Для других браузеров используем прямой API (работает в Chrome)
	const testOptions = { ...options, retryOnDirectIp: false, skipProtocolDetection: true };
	const result = await checkProxy(testProxy, testUrl, testOptions);

    console.log(`[ProtocolTester] ${protocol} результат: ${result.status} (alive: ${result.alive})`);
    return result;
}

// ==================== Public API ====================

export async function detectWorkingProtocol(
    proxy: ProxyServer,
    testUrl: string,
    options: CheckerOptions,
    initialResult?: CheckResult,
    skipCheck: boolean = false,
    attempt: number = 0,
    isCancelled?: () => boolean
): Promise<ProtocolDetectionResult | null> {
    if (attempt >= 2) {
        console.log(`[ProtocolTester] Достигнут лимит попыток (${attempt}), прекращаем`);
        return null;
    }

    if (!isAutoDetectEnabled()) {
        console.log('[ProtocolTester] Автоопределение протокола отключено в настройках');
        return null;
    }

    if (!skipCheck && initialResult && initialResult.alive && initialResult.status === 'success') {
        console.log('[ProtocolTester] Прокси уже работает с заявленным протоколом');
        return null;
    }

    const retrievedIp = initialResult?.ip || null;
    if (!skipCheck && !retrievedIp) {
        console.log('[ProtocolTester] IP не получен, пропускаем перебор (skipCheck=false)');
        return null;
    }

    if (skipCheck) {
        console.log('[ProtocolTester] Режим skipCheck: пробуем протоколы без IP');
    }

    const mode = getProtocolSwitchMode();
    const originalProtocol = proxy.protocol.toUpperCase();

    if (mode === ProtocolSwitchMode.Probable && !isSocksProxy(originalProtocol)) {
        console.log(`[ProtocolTester] Вероятный режим: прокси ${originalProtocol} не SOCKS, пропускаем`);
        return null;
    }

    const fallbacks = getFallbackProtocols(originalProtocol, mode);
    if (fallbacks.length === 0) {
        console.log('[ProtocolTester] Нет запасных протоколов для перебора');
        return null;
    }

    console.log(`[ProtocolTester] 🔁 ${proxy.host}:${proxy.port} заявлен как ${originalProtocol}, пробуем протоколы: ${fallbacks.join(', ')}`);
			// Log start of protocol detection
		Core.sendTestLogStep({
			type: 'info',
			message: `🔍 Поиск рабочего протокола для ${proxy.host}:${proxy.port} (${originalProtocol})`,
			timestamp: Date.now()
		});

    const failedProtocols: string[] = [];

    for (const protocol of fallbacks) {
        if (isCancelled && isCancelled()) {
            console.log(`[ProtocolTester] Тест отменён, прекращаем перебор протоколов`);
            return null;
        }

        Core.sendTestLogStep({
            type: 'protocol-retry',
            proxyId: proxy.id || 'unknown',
            host: proxy.host,
            port: proxy.port,
            originalProtocol: originalProtocol,
            newProtocol: protocol,
            mode: mode,
            timestamp: Date.now(),
            isFirstAttempt: protocol === fallbacks[0]
        });

        console.log(`[ProtocolTester] ⏳ Пробуем ${protocol} для ${proxy.host}:${proxy.port}...`);

        const result = await testWithProtocol(proxy, testUrl, protocol, options);

        if (result.alive && (result.status === 'success' || result.status === 'indirect')) {
            console.log(`%c[ProtocolTester] ✅ Рабочий протокол найден: ${protocol} для ${proxy.host}:${proxy.port}`, 'color: #00ff88; font-weight: bold');

                    Core.sendTestLogStep({
                        type: 'protocol-changed',
                        proxyId: proxy.id || 'unknown',
                        host: proxy.host,
                        port: proxy.port,
                        originalProtocol: originalProtocol,
                        detectedProtocol: protocol,
                        ip: result.ip || null,  // <-- ИСПРАВЛЕНО: используем result.ip
                        success: true,
                        timestamp: Date.now()
                    });

            return {
                protocol: protocol,
                result: result,
                switched: true,
                failedProtocols: failedProtocols
            };
        } else {
            console.log(`[ProtocolTester] ❌ ${protocol} не работает для ${proxy.host}:${proxy.port}`);
            failedProtocols.push(protocol);
        }
    }

    console.log(`[ProtocolTester] ❌ Ни один из запасных протоколов не работает для ${proxy.host}:${proxy.port}`);

    Core.sendTestLogStep({
        type: 'protocol-changed',
        proxyId: proxy.id || 'unknown',
        host: proxy.host,
        port: proxy.port,
        originalProtocol: originalProtocol,
        detectedProtocol: null,
        success: false,
        failedProtocols: failedProtocols,
        timestamp: Date.now()
    });

    return null;
}

export function isProtocolAutoDetectionEnabled(): boolean {
    return isAutoDetectEnabled();
}

export function getCurrentProtocolSwitchMode(): ProtocolSwitchMode {
    return getProtocolSwitchMode();
}

export const ProtocolTester = {
    detectWorkingProtocol,
    isProtocolAutoDetectionEnabled,
    getCurrentProtocolSwitchMode,
    ProtocolSwitchMode
};