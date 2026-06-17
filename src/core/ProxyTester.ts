// src/core/ProxyTester.ts
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
 
import { LocalProxyChecker } from "./LocalProxyChecker";
import { Settings } from "./Settings";
import { SettingsOperation } from "./SettingsOperation";
import { quickCheckProxy, forceCloseHiddenWindow as forceCloseExpressWindow } from "./ExpressProxyChecker";
import { ProxyServer } from "./definitions";
import { api } from "../lib/environment";

export const ProxyTester = {
    _isRunning: false,
    _cancelRequested: false,
    _currentSite: "",
    _total: 0,
    _completed: 0,
    _mainWindowId: null as number | null,
    _windowRemovedListener: null as ((windowId: number) => void) | null,

    async startCheck(testUrls: string[]) {
        const urls = testUrls.filter(u => u?.trim());
        if (!urls.length) return;
        const allProxies = Settings.current?.proxyServers || [];
        if (!allProxies.length) return;

        api.runtime.sendMessage({ command: "CHECK_START", total: allProxies.length });

        let completed = 0;
        for (const proxy of allProxies) {
            try {
                const result = await LocalProxyChecker.checkProxy(proxy, urls, false, 10000);
                SettingsOperation.updateProxyRating(proxy.id, result.alive ? 1 : -1);
                completed++;
                api.runtime.sendMessage({
                    command: "CHECK_PROGRESS",
                    completed,
                    total: allProxies.length,
                    proxyHost: `${proxy.host}:${proxy.port}`,
                    alive: result.alive
                });
            } catch {
                completed++;
            }
        }
        api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: allProxies.length });
    },
    /**
     * English: Starts quick (express) test for a specific site using ExpressProxyChecker.
     * Russian: Запускает быстрый (экспресс) тест для конкретного сайта, используя ExpressProxyChecker.
     */
    async startQuickTestForSite(site: string, proxies: ProxyServer[]) {
        if (this._isRunning) {
            console.log("[ProxyTester] Quick test already running, ignoring new start");
            return;
        }
        this._isRunning = true;
        this._cancelRequested = false;
        this._currentSite = site;
        this._total = proxies.length;
        this._completed = 0;

        // English: Register window close listener to handle main window closure
        // Russian: Регистрируем слушатель закрытия окна для обработки закрытия основного окна
        this._registerWindowCloseListener();

        api.runtime.sendMessage({ command: "CHECK_START", total: this._total, completed: 0 });



        for (let i = 0; i < proxies.length; i++) {
            if (this._cancelRequested) {
                console.log("[ProxyTester] Quick test cancellation requested, breaking at index", i);
                break;
            }
            const proxy = proxies[i];
            let alive = false;
            let retrievedIp: string | undefined;
            let result: any = null;
            try {
                result = await quickCheckProxy(proxy, site);
                alive = result.alive;
                retrievedIp = result.ip;
                // English: Normalize site (remove protocol and trailing slash) for consistent keys
                // Russian: Нормализуем сайт (удаляем протокол и завершающий слэш) для единообразных ключей
                const normalizedSite = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
                
                if (alive) {
                    let statusValue: 'success' | 'indirect' = 'success';
                    if (result.error === "INDIRECT") {
                        statusValue = 'indirect';
                    }
                    SettingsOperation.updateProxyRating(proxy.id, 1);
                    if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
                    if (!Settings.current.autoStatus[proxy.id]) Settings.current.autoStatus[proxy.id] = {};
                    Settings.current.autoStatus[proxy.id][normalizedSite] = {
                        status: statusValue,
                        timestamp: Date.now()
                    };
                } else if (result.error === "DIRECT_IP") {
                    console.log(`[ProxyTester] Прокси ${proxy.host}:${proxy.port} вернул прямой IP, пропускаем`);
                } else {
                    SettingsOperation.updateProxyRating(proxy.id, -1);
                    if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
                    if (!Settings.current.autoStatus[proxy.id]) Settings.current.autoStatus[proxy.id] = {};
                    Settings.current.autoStatus[proxy.id][normalizedSite] = {
                        status: "fail",
                        timestamp: Date.now()
                    };
                }
                await SettingsOperation.saveAllLocal(true);
            } catch (e) {
                alive = false;
                if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
                if (!Settings.current.autoStatus[proxy.id]) Settings.current.autoStatus[proxy.id] = {};
                Settings.current.autoStatus[proxy.id][site] = {
                    status: "fail",
                    timestamp: Date.now()
                };
                await SettingsOperation.saveAllLocal(true);
            }
            if (!this._cancelRequested) {
                this._completed++;
                let statusType: 'success' | 'indirect' | 'fail' = alive ? "success" : "fail";
                if (alive && result?.error === "INDIRECT") {
                    statusType = "indirect";
                }
                api.runtime.sendMessage({
                    command: "CHECK_PROGRESS",
                    completed: this._completed,
                    total: this._total,
                    proxyHost: `${proxy.host}:${proxy.port}`,
                    alive: alive,
                    proxyId: proxy.id,
                    site: this._currentSite,
                    ip: retrievedIp,
                    statusType: statusType
                });
            }
        }

        const wasCancelled = this._cancelRequested;
        this._isRunning = false;
        this._cancelRequested = false;

        // English: Ensure all statuses are saved before sending completion
        // Russian: Сохраняем все статусы перед отправкой завершения
        await SettingsOperation.saveAllLocal(true);

        // English: Unregister window close listener
        // Russian: Удаляем слушатель закрытия окна
        this._unregisterWindowCloseListener();

        if (wasCancelled) {
            console.log("[ProxyTester] Quick test cancelled, completed:", this._completed);
            api.runtime.sendMessage({ command: "TEST_CANCELLED", completed: this._completed, total: this._total, site: this._currentSite });
        } else {
            console.log("[ProxyTester] Quick test completed");
            api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: this._total, site: this._currentSite });
        }
    },

    async startCheckForSite(site: string, proxies: ProxyServer[]) {
        // Если тест уже запущен, новый не запускаем (защита от параллельных тестов)
        if (this._isRunning) {
            console.log("[ProxyTester] Test already running, ignoring new start");
            return;
        }
        this._isRunning = true;
        this._cancelRequested = false;
        this._currentSite = site;
        this._total = proxies.length;
        this._completed = 0;

        // English: Register window close listener to handle main window closure
        // Russian: Регистрируем слушатель закрытия окна для обработки закрытия основного окна
        this._registerWindowCloseListener();

        api.runtime.sendMessage({ command: "CHECK_START", total: this._total, completed: 0 });

        for (let i = 0; i < proxies.length; i++) {
            if (this._cancelRequested) {
                console.log("[ProxyTester] Cancellation requested, breaking at index", i);
                break;
            }
            const proxy = proxies[i];
            let alive = false;
            let result: any = null;
            try {
                result = await LocalProxyChecker.checkProxy(proxy, [site], false, 8000);
                alive = result.alive;
                SettingsOperation.updateProxyRating(proxy.id, alive ? 1 : -1);
                
                // English: Normalize site (remove protocol and trailing slash) for consistent keys
                // Russian: Нормализуем сайт (удаляем протокол и завершающий слэш) для единообразных ключей
                const normalizedSite = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
                
                // Update autoStatus immediately
                if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
                if (!Settings.current.autoStatus[proxy.id]) Settings.current.autoStatus[proxy.id] = {};
                // English: if proxy is alive but returned indirect success, set status to "indirect"
                // Russian: если прокси жив, но вернул косвенный успех, устанавливаем статус "indirect"
                let statusValue: 'success' | 'indirect' | 'fail' = alive ? "success" : "fail";
                if (alive && result.error === "INDIRECT") {
                    statusValue = "indirect";
                }
                Settings.current.autoStatus[proxy.id][normalizedSite] = {
                    status: statusValue,
                    timestamp: Date.now()
                };
                await SettingsOperation.saveAllLocal(true);
            } catch (e) {
                alive = false;
                if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
                if (!Settings.current.autoStatus[proxy.id]) Settings.current.autoStatus[proxy.id] = {};
                Settings.current.autoStatus[proxy.id][site] = {
                    status: "fail",
                    timestamp: Date.now()
                };
                await SettingsOperation.saveAllLocal(true);
            }
            if (!this._cancelRequested) {
                this._completed++;
                let statusType: 'success' | 'indirect' | 'fail' = alive ? "success" : "fail";
                if (alive && result?.error === "INDIRECT") {
                    statusType = "indirect";
                }
                api.runtime.sendMessage({
                    command: "CHECK_PROGRESS",
                    completed: this._completed,
                    total: this._total,
                    proxyHost: `${proxy.host}:${proxy.port}`,
                    alive: alive,
                    proxyId: proxy.id,
                    site: this._currentSite,
                    statusType: statusType
                });
            }
        }

        const wasCancelled = this._cancelRequested;
        this._isRunning = false;
        this._cancelRequested = false;

        // English: Unregister window close listener
        // Russian: Удаляем слушатель закрытия окна
        this._unregisterWindowCloseListener();

        if (wasCancelled) {
            console.log("[ProxyTester] Test cancelled, completed:", this._completed);
            api.runtime.sendMessage({ command: "TEST_CANCELLED", completed: this._completed, total: this._total, site: this._currentSite });
        } else {
            console.log("[ProxyTester] Test completed");
            api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: this._total, site: this._currentSite });
        }
    },

    async cancelTestForSite() {
        if (!this._isRunning) return;
        console.log("[ProxyTester] cancelTestForSite called");
        this._cancelRequested = true;
        // Не ждём здесь – цикл остановится сам на следующей итерации
    },
	    /**
     * English: Returns current test status (running, total, completed, site).
     * Russian: Возвращает текущий статус теста (запущен, всего, завершено, сайт).
     */
    getStatus() {
        return {
            isRunning: this._isRunning,
            total: this._total,
            completed: this._completed,
            site: this._currentSite
        };
    },

    /**
     * English: Register window close listener to close hidden windows if main window is closed.
     * Russian: Зарегистрировать слушатель закрытия окна для закрытия скрытых окон при закрытии основного окна.
     */
    _registerWindowCloseListener() {
        if (this._windowRemovedListener) return;
        // English: Store main window ID
        // Russian: Сохраняем ID основного окна
        api.windows.getCurrent().then((win) => {
            this._mainWindowId = win.id;
        }).catch((err) => console.warn("[ProxyTester] Could not get current window ID:", err));
        
        this._windowRemovedListener = (windowId: number) => {
            if (this._isRunning && this._mainWindowId !== null && windowId === this._mainWindowId) {
                console.log("[ProxyTester] Main window closed, cleaning up hidden windows...");
                // English: Force close hidden windows from both checkers using static imports
                // Russian: Принудительно закрываем скрытые окна из обоих чекеров используя статические импорты
                forceCloseExpressWindow().catch(() => {});
                LocalProxyChecker.forceCloseHiddenWindow().catch(() => {});
                this.cancelTestForSite();
            }
        };
        api.windows.onRemoved.addListener(this._windowRemovedListener);
    },

    /**
     * English: Unregister window close listener.
     * Russian: Удалить слушатель закрытия окна.
     */
    _unregisterWindowCloseListener() {
        if (this._windowRemovedListener) {
            api.windows.onRemoved.removeListener(this._windowRemovedListener);
            this._windowRemovedListener = null;
            this._mainWindowId = null;
        }
    }
};