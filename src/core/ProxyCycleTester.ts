// src/core/ProxyCycleTester.ts

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
import { SmartProfileTypeBuiltinIds } from "./definitions";
import { Settings } from "./Settings";
import { SettingsOperation } from "./SettingsOperation";
import { IpServiceManager } from "./IpServiceManager";
import { checkCycleProxy } from "./ProxyCheckerCore";
import { saveResult, sendProgress } from "./ResultSaver";
import { TestManager } from "./TestManager";

type TestResult = {
    proxyId: string;
    proxyName: string;
    status: "success" | "indirect" | "ip-only" | "fail" | "cancelled";
    latencyMs: number;
    error?: string;
};

type ProxyListItem = {
    id: string;
    name: string;
    protocol?: string;
    host?: string;
    port?: number;
};

export const ProxyCycleTester = {
    isRunning(): boolean {
        return this._isRunning;
    },
    get isRunningGetter(): boolean {
        return this._isRunning;
    },
    _isRunning: false,
    _cancelRequested: false,
    _totalProxies: 0,
    _completedProxies: 0,
    _currentProxyIndex: 0,
    _proxiesList: [] as ProxyListItem[],
    _testSite: "",
    _directIp: null as string | null,
    _mainWindowId: null as number | null,
    _cancelMessageListener: null as ((message: any) => void) | null,
    _windowRemovedListener: null as ((windowId: number) => void) | null,
    _originalProfileId: null as string | null,

    async startCycleTest(testSite: string, refreshTabSetting?: boolean, originalProfileId?: string | null, proxyList?: ProxyListItem[]): Promise<void> {
        try {
            this.reset();

            if (this._isRunning) {
                console.log("[CycleTester] Тест уже запущен");
                return;
            }
            if (!Settings.current || !Settings.current.proxyServers) {
                console.log("[CycleTester] Настройки не готовы, ожидание инициализации...");
                await new Promise<void>((resolve) => {
                    const onInit = () => {
                        Settings.removeInitializeCompletedEventListener(onInit);
                        resolve();
                    };
                    Settings.addInitializeCompletedEventListener(onInit);
                    if (!Settings.current) {
                        Settings.initialize();
                    }
                });
                console.log("[CycleTester] Настройки инициализированы");
            }

            console.log(`%c[CycleTester] ========== НАЧАЛО ЦИКЛИЧЕСКОГО ТЕСТА ==========`, 'color: #ffaa00; font-weight: bold; font-size: 1.1em');
            console.log(`%c[CycleTester] Тестовый сайт: ${testSite}`, 'color: #ffaa00');
            if (refreshTabSetting !== undefined) {
                console.log(`[CycleTester] refreshTabOnConfigChanges: ${refreshTabSetting}`);
            }
            if (originalProfileId) {
                console.log(`[CycleTester] Исходный профиль ID: ${originalProfileId}`);
            }
            this._originalProfileId = originalProfileId || SmartProfileTypeBuiltinIds.Direct;
            this._testSite = testSite;

            let normalizedSite = testSite.trim();
            if (!normalizedSite.startsWith("http://") && !normalizedSite.startsWith("https://")) {
                normalizedSite = "https://" + normalizedSite;
            }
            this._testSite = normalizedSite;

            if (proxyList && proxyList.length > 0) {
                this._proxiesList = proxyList;
                console.log(`[CycleTester] Используем переданный список прокси (${proxyList.length})`);
            } else {
                this._proxiesList = this.getProxyListFromSettings();
                if (this._proxiesList.length === 0) {
                    console.error("[CycleTester] Нет прокси в настройках");
                    console.log("[CycleTester] Пожалуйста, добавьте прокси на странице настроек");
                    return;
                }
            }
            console.log(`%c[CycleTester] Всего прокси для тестирования: ${this._proxiesList.length}`, 'color: #ffaa00');

            this._isRunning = true;
            this._cancelRequested = false;
            this._totalProxies = this._proxiesList.length;
            this._completedProxies = 0;
            this._currentProxyIndex = 0;

            api.windows.getCurrent().then((win) => {
                this._mainWindowId = win.id;
            }).catch((err) => console.warn("[CycleTester] Не удалось получить ID текущего окна:", err));

            if (!this._windowRemovedListener) {
                this._windowRemovedListener = (windowId: number) => {
                    if (this._isRunning && this._mainWindowId !== null && windowId === this._mainWindowId) {
                        console.log("[CycleTester] Основное окно закрыто, очистка...");
                        this.cancelTest();
                    }
                };
                api.windows.onRemoved.addListener(this._windowRemovedListener);
            }

            if (!this._cancelMessageListener) {
                this._cancelMessageListener = (message: any) => {
                    if (!this._isRunning) return;
                    const command = message?.command;
                    if (command === "CANCEL_PROXY_TEST_FOR_SITE" || 
                        command === "CANCEL_CYCLE_TEST_FOR_SITE" || 
                        command === "TEST_CANCELLED") {
                        console.log(`[CycleTester] Получена команда отмены: ${command}`);
                        this.cancelTest();
                    }
                };
                api.runtime.onMessage.addListener(this._cancelMessageListener);
                console.log(`[CycleTester] Слушатель отмены зарегистрирован`);
            }

			// English: Get direct IP only if enabled in settings
			// Russian: Получаем прямой IP только если включено в настройках
			if (Settings.current?.options?.enableDirectIpDetection === true) {
				await IpServiceManager.ensureInitialized();
				this._directIp = await IpServiceManager.getDirectIp();
				console.log(`[CycleTester] Прямой IP: ${this._directIp || "не получен"}`);
			} else {
				this._directIp = null;
				console.log(`[CycleTester] Определение прямого IP отключено в настройках.`);
			}

            api.runtime.sendMessage({
                command: "CHECK_START",
                total: this._totalProxies,
                completed: 0,
                testType: "cycle"
            });

            await this.runTestLoop();
        } finally {
            // Нет скрытого окна
        }
    },

    getProxyListFromSettings(): ProxyListItem[] {
        console.log("[CycleTester] Чтение прокси из Settings.current...");
        if (!Settings.current || !Settings.current.proxyServers) {
            console.error("[CycleTester] Settings.current или proxyServers недоступны");
            return [];
        }
        const manualProxies = Settings.current.proxyServers || [];
        const subscribedProxies = SettingsOperation.getAllSubscribedProxyServers();
        const allProxies = [...manualProxies, ...subscribedProxies];
        console.log(`[CycleTester] Прочитано ${manualProxies.length} ручных + ${subscribedProxies.length} подписочных = ${allProxies.length} всего`);
        const proxies: ProxyListItem[] = allProxies.map((proxy: any) => ({
            id: proxy.id,
            name: `${proxy.countryCode || ''} ${proxy.host}:${proxy.port}`,
            protocol: proxy.protocol,
            host: proxy.host,
            port: proxy.port
        }));
        return proxies;
    },

    async runTestLoop(): Promise<void> {
        for (let i = 0; i < this._proxiesList.length; i++) {
            if (this._cancelRequested) {
                console.log("[CycleTester] Отмена обнаружена, остановка после текущего прокси");
                break;
            }

            this._currentProxyIndex = i;
            const proxy = this._proxiesList[i];
            console.log(`%c[CycleTester] >>> ТЕСТИРУЕМ ПРОКСИ ${i + 1}/${this._totalProxies}: ${proxy.name} <<<`, 'color: #ffffaa; font-weight: bold; font-size: 1.3em');

            // Переключаем профиль и прокси
            await this.switchToProxy(proxy);

            // Проверяем прокси через CycleProxyChecker
            const result = await this.testCurrentProxy(proxy);
            console.log(`[CycleTester] Результат для ${proxy.name}:`, result);

            if (!result) {
                console.error(`[CycleTester] Нет результата для прокси ${proxy.name}, пропускаем`);
                continue;
            }
            if (result.status === "cancelled") {
                console.log(`[CycleTester] Прокси ${proxy.name} отменён, прерываем`);
                break;
            }

            this._completedProxies = i + 1;

            // Сохраняем результат через ResultSaver
            await saveResult(proxy.id, this._testSite, result.status);
            sendProgress(
                proxy.id,
                proxy.name,
                this._testSite,
                result.status,
                this._completedProxies,
                this._totalProxies,
                "cycle"
            );
        }

        const wasCancelled = this._cancelRequested;
        this._isRunning = false;
        await SettingsOperation.saveAllLocal(true);
        await SettingsOperation.saveAllSync(false);

        await TestManager.restoreOriginalProfile(this._originalProfileId);

        if (wasCancelled) {
            console.log("[CycleTester] Тест отменён");
            api.runtime.sendMessage({ command: "TEST_CANCELLED", completed: this._completedProxies, total: this._totalProxies, site: this._testSite, testType: "cycle" });
        } else {
            console.log(`%c[CycleTester] ========== ТЕСТ ЗАВЕРШЁН ==========`, 'color: #00ff00; font-weight: bold; font-size: 1.2em');
            api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: this._totalProxies, site: this._testSite, testType: "cycle" });
        }
        api.runtime.sendMessage({ command: "CYCLE_TEST_FINISHED" });
    },

    async switchToProxy(proxy: ProxyListItem): Promise<void> {
        await TestManager.switchToAlwaysEnabledProfile();
        await TestManager.setProxyAndWait(proxy.id);

        const protocolUpper = (proxy.protocol || 'HTTP').toUpperCase();
        let delay = 1500;
        if (protocolUpper.includes('SOCKS5')) delay = 3000;
        else if (protocolUpper.includes('SOCKS4')) delay = 2500;
        else if (protocolUpper === 'HTTPS') delay = 2000;
        console.log(`%c[CycleTester] Ожидание применения прокси (${delay}мс для ${protocolUpper})...`, 'color: #ffaa00');
        await new Promise(resolve => setTimeout(resolve, delay));
    },

    async testCurrentProxy(proxy: ProxyListItem): Promise<TestResult> {
        if (this._cancelRequested) {
            return { proxyId: proxy.id, proxyName: proxy.name, status: "cancelled", latencyMs: 0 };
        }

        const result = await checkCycleProxy(
            {
                id: proxy.id,
                name: proxy.name,
                host: proxy.host || '',
                port: proxy.port || 0,
                protocol: proxy.protocol || 'HTTP'
            },
            this._testSite,
            this._directIp,
            {
                mainTimeout: 20000,
                extendedTimeout: 30000,
                faviconInterval: 300,
                ipCheckDelay: 70,
                retryOnDirectIp: true
            },
            () => this._cancelRequested
        );

        return {
            proxyId: proxy.id,
            proxyName: proxy.name,
            status: result.status,
            latencyMs: result.latencyMs,
            error: result.error
        };
    },

    async cancelTest(): Promise<void> {
        if (!this._isRunning) return;
        console.log("[CycleTester] Отмена запрошена - текущий прокси завершится, следующие не запустятся");
        this._cancelRequested = true;
        await SettingsOperation.saveAllLocal(true);
        await SettingsOperation.saveAllSync(false);
    },

    getStatus(): { isRunning: boolean; total: number; completed: number; site: string } {
        return {
            isRunning: this._isRunning,
            total: this._totalProxies,
            completed: this._completedProxies,
            site: this._testSite
        };
    },

    reset(): void {
        this._isRunning = false;
        this._cancelRequested = false;
        this._totalProxies = 0;
        this._completedProxies = 0;
        this._currentProxyIndex = 0;
        this._proxiesList = [];
        this._testSite = "";
        this._directIp = null;

        if (this._cancelMessageListener) {
            api.runtime.onMessage.removeListener(this._cancelMessageListener);
            this._cancelMessageListener = null;
            console.log(`[CycleTester] Слушатель отмены удалён`);
        }
        if (this._windowRemovedListener) {
            api.windows.onRemoved.removeListener(this._windowRemovedListener);
            this._windowRemovedListener = null;
            console.log(`[CycleTester] Слушатель закрытия окна удалён`);
        }
        this._mainWindowId = null;
    }
};
console.log("[ProxyMust] ProxyCycleTester.ts загружен (BACKGROUND MODE)");