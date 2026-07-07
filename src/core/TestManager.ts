// src/core/TestManager.ts

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
import { CommandMessages, SmartProfileTypeBuiltinIds } from "./definitions";
import { TEST_LOCK_TIMEOUT_MS } from "./TestConstants";
import { ProxyEngine } from './ProxyEngine';
import { ProxyReadinessChecker } from './ProxyReadinessChecker';
import { IpServiceManager } from "./IpServiceManager";
import { Core } from "./Core";
import { resetAntiDuplicate } from "../ui/code/logRenderer";

// ==================== Test Lock ====================

let currentActiveTest: string | null = null;
let testTimeoutId: ReturnType<typeof setTimeout> | null = null;

function tryStartTest(testType: string): boolean {
    if (currentActiveTest !== null) {
        console.warn(`[TestManager] Не удалось запустить ${testType} тест, ${currentActiveTest} тест уже выполняется`);
        return false;
    }
    currentActiveTest = testType;
    if (testTimeoutId) clearTimeout(testTimeoutId);
    testTimeoutId = setTimeout(() => {
        if (currentActiveTest !== null) {
            console.warn(`[TestManager] Таймаут блокировки теста (${TEST_LOCK_TIMEOUT_MS / 60000} мин), принудительное освобождение.`);
            api.runtime.sendMessage({
                command: CommandMessages.SettingsPageShowMessage,
                success: false,
                message: api.i18n.getMessage("settingsProxyTestTimeout") || "Тест был автоматически остановлен из-за длительного выполнения. Перезагрузите страницу настроек и попробуйте снова."
            });
            finishTest();
        }
    }, TEST_LOCK_TIMEOUT_MS);
    console.log(`[TestManager] Тест запущен: ${testType}`);
    
    // English: Send info message to log
    // Russian: Отправляем информационное сообщение в лог
    Core.sendTestLogStep({
        type: 'info',
        message: api.i18n.getMessage('settingsProxyTestTitle') || 'Proxy test started',
        timestamp: Date.now()
    });
	
	    // Сброс антидубликата при старте нового теста
    resetAntiDuplicate();
    // English: Reset stop/complete flags in Core to allow new completion message
    // Russian: Сбрасываем флаги stop/complete в Core, чтобы разрешить новое сообщение о завершении
    Core.resetTestLogFlags();
    
    // English: Log if protocol auto-detection is enabled
    // Russian: Логируем, если автоопределение протоколов включено
    if (Settings.current?.options?.autoDetectProtocol) {
        const mode = Settings.current?.options?.protocolSwitchMode || 'probable';
        const modeText = mode === 'full' ? 'полный' : 'вероятностный';
        Core.sendTestLogStep({
            type: 'info',
            message: `🔄 Автоопределение протоколов включено (режим: ${modeText})`,
            timestamp: Date.now()
        });
    }
    
    return true;
}

function finishTest(): void {
    if (testTimeoutId) {
        clearTimeout(testTimeoutId);
        testTimeoutId = null;
    }
    if (currentActiveTest !== null) {
        console.log(`[TestManager] Тест завершён: ${currentActiveTest}`);
        currentActiveTest = null;
    }
}

function resetTimer(): void {
    if (currentActiveTest !== null && testTimeoutId) {
        clearTimeout(testTimeoutId);
        testTimeoutId = setTimeout(() => {
            if (currentActiveTest !== null) {
                console.warn(`[TestManager] Таймаут блокировки теста (${TEST_LOCK_TIMEOUT_MS / 60000} мин), принудительное освобождение.`);
                api.runtime.sendMessage({
                    command: CommandMessages.SettingsPageShowMessage,
                    success: false,
                    message: api.i18n.getMessage("settingsProxyTestTimeout") || "Тест был автоматически остановлен из-за длительного выполнения. Перезагрузите страницу настроек и попробуйте снова."
                });
                finishTest();
            }
        }, TEST_LOCK_TIMEOUT_MS);
    }
}

function isTestRunning(): boolean {
    return currentActiveTest !== null;
}

// ==================== Profile Switching ====================

async function switchToAlwaysEnabledProfile(): Promise<void> {
    Settings.updateActiveSettings();
    console.log(`[TestManager] Переключение на профиль AlwaysEnabled...`);

    const targetProfileId = SmartProfileTypeBuiltinIds.AlwaysEnabled;
    const profile = Settings.current.proxyProfiles.find(p => p.profileId === targetProfileId);
    if (profile) {
        Settings.current.activeProfileId = targetProfileId;
        SettingsOperation.saveActiveProfile();
        SettingsOperation.saveAllSync(false);
        Settings.updateActiveSettings();
        ProxyEngine.updateBrowsersProxyConfig();
        console.log(`[TestManager] Профиль изменён на ${targetProfileId} через Settings`);
    } else {
        console.error(`[TestManager] Профиль ${targetProfileId} не найден`);
    }
    api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProfile, profileId: targetProfileId });

    await waitForProfile(targetProfileId, 15);
}

async function switchToDirectProfile(): Promise<void> {
    Settings.updateActiveSettings();
    console.log(`[TestManager] Переключение на профиль Direct (сброс прокси)...`);

    const targetProfileId = SmartProfileTypeBuiltinIds.Direct;
    const profile = Settings.current.proxyProfiles.find(p => p.profileId === targetProfileId);
    if (profile) {
        Settings.current.activeProfileId = targetProfileId;
        SettingsOperation.saveActiveProfile();
        SettingsOperation.saveAllSync(false);
        Settings.updateActiveSettings();
        ProxyEngine.updateBrowsersProxyConfig();
        console.log(`[TestManager] Профиль изменён на ${targetProfileId} через Settings`);
    } else {
        console.error(`[TestManager] Профиль ${targetProfileId} не найден`);
    }
    api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProfile, profileId: targetProfileId });

    await waitForProfile(targetProfileId, 15);
}

async function restoreOriginalProfile(originalProfileId?: string | null): Promise<void> {
    const targetProfileId = originalProfileId || SmartProfileTypeBuiltinIds.Direct;
    console.log(`[TestManager] Восстановление профиля на ${targetProfileId}...`);

    Settings.current.activeProfileId = targetProfileId;
    SettingsOperation.saveActiveProfile();
    ProxyEngine.updateBrowsersProxyConfig();
    SettingsOperation.saveAllSync(false);
    Settings.updateActiveSettings();
    api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProfile, profileId: targetProfileId });

    await waitForProfile(targetProfileId, 15);
}

async function waitForProfile(targetProfileId: string, maxAttempts: number = 15): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 300));
        Settings.updateActiveSettings();
        const currentProfile = Settings.current?.activeProfileId;
        if (currentProfile === targetProfileId) {
            console.log(`%c[TestManager] ✓ Профиль подтверждён: ${currentProfile} (попытка ${attempt})`, 'color: #ffffaa');
            return;
        }
        console.log(`[TestManager] Ожидание смены профиля: сейчас ${currentProfile}, ожидаем ${targetProfileId} (попытка ${attempt}/${maxAttempts})`);
    }
    console.log(`%c[TestManager] ✗ Не удалось сменить профиль на ${targetProfileId}`, 'color: #ff0000');
}

async function setProxyAndWait(proxyId: string, maxAttempts: number = 15): Promise<void> {
    console.log(`[TestManager] Установка активного прокси: ${proxyId}`);

    // 1. Меняем ID прокси по умолчанию
    Settings.current.defaultProxyServerId = proxyId;
    SettingsOperation.saveDefaultProxyServer();

    // 2. Обновляем активные настройки (чтобы ProxyEngine использовал свежие данные)
    Settings.updateActiveSettings();

    // 3. Применяем конфигурацию в браузере
    ProxyEngine.updateBrowsersProxyConfig();

    // 4. Сохраняем в синхронизацию и отправляем сообщение в UI
    SettingsOperation.saveAllSync(false);
    api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProxyServer, id: proxyId });

    // 5. Диагностическая проверка (не блокирует)
    try {
        await ProxyReadinessChecker.checkReadiness(proxyId, true, true);
    } catch (err) {
        console.warn('[TestManager] Диагностическая проверка не удалась:', err);
    }

    // 6. Ждём, пока активный прокси в настройках совпадёт с ожидаемым
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 300));
        Settings.updateActiveSettings();
        let currentProxyId = Settings.active?.currentProxyServer?.id;
        if (!currentProxyId) {
            currentProxyId = Settings.current?.defaultProxyServerId;
        }
        if (currentProxyId === proxyId) {
            console.log(`%c[TestManager] ✓ Прокси подтверждён: ${currentProxyId} (попытка ${attempt})`, 'color: #00ff00');
            return;
        }
        console.log(`[TestManager] Ожидание смены прокси: сейчас ${currentProxyId}, ожидаем ${proxyId} (попытка ${attempt}/${maxAttempts})`);
    }
    console.log(`%c[TestManager] ✗ Не удалось сменить прокси на ${proxyId}`, 'color: #ff0000');
}

/**
 * Directly applies proxy settings via browser proxy API (without reset)
 */
async function applyProxyDirectly(proxyId: string, protocol?: string): Promise<void> {
    const proxyAPI = api.proxy;
    if (!proxyAPI) {
        throw new Error('Proxy API not available');
    }

    const proxy = SettingsOperation.findProxyServerById(proxyId);
    if (!proxy) {
        throw new Error(`Proxy ${proxyId} not found`);
    }

    const usedProtocol = protocol || proxy.protocol;
    const scheme = usedProtocol.toLowerCase();
    const config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: scheme === 'socks' ? 'socks5' : scheme,
                host: proxy.host,
                port: proxy.port
            },
            bypassList: ["<local>"]
        }
    };

    console.log(`[TestManager] Применение прокси ${proxy.host}:${proxy.port} с протоколом ${usedProtocol} через прямой API (без сброса)`);

    await new Promise<void>((resolve, reject) => {
        proxyAPI.settings.set({ value: config, scope: "regular" }, () => {
            if (api.runtime?.lastError) {
                reject(new Error(api.runtime.lastError.message));
            } else {
                resolve();
            }
        });
    });

    let applied = false;
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts && !applied) {
        await new Promise(r => setTimeout(r, 300));
        const currentConfig = await new Promise<any>((resolve) => {
            proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
        });
        if (currentConfig && currentConfig.mode === "fixed_servers") {
            const singleProxy = currentConfig.rules?.singleProxy;
            if (singleProxy && singleProxy.host === proxy.host && singleProxy.port === proxy.port) {
                applied = true;
                console.log(`[TestManager] Прокси подтверждён через proxy.settings.get`);
                break;
            }
        }
        attempts++;
    }

    if (!applied) {
        throw new Error(`Proxy settings not applied for ${proxyId}`);
    }

    Settings.current.defaultProxyServerId = proxyId;
    SettingsOperation.saveDefaultProxyServer();
    Settings.updateActiveSettings();
    console.log(`[TestManager] Прокси применён и подтверждён`);
}

/**
 * Quick check if proxy is ready using IpServiceManager
 */
async function quickCheckProxyReady(proxyId: string): Promise<boolean> {
    const proxy = SettingsOperation.findProxyServerById(proxyId);
    if (!proxy) {
        return false;
    }
    try {
        const ip = await IpServiceManager.fetchIpViaProxy(
            { host: proxy.host, port: proxy.port, protocol: proxy.protocol },
            true,
            true
        );
        return !!ip;
    } catch {
        return false;
    }
}

/**
 * Waits for the proxy to become ready (uses applyProxyDirectly)
 */
async function waitForProxyReady(
    proxyId: string,
    maxAttempts: number = 3,
    delayBetweenAttempts: number = 500
): Promise<boolean> {
    try {
        await applyProxyDirectly(proxyId);
    } catch (err) {
        console.warn(`[TestManager] Не удалось применить прокси ${proxyId}:`, err);
        return false;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, delayBetweenAttempts));
        console.log(`[TestManager] Проверка готовности прокси ${proxyId}, попытка ${attempt}/${maxAttempts}`);
        const ready = await quickCheckProxyReady(proxyId);
        if (ready) {
            console.log(`%c[TestManager] ✅ Прокси ${proxyId} готов`, 'color: #00ff88');
            return true;
        }
        console.log(`[TestManager] ⚠️ Попытка ${attempt} не удалась, ждём ${delayBetweenAttempts}мс...`);
    }

    console.log(`%c[TestManager] ❌ Прокси ${proxyId} не готов после ${maxAttempts} попыток`, 'color: #ff5555');
    return false;
}

/**
 * English: Apply proxy with appropriate delay based on protocol (unified method)
 * Russian: Применяет прокси с задержкой в зависимости от протокола (унифицированный метод)
 */
async function applyProxyAndWait(proxyId: string, protocol?: string): Promise<void> {
    // Переключаем профиль на Always Enabled
    await switchToAlwaysEnabledProfile();
    // Устанавливаем прокси
    await setProxyAndWait(proxyId);
    
    // Определяем задержку на основе переданного протокола или текущего активного
    const proto = protocol || Settings.active?.currentProxyServer?.protocol || 'HTTP';
    const protocolUpper = proto.toUpperCase();
    let delay = 3000; // базовая задержка
    if (protocolUpper.includes('SOCKS5')) delay = 5000;
    else if (protocolUpper.includes('SOCKS4')) delay = 5000;
    else if (protocolUpper === 'HTTPS') delay = 3500;
    console.log(`[TestManager] Ожидание применения прокси (${delay}мс для ${protocolUpper})...`);
    await new Promise(r => setTimeout(r, delay));

    // Дополнительная проверка готовности через короткий IP-запрос
    let proxyReady = false;
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts && !proxyReady) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const proxy = SettingsOperation.findProxyServerById(proxyId);
            if (proxy) {
                const ip = await IpServiceManager.fetchIpViaProxy(
                    { host: proxy.host, port: proxy.port, protocol: proxy.protocol },
                    true,
                    true // skipDirectIp
                );
                if (ip) {
                    proxyReady = true;
                    console.log(`[TestManager] ✅ Прокси ${proxyId} готов, IP: ${ip}`);
                }
            }
        } catch (e) {
            console.log(`[TestManager] ⏳ Ожидание готовности прокси (попытка ${attempts + 1})...`);
        }
        attempts++;
    }
    if (!proxyReady) {
        console.warn(`[TestManager] ⚠️ Прокси ${proxyId} не готов после ${maxAttempts} попыток, продолжаем...`);
    }
}

// ==================== Export ====================

export const TestManager = {
    tryStartTest,
    finishTest,
    resetTimer,
    isTestRunning,
    switchToAlwaysEnabledProfile,
    switchToDirectProfile,
    restoreOriginalProfile,
    setProxyAndWait,
    applyProxyDirectly,
    quickCheckProxyReady,
    waitForProxyReady,
    applyProxyAndWait  // <--- добавлен новый метод
};