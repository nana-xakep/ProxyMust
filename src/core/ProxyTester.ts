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
import { sendProgress } from "./ResultSaver";
import { Core } from "./Core";
import { IpServiceManager } from "./IpServiceManager";

export const ProxyTester = {
    _isRunning: false,
    _cancelRequested: false,
    _currentSite: "",
    _total: 0,
    _completed: 0,
    _mainWindowId: null as number | null,
    _windowRemovedListener: null as ((windowId: number) => void) | null,

    async startCheck(testUrls: string[]) {
        // English: Reset protocol detection attempts counter at the start of each test
        // Russian: Сбрасываем счётчик попыток автоопределения протокола в начале каждого теста
        (global as any).__protocolAutoDetectionAttempts = {};

        const urls = testUrls.filter(u => u?.trim());
        if (!urls.length) return;
        const allProxies = Settings.current?.proxyServers || [];
        if (!allProxies.length) return;

        api.runtime.sendMessage({ command: "CHECK_START", total: allProxies.length });

        let completed = 0;
        for (const proxy of allProxies) {
            try {
                const result = await LocalProxyChecker.checkProxy(proxy, urls, false, 10000);
                completed++;
                api.runtime.sendMessage({
                    command: "CHECK_PROGRESS",
                    completed,
                    total: allProxies.length,
                    proxyHost: `${proxy.host}:${proxy.port}`,
                    alive: result.alive,
                    proxyId: proxy.id,
                    site: urls[0] || "",
                    statusType: result.statusType,
                    testType: "standard"
                });
                Core.sendTestLogStep({
                    type: 'next',
                    proxyId: proxy.id,
                    current: completed,
                    total: allProxies.length
                });
            } catch {
                completed++;
            }
        }
        Core.sendTestLogStep({
            type: 'complete',
            message: api.i18n.getMessage('testLogComplete') || 'Test completed – you may now start a new test.'
        });
        api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: allProxies.length });
    },

    async startQuickTestForSite(site: string, proxies: ProxyServer[]) {
        // English: Reset protocol detection attempts counter at the start of each test
        // Russian: Сбрасываем счётчик попыток автоопределения протокола в начале каждого теста
        (global as any).__protocolAutoDetectionAttempts = {};

        if (this._isRunning) {
            console.log("[ProxyTester] Быстрый тест уже запущен, игнорируем новый запуск");
            return;
        }
        this._isRunning = true;
        this._cancelRequested = false;
        this._currentSite = site;
        console.log(`[ProxyTester] startQuickTestForSite: enableDirectIpDetection = ${Settings.current?.options?.enableDirectIpDetection}`);
        Core.sendTestLogStep({
            type: 'info',
            message: api.i18n.getMessage('settingsProxyTestTitle') || 'Quick proxy test started',
            timestamp: Date.now()
        });
        if (Settings.current?.options?.enableDirectIpDetection) {
            try {
                const directIp = await IpServiceManager.getDirectIp();
                if (directIp) {
                    Core.sendTestLogStep({
                        type: 'direct-ip',
                        ip: directIp,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                console.warn("[ProxyTester] Failed to get direct IP:", e);
            }
        }
        this._total = proxies.length;
        this._completed = 0;

        this._registerWindowCloseListener();

        api.runtime.sendMessage({ command: "CHECK_START", total: this._total, completed: 0 });

        try {
            for (let i = 0; i < proxies.length; i++) {
                if (this._cancelRequested) {
                    console.log("[ProxyTester] Быстрый тест отменён, прерываем на индексе", i);
                    break;
                }
                const proxy = proxies[i];

                try {
                    const result = await quickCheckProxy(proxy, site, true);
                    if (result.error === "DIRECT_IP") {
                        console.log(`[ProxyTester] Прокси ${proxy.host}:${proxy.port} вернул прямой IP, пропускаем`);
                    }
                    if (!this._cancelRequested) {
                        this._completed++;
                        sendProgress(
                            proxy.id,
                            `${proxy.host}:${proxy.port}`,
                            site,
                            result.statusType,
                            this._completed,
                            this._total,
                            "express"
                        );
                    }
                    if (!this._cancelRequested) {
                        Core.sendTestLogStep({
                            type: 'next',
                            proxyId: proxy.id,
                            current: this._completed,
                            total: this._total
                        });
                    }
                } catch (e) {
                    if (!this._cancelRequested) {
                        this._completed++;
                        sendProgress(
                            proxy.id,
                            `${proxy.host}:${proxy.port}`,
                            site,
                            "fail",
                            this._completed,
                            this._total,
                            "express"
                        );
                    }
                }
            }
        } finally {
            // English: Always reset running state, even if an error occurs
            // Russian: Всегда сбрасываем состояние выполнения, даже если произошла ошибка
            const wasCancelled = this._cancelRequested;
            this._isRunning = false;
            this._cancelRequested = false;

            await SettingsOperation.saveAllLocal(true);

            this._unregisterWindowCloseListener();

            if (wasCancelled) {
                console.log("[ProxyTester] Быстрый тест отменён, завершено:", this._completed);
                Core.sendTestLogStep({
                    type: 'complete',
                    message: api.i18n.getMessage('testLogComplete') || 'Test completed – you may now start a new test.'
                });
                api.runtime.sendMessage({ command: "TEST_CANCELLED", completed: this._completed, total: this._total, site: this._currentSite });
            } else {
                console.log("[ProxyTester] Быстрый тест завершён");
                Core.sendTestLogStep({
                    type: 'complete',
                    message: api.i18n.getMessage('testLogComplete') || 'Test completed – you may now start a new test.'
                });
                api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: this._total, site: this._currentSite });
            }
        }
    },

    async startCheckForSite(site: string, proxies: ProxyServer[]) {
        // English: Reset protocol detection attempts counter at the start of each test
        // Russian: Сбрасываем счётчик попыток автоопределения протокола в начале каждого теста
        (global as any).__protocolAutoDetectionAttempts = {};

        if (this._isRunning) {
            console.log("[ProxyTester] Тест уже запущен, игнорируем новый запуск");
            return;
        }
        this._isRunning = true;
        this._cancelRequested = false;
        this._currentSite = site;
        Core.sendTestLogStep({
            type: 'info',
            message: api.i18n.getMessage('settingsProxyTestTitle') || 'Proxy test started',
            timestamp: Date.now()
        });
        if (Settings.current?.options?.enableDirectIpDetection) {
            try {
                const directIp = await IpServiceManager.getDirectIp();
                if (directIp) {
                    Core.sendTestLogStep({
                        type: 'direct-ip',
                        ip: directIp,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                console.warn("[ProxyTester] Failed to get direct IP:", e);
            }
        }
        this._total = proxies.length;
        this._completed = 0;

        this._registerWindowCloseListener();

        api.runtime.sendMessage({ command: "CHECK_START", total: this._total, completed: 0 });

        try {
            for (let i = 0; i < proxies.length; i++) {
                if (this._cancelRequested) {
                    console.log("[ProxyTester] Отмена теста, прерываем на индексе", i);
                    break;
                }
                const proxy = proxies[i];

                try {
                    const result = await LocalProxyChecker.checkProxy(proxy, [site], false, 8000, true);
                    if (!this._cancelRequested) {
                        this._completed++;
                        sendProgress(
                            proxy.id,
                            `${proxy.host}:${proxy.port}`,
                            site,
                            result.statusType,
                            this._completed,
                            this._total,
                            "standard"
                        );
                        Core.sendTestLogStep({
                            type: 'next',
                            proxyId: proxy.id,
                            current: this._completed,
                            total: this._total
                        });
                    }
                } catch (e) {
                    if (!this._cancelRequested) {
                        this._completed++;
                        sendProgress(
                            proxy.id,
                            `${proxy.host}:${proxy.port}`,
                            site,
                            "fail",
                            this._completed,
                            this._total,
                            "standard"
                        );
                    }
                }
            }
        } finally {
            // English: Always reset running state, even if an error occurs
            // Russian: Всегда сбрасываем состояние выполнения, даже если произошла ошибка
            const wasCancelled = this._cancelRequested;
            this._isRunning = false;
            this._cancelRequested = false;

            this._unregisterWindowCloseListener();

            if (wasCancelled) {
                console.log("[ProxyTester] Тест отменён, завершено:", this._completed);
                Core.sendTestLogStep({
                    type: 'complete',
                    message: api.i18n.getMessage('testLogComplete') || 'Test completed – you may now start a new test.'
                });
                api.runtime.sendMessage({ command: "TEST_CANCELLED", completed: this._completed, total: this._total, site: this._currentSite });
            } else {
                console.log("[ProxyTester] Тест завершён");
                Core.sendTestLogStep({
                    type: 'complete',
                    message: api.i18n.getMessage('testLogComplete') || 'Test completed – you may now start a new test.'
                });
                api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: this._total, site: this._currentSite });
            }
        }
    },

    async cancelTestForSite() {
        if (!this._isRunning) return;
        console.log("[ProxyTester] cancelTestForSite вызван");
        this._cancelRequested = true;
    },

    getStatus() {
        return {
            isRunning: this._isRunning,
            total: this._total,
            completed: this._completed,
            site: this._currentSite
        };
    },

    _registerWindowCloseListener() {
        if (this._windowRemovedListener) return;
        api.windows.getCurrent().then((win) => {
            this._mainWindowId = win.id;
        }).catch((err) => console.warn("[ProxyTester] Не удалось получить ID текущего окна:", err));
        
        this._windowRemovedListener = (windowId: number) => {
            if (this._isRunning && this._mainWindowId !== null && windowId === this._mainWindowId) {
                console.log("[ProxyTester] Основное окно закрыто, очищаем скрытые окна...");
                forceCloseExpressWindow().catch(() => {});
                LocalProxyChecker.forceCloseHiddenWindow().catch(() => {});
                this.cancelTestForSite();
            }
        };
        api.windows.onRemoved.addListener(this._windowRemovedListener);
    },

    _unregisterWindowCloseListener() {
        if (this._windowRemovedListener) {
            api.windows.onRemoved.removeListener(this._windowRemovedListener);
            this._windowRemovedListener = null;
            this._mainWindowId = null;
        }
    }
};