// src/core/ExpressProxyCycleTester.ts

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
import { CommandMessages, SmartProfileTypeBuiltinIds } from "./definitions";
import { Settings } from "./Settings";
import { SettingsOperation } from "./SettingsOperation";
import { IP_SERVICES, ERROR_INDICATORS, CERT_ERROR_INDICATORS } from "./TestConstants";

// ==================== Visual Mode (debug) ====================
const VISUAL_MODE = false;

// ==================== Tab creation without hidden window ====================
/**
 * English: Creates a new tab in the current window (no hidden window).
 * Russian: Создаёт новую вкладку в текущем окне (без скрытого окна).
 */
async function createTestTab(url: string): Promise<number> {
    const tab = await api.tabs.create({ url, active: false });
    if (!tab.id) throw new Error("Failed to create tab");
    console.log(`[ExpressCycleTester] Created test tab ID=${tab.id}`);
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
        console.log(`[ExpressCycleTester] Removed from history: ${url}`);
    } catch (e) {
        console.warn(`[ExpressCycleTester] Failed to remove from history: ${url}`, e);
    }
}

// ==================== Type Definitions ====================
type TestResult = {
    proxyId: string;
    proxyName: string;
    status: "success" | "indirect" | "fail" | "cancelled";
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

// ==================== IP Service Management ====================
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
                const text = await response.text();
                const ip = text.trim();
                const isValid = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
                if (isValid) {
                    results.push({ url, time: Date.now() - start });
                }
            }
        } catch (e) {}
    }
    results.sort((a, b) => a.time - b.time);
    return results.map(r => r.url);
}

// ==================== Direct Proxy API (using api.proxy) ====================
async function withDirectProxy<T>(fn: () => Promise<T>): Promise<T> {
    const proxyAPI = api.proxy;
    if (!proxyAPI) return fn();

    const originalConfig = await new Promise<any>(resolve => {
        proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
    });

    try {
        await new Promise<void>((resolve, reject) => {
            proxyAPI.settings.set({ value: { mode: "direct" }, scope: "regular" }, () => {
                if (api.runtime?.lastError) reject(new Error(api.runtime.lastError.message));
                else resolve();
            });
        });
        console.log(`[ExpressCycleTester] Временно переключён прямой прокси для получения IP`);
        return await fn();
    } finally {
        await new Promise<void>(resolve => {
            proxyAPI.settings.set({ value: originalConfig || { mode: "system" }, scope: "regular" }, () => resolve());
        });
        console.log(`[ExpressCycleTester] Прокси восстановлен`);
    }
}

function getProxyListFromSettings(): ProxyListItem[] {
    console.log("[ExpressCycleTester] Reading proxies directly from Settings.current...");
    if (!Settings.current || !Settings.current.proxyServers) {
        console.error("[ExpressCycleTester] Settings.current or proxyServers not available");
        return [];
    }
    const manualProxies = Settings.current.proxyServers || [];
    const subscribedProxies = SettingsOperation.getAllSubscribedProxyServers();
    const allProxies = [...manualProxies, ...subscribedProxies];
    console.log(`[ExpressCycleTester] Read ${manualProxies.length} manual + ${subscribedProxies.length} subscription = ${allProxies.length} total proxies`);
    const proxies: ProxyListItem[] = allProxies.map((proxy: any) => ({
        id: proxy.id,
        name: `${proxy.countryCode || ''} ${proxy.host}:${proxy.port}`,
        protocol: proxy.protocol,
        host: proxy.host,
        port: proxy.port
    }));
    return proxies;
}

async function getDirectIpBackground(): Promise<string | null> {
    console.log("[ExpressCycleTester] Getting direct IP...");
    if (environment.name === "Firefox") {
        console.log("[ExpressCycleTester] Using popup method for Firefox");
        const result = await getDirectIpViaPopup();
        if (result.workingServices && result.workingServices.length) {
            ipServicesRanked = result.workingServices;
        } else {
            ipServicesRanked = [...IP_SERVICES];
        }
        return result.directIp;
    }
    return await withDirectProxy(async () => {
        const workingServices: { url: string, time: number, ip: string }[] = [];
        for (const service of IP_SERVICES) {
            const start = Date.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const response = await fetch(service, {
                    signal: controller.signal,
                    cache: 'no-store',
                    redirect: 'error'
                });
                clearTimeout(timeoutId);
                if (response.ok && !response.url.startsWith('https://')) {
                    const text = await response.text();
                    const ip = text.trim();
                    const isValid = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
                    if (isValid) {
                        workingServices.push({ url: service, time: Date.now() - start, ip });
                        console.log(`[ExpressCycleTester] IP-сервис ${service} вернул ${ip} за ${Date.now() - start}мс`);
                    }
                }
            } catch (e) {
                console.log(`[ExpressCycleTester] IP-сервис ${service} недоступен`);
            }
        }
        if (workingServices.length === 0) {
            console.log("[ExpressCycleTester] Не найден доступный IP-сервис");
            return null;
        }
        workingServices.sort((a, b) => a.time - b.time);
        const fastestService = workingServices[0];
        const fastestIp = fastestService.ip;
        console.log(`%c[ExpressCycleTester] ПРЯМОЙ IP: ${fastestIp} (через ${fastestService.url} за ${fastestService.time}мс)`, 'color: #00aaff; font-weight: bold; font-size: 1.2em');
        ipServicesRanked = workingServices.map(s => s.url);
        return fastestIp;
    });
}

async function getDirectIpViaPopup(): Promise<{ directIp: string | null; workingServices: string[] }> {
    console.log("[ExpressCycleTester] Opening popup to get direct IP and working services...");
    return new Promise<{ directIp: string | null; workingServices: string[] }>((resolve) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const handler = (message: any) => {
            if (message && message.command === "DIRECT_IP_RESULT") {
                if (timeoutId) clearTimeout(timeoutId);
                api.runtime.onMessage.removeListener(handler);
                const ip = message.ip || null;
                const services = message.workingServices || [];
                console.log("[ExpressCycleTester] Received direct IP from popup:", ip);
                console.log("[ExpressCycleTester] Working services from popup:", services);
                resolve({ directIp: ip, workingServices: services });
            }
        };
        api.runtime.onMessage.addListener(handler);
        timeoutId = setTimeout(() => {
            api.runtime.onMessage.removeListener(handler);
            console.warn("[ExpressCycleTester] Timeout waiting for direct IP from popup");
            resolve({ directIp: null, workingServices: [] });
        }, 15000);
        const popupUrl = api.runtime.getURL("ui/popup.html?mode=getDirectIp");
        api.tabs.create({ url: popupUrl, active: false }).catch(err => {
            if (timeoutId) clearTimeout(timeoutId);
            api.runtime.onMessage.removeListener(handler);
            console.error("[ExpressCycleTester] Failed to open popup for IP detection:", err);
            resolve({ directIp: null, workingServices: [] });
        });
    });
}

// ==================== Main Test Class ====================
let webListenerRef: ((details: any) => void) | null = null;
let onTabUpdatedRef: ((tabId: number, changeInfo: any) => void) | null = null;
let onErrorRef: ((details: any) => void) | null = null;

export const ExpressProxyCycleTester = {
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
    _directIp: null as string | null,
    _testSite: "",
    _currentMainTabId: null as number | null,
    _currentIpTabId: null as number | null,
    _currentIpTabIds: [] as number[],
    _mainWindowId: null as number | null,

    _mainTabSuccess: false,
    _mainTabFailed: false,
    _hasIndirectSuccess: false,
    _directIpDetected: false,
    _exactSuccessTriggered: false,
    _responseReceived200: false,
    _faviconLoaded: false,
    _ipCheckCompleted: false,

    _mainTimer: null as ReturnType<typeof setTimeout> | null,
    _ipCheckResolve: null as ((value: string | null) => void) | null,
    _ipCheckPromise: null as Promise<string | null> | null,

    _cancelMessageListener: null as ((message: any) => void) | null,
    _windowRemovedListener: null as ((windowId: number) => void) | null,

    async startCycleTest(testSite: string, refreshTabSetting?: boolean, originalProfileId?: string | null, proxyList?: ProxyListItem[]): Promise<void> {
        try {
            this.reset();
            ipServicesRanked = null;
            lastSeenIpByService.clear();
            lastProxyKeyByService.clear();
            webListenerRef = null;
            onTabUpdatedRef = null;
            onErrorRef = null;

            if (this._isRunning) {
                console.log("[ExpressCycleTester] Test already running");
                return;
            }
            if (!Settings.current || !Settings.current.proxyServers) {
                console.log("[ExpressCycleTester] Settings not ready, waiting for initialization...");
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
                console.log("[ExpressCycleTester] Settings initialized");
            }

            console.log(`%c[ExpressCycleTester] ========== НАЧАЛО ЭКСПРЕСС-ЦИКЛИЧЕСКОГО ТЕСТА ==========`, 'color: #ffaa00; font-weight: bold; font-size: 1.1em');
            console.log(`%c[ExpressCycleTester] Тестовый сайт: ${testSite}`, 'color: #ffaa00');
            if (refreshTabSetting !== undefined) {
                console.log(`[ExpressCycleTester] refreshTabOnConfigChanges: ${refreshTabSetting}`);
            }
            if (originalProfileId) {
                console.log(`[ExpressCycleTester] Original profile ID: ${originalProfileId}`);
            }
            this._testSite = testSite;
            let normalizedSite = testSite.trim();
            if (!normalizedSite.startsWith("http://") && !normalizedSite.startsWith("https://")) {
                normalizedSite = "https://" + normalizedSite;
            }
            this._testSite = normalizedSite;

            if (proxyList && proxyList.length > 0) {
                this._proxiesList = proxyList;
                console.log(`[ExpressCycleTester] Using provided proxy list with ${proxyList.length} proxies`);
            } else {
                this._proxiesList = getProxyListFromSettings();
                if (this._proxiesList.length === 0) {
                    console.error("[ExpressCycleTester] No proxies found in settings");
                    return;
                }
            }
            console.log(`%c[ExpressCycleTester] Всего прокси для тестирования: ${this._proxiesList.length}`, 'color: #ffaa00');

            this._isRunning = true;
            this._cancelRequested = false;
            this._totalProxies = this._proxiesList.length;
            this._completedProxies = 0;
            this._currentProxyIndex = 0;

            api.windows.getCurrent().then((win) => {
                this._mainWindowId = win.id;
            }).catch((err) => console.warn("[ExpressCycleTester] Could not get current window ID:", err));

            if (!this._windowRemovedListener) {
                this._windowRemovedListener = (windowId: number) => {
                    if (this._isRunning && this._mainWindowId !== null && windowId === this._mainWindowId) {
                        console.log("[ExpressCycleTester] Main window closed, cleaning up...");
                        this.cancelTest();
                    }
                };
                api.windows.onRemoved.addListener(this._windowRemovedListener);
            }

            if (!this._cancelMessageListener) {
                this._cancelMessageListener = (message: any) => {
                    if (!this._isRunning) return;
                    const command = message?.command;
                    if (command === "CANCEL_PROXY_TEST_FOR_SITE" || command === "CANCEL_CYCLE_TEST_FOR_SITE" || command === "TEST_CANCELLED") {
                        console.log(`[ExpressCycleTester] Received cancellation command: ${command}`);
                        this.cancelTest();
                    }
                };
                api.runtime.onMessage.addListener(this._cancelMessageListener);
            }

            this._directIp = await this.getDirectIpWithCancellation();
            if (this._cancelRequested) {
                console.log("[ExpressCycleTester] Cancelled during direct IP detection, exiting.");
                api.runtime.sendMessage({ command: "TEST_CANCELLED" });
                return;
            }
            console.log(`%c[ExpressCycleTester] Прямой IP: ${this._directIp || "не получен"}`, 'color: #00aaff; font-weight: bold');

            if (!ipServicesRanked || ipServicesRanked.length === 0) {
                console.warn(`[ExpressCycleTester] Список IP-сервисов пуст, используем полный список как fallback`);
                ipServicesRanked = [...IP_SERVICES];
            }

            api.runtime.sendMessage({
                command: "CHECK_START",
                total: this._totalProxies,
                completed: 0,
                testType: "express-cycle"
            });

            await this.runTestLoop();
        } finally {
            // English: No hidden window to close anymore
            // Russian: Больше нет скрытого окна для закрытия
        }
    },

    async runTestLoop(): Promise<void> {
        for (let i = 0; i < this._proxiesList.length; i++) {
            if (this._cancelRequested) {
                console.log("[ExpressCycleTester] Cancellation detected, stopping after current proxy completes");
                break;
            }

            this._currentProxyIndex = i;
            const proxy = this._proxiesList[i];
            console.log(`%c[ExpressCycleTester] >>> ТЕСТИРУЕМ ПРОКСИ ${i + 1}/${this._totalProxies}: ${proxy.name} <<<`, 'color: #ffffaa; font-weight: bold; font-size: 1.3em');

            Settings.updateActiveSettings();

            console.log(`%c[ExpressCycleTester] ========== НАЧАЛО ПЕРЕКЛЮЧЕНИЯ ПРОКСИ ==========`, 'color: #ffaa00; font-weight: bold');
            console.log(`[ExpressCycleTester] Текущее время: ${new Date().toLocaleTimeString()}`);

            const waitForProfile = async (targetProfileId: string, maxAttempts: number = 15): Promise<boolean> => {
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    await new Promise(r => setTimeout(r, 300));
                    Settings.updateActiveSettings();
                    const currentProfile = Settings.current?.activeProfileId;
                    if (currentProfile === targetProfileId) {
                        console.log(`%c[ExpressCycleTester] ✓ Профиль подтверждён: ${currentProfile} (попытка ${attempt})`, 'color: #ffffaa');
                        return true;
                    }
                    console.log(`[ExpressCycleTester] Ожидание смены профиля: сейчас ${currentProfile}, ожидаем ${targetProfileId} (попытка ${attempt}/${maxAttempts})`);
                }
                console.log(`%c[ExpressCycleTester] ✗ Не удалось сменить профиль на ${targetProfileId}`, 'color: #ff0000');
                return false;
            };

            const waitForProxy = async (targetProxyId: string, maxAttempts: number = 15): Promise<boolean> => {
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    await new Promise(r => setTimeout(r, 300));
                    Settings.updateActiveSettings();
                    let currentProxyId = Settings.active?.currentProxyServer?.id;
                    if (!currentProxyId) {
                        currentProxyId = Settings.current?.defaultProxyServerId;
                    }
                    if (currentProxyId === targetProxyId) {
                        console.log(`%c[ExpressCycleTester] ✓ Прокси подтверждён: ${currentProxyId} (попытка ${attempt})`, 'color: #00ff00');
                        return true;
                    }
                    console.log(`[ExpressCycleTester] Ожидание смены прокси: сейчас ${currentProxyId}, ожидаем ${targetProxyId} (попытка ${attempt}/${maxAttempts})`);
                }
                console.log(`%c[ExpressCycleTester] ✗ Не удалось сменить прокси на ${targetProxyId}`, 'color: #ff0000');
                return false;
            };

            const beforeProfile = Settings.current?.activeProfileId;
            console.log(`%c[ExpressCycleTester] Текущий активный профиль ДО переключения: ${beforeProfile || 'unknown'}`, 'color: #888888');

            const targetProfileId = SmartProfileTypeBuiltinIds.AlwaysEnabled;
            const profile = Settings.current.proxyProfiles.find(p => p.profileId === targetProfileId);
            if (profile) {
                Settings.current.activeProfileId = targetProfileId;
                SettingsOperation.saveActiveProfile();
                SettingsOperation.saveAllSync(false);
                Settings.updateActiveSettings();
                console.log(`[ExpressCycleTester] Профиль изменён на ${targetProfileId} через Settings`);
            } else {
                console.error(`[ExpressCycleTester] Профиль ${targetProfileId} не найден`);
            }
            api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProfile, profileId: targetProfileId });
            await waitForProfile(targetProfileId, 15);

            const targetProxy = SettingsOperation.findProxyServerById(proxy.id);
            if (targetProxy) {
                Settings.current.defaultProxyServerId = proxy.id;
                SettingsOperation.saveDefaultProxyServer();
                SettingsOperation.saveAllSync(false);
                Settings.updateActiveSettings();
                console.log(`[ExpressCycleTester] Прокси ${proxy.id} установлен как default`);
                if (environment.name !== "Firefox") {
                    try {
                        const proxyAPI = api.proxy;
                        if (proxyAPI) {
                            const scheme = (proxy.protocol || 'HTTP').toLowerCase();
                            const config = {
                                mode: "fixed_servers",
                                rules: {
                                    singleProxy: { scheme: scheme, host: proxy.host, port: proxy.port },
                                    bypassList: ["<local>"]
                                }
                            };
                            await new Promise<void>((resolve, reject) => {
                                proxyAPI.settings.set({ value: config, scope: "regular" }, () => {
                                    if (api.runtime?.lastError) reject(new Error(api.runtime.lastError.message));
                                    else resolve();
                                });
                            });
                            console.log(`[ExpressCycleTester] Proxy set via API for ${proxy.name} (${environment.name})`);
                        }
                    } catch (e) {
                        console.warn(`[ExpressCycleTester] Failed to set proxy via API:`, e);
                    }
                }
            } else {
                console.error(`[ExpressCycleTester] Прокси ${proxy.id} не найден`);
            }
            api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProxyServer, id: proxy.id });
            await waitForProxy(proxy.id, 15);

            const protocolUpper = (proxy.protocol || 'HTTP').toUpperCase();
            let delay = 1500;
            if (protocolUpper.includes('SOCKS5')) delay = 3000;
            else if (protocolUpper.includes('SOCKS4')) delay = 2500;
            else if (protocolUpper === 'HTTPS') delay = 2000;
            console.log(`%c[ExpressCycleTester] Ожидание применения прокси (${delay}мс для ${protocolUpper})...`, 'color: #ffaa00');
            await new Promise(resolve => setTimeout(resolve, delay));
            console.log(`%c[ExpressCycleTester] ========== ПЕРЕКЛЮЧЕНИЕ ЗАВЕРШЕНО ==========`, 'color: #ffffaa; font-weight: bold');

            const testResult = await this.testCurrentProxy(proxy);
            if (!testResult) {
                console.error(`[ExpressCycleTester] No test result for proxy ${proxy.name}, skipping`);
                continue;
            }
            if (testResult.status === "cancelled") {
                console.log(`[ExpressCycleTester] Skipping cancelled proxy ${proxy.name}`);
                break;
            }

            api.runtime.sendMessage({
                command: "CHECK_PROGRESS",
                completed: i + 1,
                total: this._totalProxies,
                proxyHost: proxy.name,
                alive: testResult.status === "success" || testResult.status === "indirect",
                proxyId: proxy.id,
                site: this._testSite,
                statusType: testResult.status,
                testType: "express-cycle"
            });

            this._completedProxies = i + 1;
            const normalizedSite = this._testSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
            if (testResult.status === "success" || testResult.status === "indirect") {
                SettingsOperation.updateProxyRating(proxy.id, 1);
            } else {
                SettingsOperation.updateProxyRating(proxy.id, -1);
            }
            if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
            if (!Settings.current.autoStatus[proxy.id]) Settings.current.autoStatus[proxy.id] = {};
            Settings.current.autoStatus[proxy.id][normalizedSite] = {
                status: testResult.status,
                timestamp: Date.now()
            };
            await SettingsOperation.saveAllLocal(true);
            await SettingsOperation.saveAllSync(false);
            api.runtime.sendMessage({
                command: "UPDATE_AUTO_STATUS",
                proxyId: proxy.id,
                site: normalizedSite,
                status: testResult.status,
                timestamp: Date.now()
            }).catch(err => console.warn(err));
        }

        const wasCancelled = this._cancelRequested;
        this._isRunning = false;
        await SettingsOperation.saveAllLocal(true);
        await SettingsOperation.saveAllSync(false);
        await new Promise<void>((resolve) => {
            api.runtime.sendMessage({ command: CommandMessages.PopupChangeActiveProfile, profileId: SmartProfileTypeBuiltinIds.Direct }, () => {
                console.log("[ExpressCycleTester] Switched to Direct profile after test");
                resolve();
            });
        });

        if (wasCancelled) {
            console.log("[ExpressCycleTester] Test cancelled");
            api.runtime.sendMessage({ command: "TEST_CANCELLED", completed: this._completedProxies, total: this._totalProxies, site: this._testSite, testType: "express-cycle" });
        } else {
            console.log(`%c[ExpressCycleTester] ========== ТЕСТ ЗАВЕРШЁН ==========`, 'color: #00ff00; font-weight: bold; font-size: 1.2em');
            api.runtime.sendMessage({ command: "CHECK_COMPLETE", total: this._totalProxies, site: this._testSite, testType: "express-cycle" });
        }
        api.runtime.sendMessage({ command: "EXPRESS_CYCLE_TEST_FINISHED" });
    },

    async testCurrentProxy(proxy: ProxyListItem): Promise<TestResult> {
        const startTime = Date.now();
        this._mainTabSuccess = false;
        this._mainTabFailed = false;
        this._hasIndirectSuccess = false;
        this._directIpDetected = false;
        this._exactSuccessTriggered = false;
        this._responseReceived200 = false;
        this._faviconLoaded = false;
        this._ipCheckCompleted = false;
        this._currentMainTabId = null;
        this._currentIpTabId = null;
        this._currentIpTabIds = [];

        if (this._cancelRequested) {
            console.log(`[ExpressCycleTester] Cancellation requested before test start for ${proxy.name}, returning cancelled`);
            return { proxyId: proxy.id, proxyName: proxy.name, status: "cancelled", latencyMs: 0 };
        }

        webListenerRef = null;
        onTabUpdatedRef = null;
        onErrorRef = null;

        this._ipCheckPromise = new Promise<string | null>((resolve) => {
            this._ipCheckResolve = resolve;
        });

        console.log(`[ExpressCycleTester] Создание основной вкладки для прокси ${proxy.name}, время=${Date.now()}`);
        const mainTabId = await createTestTab(this._testSite);
        this._currentMainTabId = mainTabId;
        console.log(`[ExpressCycleTester] Основная вкладка открыта id=${this._currentMainTabId}, время=${Date.now()}`);

        setTimeout(async () => {
            console.log(`%c[ExpressCycleTester] Запуск проверки IP через прокси...`, 'color: #ff8800');
            const ip = await this.fetchProxyIpViaTab(proxy);
            this._ipCheckCompleted = true;
            if (this._ipCheckResolve) {
                this._ipCheckResolve(ip);
                this._ipCheckResolve = null;
            }
            if (ip) {
                if (this._directIp && ip === this._directIp) {
                    this._directIpDetected = true;
                    console.log(`%c[ExpressCycleTester] ❌ IP-вкладка вернула ПРЯМОЙ IP: ${ip}`, 'color: #ff0000; font-weight: bold; font-size: 1.2em');
                } else {
                    this._hasIndirectSuccess = true;
                    console.log(`[ExpressCycleTester] IP через прокси: ${ip}`);
                    if (this._currentMainTabId) {
                        try {
                            await api.tabs.update(this._currentMainTabId, { active: true });
                            console.log(`[ExpressCycleTester] Основная вкладка ${this._currentMainTabId} активирована`);
                        } catch (e) {}
                    }
                }
            } else {
                console.log(`[ExpressCycleTester] IP-вкладка не вернула IP`);
            }
            await this.decideFinalResult();
        }, 70);

        await this.setupMainTabListeners();

        // Main timer: 10 seconds for express test
        this._mainTimer = setTimeout(async () => {
            if (!this._cancelRequested && !this._exactSuccessTriggered) {
                console.log(`%c[ExpressCycleTester] Таймаут (10 сек)`, 'color: #ffaa00');
                this._mainTabFailed = true;
                await this.decideFinalResult();
            }
        }, 10000);

        while (!this._exactSuccessTriggered && !(this._mainTabFailed && this._ipCheckCompleted)) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await this.closeTestTabs();
        const latency = Date.now() - startTime;

        if (this._exactSuccessTriggered) {
            console.log(`%c[ExpressCycleTester] ✅ РЕЗУЛЬТАТ: ${proxy.name} = УСПЕХ (${latency}мс)`, 'color: #00ff00; font-weight: bold; font-size: 1.4em');
            return { proxyId: proxy.id, proxyName: proxy.name, status: "success", latencyMs: latency };
        } else if (this._hasIndirectSuccess && !this._directIpDetected) {
            console.log(`%c[ExpressCycleTester] ☑️ РЕЗУЛЬТАТ: ${proxy.name} = КОСВЕННЫЙ УСПЕХ (${latency}мс)`, 'color: #0088ff; font-weight: bold; font-size: 1.4em');
            return { proxyId: proxy.id, proxyName: proxy.name, status: "indirect", latencyMs: latency };
        } else {
            console.log(`%c[ExpressCycleTester] ❌ РЕЗУЛЬТАТ: ${proxy.name} = НЕ РАБОТАЕТ (${latency}мс)`, 'color: #ff3333; font-weight: bold; font-size: 1.4em');
            return { proxyId: proxy.id, proxyName: proxy.name, status: "fail", latencyMs: latency };
        }
    },

    async fetchProxyIpViaTab(proxy: ProxyListItem): Promise<string | null> {
        let workingServices = ipServicesRanked;
        if (!workingServices || workingServices.length === 0) {
            workingServices = await getRankedIpServices();
            ipServicesRanked = workingServices;
        }
        if (!workingServices.length) {
            console.log(`%c[ExpressCycleTester] ❌ Нет доступных IP-сервисов`, 'color: #ff0000');
            return null;
        }
        const servicesToTry = workingServices.slice(0, 3);
        console.log(`[ExpressCycleTester] 🔍 Параллельная проверка IP через ${servicesToTry.length} сервисов для прокси ${proxy.name}`);

        const testService = async (serviceUrl: string): Promise<string | null> => {
            const cacheBuster = (serviceUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
            const freshUrl = serviceUrl + cacheBuster;
            return new Promise<string | null>((resolve) => {
                let ipTabId: number | null = null;
                let timeoutId: ReturnType<typeof setTimeout> | null = null;
                let isResolved = false;

                createTestTab(freshUrl).then(async (tabId) => {
                    if (this._cancelRequested) {
                        if (tabId) try { await api.tabs.remove(tabId); await removeFromHistory(freshUrl); } catch(e) {}
                        if (timeoutId) clearTimeout(timeoutId);
                        resolve(null);
                        return;
                    }
                    ipTabId = tabId;
                    this._currentIpTabIds.push(ipTabId);
                    console.log(`[ExpressCycleTester] IP-вкладка создана, ID=${ipTabId}, всего IP-вкладок=${this._currentIpTabIds.length}`);
                    if (VISUAL_MODE) {
                        try { await api.tabs.update(ipTabId, { active: true }); } catch(e) {}
                    }

                    const onUpdated = async (tabId: number, changeInfo: any) => {
                        if (tabId !== ipTabId || changeInfo.status !== 'complete') return;
                        api.tabs.onUpdated.removeListener(onUpdated);
                        if (isResolved) return;

                        const executeScript = () => {
                            const code = 'document.body.innerText || document.body.textContent || ""';
                            if (api.scripting && api.scripting.executeScript) {
                                api.scripting.executeScript({
                                    target: { tabId: ipTabId! },
                                    func: () => document.body.innerText || document.body.textContent || ""
                                }, (results) => {
                                    if (api.runtime.lastError) {
                                        resolve(null);
                                        return;
                                    }
                                    const ip = results && results[0] && results[0].result ? results[0].result.trim() : null;
                                    if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                                        resolve(ip);
                                    } else {
                                        resolve(null);
                                    }
                                });
                            } else if (api.tabs && api.tabs.executeScript) {
                                api.tabs.executeScript(ipTabId!, { code: code }, (results) => {
                                    if (api.runtime.lastError) {
                                        resolve(null);
                                        return;
                                    }
                                    const ip = results && results[0] ? results[0].trim() : null;
                                    if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
                                        resolve(ip);
                                    } else {
                                        resolve(null);
                                    }
                                });
                            } else {
                                resolve(null);
                            }
                        };
                        executeScript();
                    };
                    api.tabs.onUpdated.addListener(onUpdated);

                    timeoutId = setTimeout(() => {
                        if (!isResolved) {
                            isResolved = true;
                            api.tabs.onUpdated.removeListener(onUpdated);
                            if (ipTabId) try { api.tabs.remove(ipTabId); removeFromHistory(freshUrl); } catch(e) {}
                            resolve(null);
                        }
                    }, 10000);
                }).catch(() => resolve(null));
            });
        };

        const promises = servicesToTry.map(service => testService(service));
        const result = await Promise.any(promises.map(p => p.then(ip => {
            if (ip !== null) return ip;
            throw new Error('no_ip');
        }))).catch(() => null);

        if (result) {
            console.log(`%c[ExpressCycleTester] ✅ Получен IP через прокси: ${result}`, 'color: #00ff00');
            return result;
        }
        console.log(`%c[ExpressCycleTester] ❌ Не удалось получить IP ни от одного сервиса`, 'color: #ff0000');
        return null;
    },

    async setupMainTabListeners(): Promise<void> {
        const that = this;
        const webReq = (api as any).webRequest;

        if (webReq && webReq.onResponseStarted) {
            webListenerRef = function(details: any) {
                if (details.tabId === that._currentMainTabId && details.statusCode === 200 && !that._responseReceived200) {
                    console.log(`%c[ExpressCycleTester] ★ Получен ответ 200`, 'color: #00ff00');
                    that._responseReceived200 = true;
                    that.checkExactSuccess();
                }
            };
            webReq.onResponseStarted.addListener(webListenerRef, { urls: ["<all_urls>"] });
        }

        onTabUpdatedRef = async function(tabId: number, changeInfo: any) {
            if (tabId !== that._currentMainTabId) return;

            if (changeInfo.favIconUrl && !that._faviconLoaded) {
                const favUrl = changeInfo.favIconUrl.toLowerCase();
                const isDataUrl = favUrl.startsWith('data:');
                const isBrowserInternal = favUrl.startsWith('chrome://') || 
                                          favUrl.startsWith('about:') || 
                                          favUrl.startsWith('moz-extension://') || 
                                          favUrl.startsWith('resource://');
                const isErrorFav = ERROR_INDICATORS.some(e => favUrl.includes(e.toLowerCase()));
                if (!isErrorFav && !isDataUrl && !isBrowserInternal) {
                    let testHost = that._testSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
                    let favHost = '';
                    try {
                        favHost = new URL(favUrl).hostname;
                    } catch (e) {}
                    const isSameDomain = favHost === testHost || favHost.endsWith('.' + testHost);
                    if (isSameDomain) {
                        console.log(`%c[ExpressCycleTester] ★ Favicon загружен (HTTP) from ${favHost}`, 'color: #00ff00');
                        that._faviconLoaded = true;
                        that.checkExactSuccess();
                    } else {
                        console.log(`[ExpressCycleTester] ⚠️ Favicon from different domain ${favHost} (ignored, expected ${testHost})`);
                    }
                } else if (isDataUrl) {
                    console.log(`[ExpressCycleTester] ⚠️ Favicon data: URL (ignored, not a real favicon)`);
                } else if (isBrowserInternal) {
                    console.log(`[ExpressCycleTester] ⚠️ Favicon browser internal URI: ${favUrl.substring(0, 50)} (ignored)`);
                }
            }

            if (changeInfo.title) {
                const titleLower = changeInfo.title.toLowerCase();
                const isCertError = CERT_ERROR_INDICATORS.some(e => titleLower.includes(e.toLowerCase()));
                const isError = ERROR_INDICATORS.some(e => titleLower.includes(e.toLowerCase()));

                if (isCertError && !that._responseReceived200) {
                    console.log(`%c[ExpressCycleTester] ★ Ошибка сертификата (прокси работает)`, 'color: #00ff00');
                    that._responseReceived200 = true;
                    that.checkExactSuccess();
                }

                if (isError && !that._responseReceived200 && !that._exactSuccessTriggered) {
                    console.log(`[ExpressCycleTester] ❌ Ошибка в заголовке`);
                    that._mainTabFailed = true;
                    that.decideFinalResult();
                }
            }
        };
        api.tabs.onUpdated.addListener(onTabUpdatedRef);

        if (api.webNavigation && api.webNavigation.onErrorOccurred) {
            onErrorRef = function(details: any) {
                if (details.tabId === that._currentMainTabId && details.frameId === 0 && !that._exactSuccessTriggered) {
                    console.log(`%c[ExpressCycleTester] ⚠️ Ошибка навигации`, 'color: #ffaa00');
                    that._mainTabFailed = true;
                    that.decideFinalResult();
                }
            };
            api.webNavigation.onErrorOccurred.addListener(onErrorRef);
        }
    },

    checkExactSuccess(): void {
        if (this._exactSuccessTriggered) return;
        if (this._responseReceived200 || this._faviconLoaded) {
            console.log(`%c[ExpressCycleTester] ★ Точный успех!`, 'color: #00ff00; font-weight: bold');
            this._exactSuccessTriggered = true;
            this._mainTabSuccess = true;
            this.decideFinalResult();
        }
    },

    async decideFinalResult(): Promise<void> {
        if (this._cancelRequested) {
            this.cleanupTimers();
            return;
        }
        if (this._exactSuccessTriggered) return;

        if (this._ipCheckPromise && !this._ipCheckCompleted && !this._cancelRequested) {
            console.log(`[ExpressCycleTester] Ожидание завершения IP-проверки перед принятием решения...`);
            await this._ipCheckPromise;
        }
        if (this._cancelRequested) {
            this.cleanupTimers();
            return;
        }
        if (this._responseReceived200 || this._faviconLoaded) {
            this._exactSuccessTriggered = true;
            this._mainTabSuccess = true;
            this.cleanupTimers();
            return;
        }

        if (this._hasIndirectSuccess && !this._directIpDetected) {
            if (this._mainTabFailed) {
                console.log(`[ExpressCycleTester] Косвенный успех, основная вкладка провалилась, завершаем`);
                this.cleanupTimers();
                return;
            }
            return;
        }

        if (this._directIpDetected || (this._mainTabFailed && this._ipCheckCompleted && !this._hasIndirectSuccess)) {
            this.cleanupTimers();
            return;
        }
    },

    cleanupTimers(): void {
        if (this._mainTimer) { clearTimeout(this._mainTimer); this._mainTimer = null; }
        this._mainTabFailed = true;
    },

    async closeTestTabs(): Promise<void> {
        const webReq = (api as any).webRequest;
        if (webReq && webReq.onResponseStarted && webListenerRef) {
            webReq.onResponseStarted.removeListener(webListenerRef);
            webListenerRef = null;
        }
        if (onTabUpdatedRef) {
            api.tabs.onUpdated.removeListener(onTabUpdatedRef);
            onTabUpdatedRef = null;
        }
        if (onErrorRef && api.webNavigation) {
            api.webNavigation.onErrorOccurred.removeListener(onErrorRef);
            onErrorRef = null;
        }

        const tabIdSet = new Set<number>();
        if (this._currentMainTabId !== null) tabIdSet.add(this._currentMainTabId);
        if (this._currentIpTabId !== null) tabIdSet.add(this._currentIpTabId);
        if (this._currentIpTabIds && this._currentIpTabIds.length) {
            for (const id of this._currentIpTabIds) {
                if (id !== null) tabIdSet.add(id);
            }
        }

        console.log(`[ExpressCycleTester] Закрытие тестовых вкладок: уникальных ID=${tabIdSet.size}, время=${Date.now()}`);
        for (const tabId of tabIdSet) {
            try {
                const tab = await api.tabs.get(tabId);
                const url = tab.url;
                await api.tabs.remove(tabId);
                console.log(`[ExpressCycleTester] Tab ${tabId} closed successfully, time=${Date.now()}`);
                await removeFromHistory(url);
            } catch (e: any) {
                console.log(`[ExpressCycleTester] Tab ${tabId} already gone, skipping`);
            }
        }

        this._currentMainTabId = null;
        this._currentIpTabId = null;
        this._currentIpTabIds = [];
        console.log(`[ExpressCycleTester] Все вкладки закрыты, время=${Date.now()}`);
    },

    async cancelTest(): Promise<void> {
        if (!this._isRunning) return;
        console.log("[ExpressCycleTester] Cancel requested - current proxy will complete, next ones will not start");
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

    async getDirectIpWithCancellation(): Promise<string | null> {
        let ipResult: string | null = null;
        let isResolved = false;
        getDirectIpBackground().then(ip => {
            ipResult = ip;
            isResolved = true;
        }).catch(() => {
            isResolved = true;
        });
        while (!isResolved) {
            if (this._cancelRequested) {
                console.log("[ExpressCycleTester] Cancelled while getting direct IP");
                return null;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        return ipResult;
    },

    reset(): void {
        this._isRunning = false;
        this._cancelRequested = false;
        this._totalProxies = 0;
        this._completedProxies = 0;
        this._currentProxyIndex = 0;
        this._proxiesList = [];
        this._directIp = null;
        this._testSite = "";
        this._currentMainTabId = null;
        this._currentIpTabId = null;
        this._currentIpTabIds = [];
        this._mainTabSuccess = false;
        this._mainTabFailed = false;
        this._hasIndirectSuccess = false;
        this._directIpDetected = false;
        this._exactSuccessTriggered = false;
        this._responseReceived200 = false;
        this._faviconLoaded = false;
        this._ipCheckCompleted = false;
        if (this._mainTimer) clearTimeout(this._mainTimer);
        this._mainTimer = null;
        this._ipCheckResolve = null;
        this._ipCheckPromise = null;

        if (this._cancelMessageListener) {
            api.runtime.onMessage.removeListener(this._cancelMessageListener);
            this._cancelMessageListener = null;
        }
        if (this._windowRemovedListener) {
            api.windows.onRemoved.removeListener(this._windowRemovedListener);
            this._windowRemovedListener = null;
        }
        this._mainWindowId = null;
        ipServicesRanked = null;
        lastSeenIpByService.clear();
        lastProxyKeyByService.clear();
        webListenerRef = null;
        onTabUpdatedRef = null;
        onErrorRef = null;
        this.closeTestTabs().catch(err => console.warn("[ExpressCycleTester] Error closing leftover tabs during reset:", err));
    }
};
console.log("[ProxyMust] ExpressProxyCycleTester.ts loaded successfully (BACKGROUND MODE)");