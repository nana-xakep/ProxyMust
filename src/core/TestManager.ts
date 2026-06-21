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

// ==================== Test Lock ====================

let currentActiveTest: string | null = null;
let testTimeoutId: ReturnType<typeof setTimeout> | null = null;

// English: try to start a test, returns true if no other test is running
// Russian: попытка запустить тест, возвращает true, если никакой другой тест не выполняется
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

// English: Resets the test timeout timer (extends it by TEST_LOCK_TIMEOUT_MS)
// Russian: Сбрасывает таймер таймаута теста (продлевает его на TEST_LOCK_TIMEOUT_MS)
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

// ==================== Profile Switching for Cycle Tests ====================

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
        ProxyEngine.updateBrowsersProxyConfig(); // Применяем профиль сразу
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
    ProxyEngine.updateBrowsersProxyConfig(); // Применяем профиль сразу
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
    Settings.current.defaultProxyServerId = proxyId;
    SettingsOperation.saveDefaultProxyServer();
    ProxyEngine.updateBrowsersProxyConfig(); // Применяем прокси сразу
    SettingsOperation.saveAllSync(false);
    Settings.updateActiveSettings();

    api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProxyServer, id: proxyId });

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

// ==================== Export object ====================

export const TestManager = {
    tryStartTest,
    finishTest,
    resetTimer,
    isTestRunning,
    switchToAlwaysEnabledProfile,
    restoreOriginalProfile,
    setProxyAndWait
};