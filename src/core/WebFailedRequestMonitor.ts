/*
 * Original SmartProxy copyright:
 * This file is part of SmartProxy <https://github.com/salarcode/SmartProxy>,
 * Copyright (C) 2023 Salar Khalilzadeh <salar2k@gmail.com>
 *
 * SmartProxy is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * SmartProxy is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartProxy.  If not, see <http://www.gnu.org/licenses/>.
 */
/*
 * Modifications for ProxyMust:
 * Copyright (C) 2026 nana-xakep <xakep.nana@gmail.com>
 * - Added rating system, proxy testing, country flags, etc.
 * - Added AutoProxy failover support with successful proxy caching and status updates.
 * - Replaced automatic pinning with user dialog (pin/change) and removed _siteLock.
 * - Fixed: rule.proxyServerId no longer blocks failover when mode === 'auto'.
 * - Fixed: failover stops for sites with pinned proxy (user confirmed).
 * - Fixed: failover only triggers on error, not on success.
 * - Fixed: proper handling of first load in new tab (tabId may be -1 initially).
 * - Fixed: auto-logic is completely disabled when profile is not SmartRules or mode is not 'auto'.
 * - Fixed: clearing failover state when switching away from auto mode.
 * - Fixed: temp skip list persists through the entire cycle, preventing repeated attempts of skipped proxies.
 * - Fixed: failover continues from the last index, not restarting from the beginning after each failure.
 * - NEW: Save success status for any proxy in any profile (not only SmartRules/auto).
 */
import { WebRequestMonitor, RequestMonitorEvent } from "./WebRequestMonitor";
import { PolyFill } from "../lib/PolyFill";
import { Core } from "./Core";
import { ProxyRules } from "./ProxyRules";
import { Utils } from "../lib/Utils";
import { TabManager } from "./TabManager";
import { CommandMessages, FailedRequestType, CompiledProxyRule, SmartProfileType, ProxyServer, ProxyRuleSpecialProxyServer } from "./definitions";
import { Settings } from "./Settings";
import { Debug } from "../lib/Debug";
import { ProxySelector } from './ProxySelector';
import { SettingsOperation } from './SettingsOperation';
import { ProxyEngine } from './ProxyEngine';
import { getProxyStatus } from './statusUtils';
import { saveResult } from './ResultSaver';
import { AutoStatusService } from './AutoStatusService';
import { api } from '../lib/environment';


export class WebFailedRequestMonitor {

    public static startMonitor() {
        console.log('[WebFailedRequestMonitor] startMonitor вызван');
        WebRequestMonitor.startMonitor(WebFailedRequestMonitor.requestMonitorCallback);
        // English: Listen to tab removal to clean up failover state
        // Russian: Слушаем закрытие вкладки для очистки состояния failover
        TabManager.TabRemoved.on(WebFailedRequestMonitor._onTabRemoved);
    }

    private static notifyFailedRequestNotification: boolean = true;

    // English: Global cancel flag for failover (user pressed stop)
    // Russian: Глобальный флаг отмены failover (пользователь нажал стоп)
    private static _cancelFailover: boolean = false;

    public static cancelFailover(): void {
        WebFailedRequestMonitor._cancelFailover = true;
        console.log('[WebFailedRequestMonitor] Отмена failover (глобально)');
    }

    public static resetCancelFailover(): void {
        WebFailedRequestMonitor._cancelFailover = false;
    }

    public static enableFailedRequestNotification() {
        WebFailedRequestMonitor.notifyFailedRequestNotification = true;
        Debug.log("FailedRequestNotification is Enabled");
    }

    public static disableFailedRequestNotification() {
        WebFailedRequestMonitor.notifyFailedRequestNotification = false;
        Debug.log("FailedRequestNotification is Disabled");
    }

    // English: Cache of successful proxies per site (site -> proxyId)
    // Russian: Кэш успешных прокси для каждого сайта (сайт -> proxyId)
    private static _successfulProxyCache: Map<string, string> = new Map();

    // English: Prevent multiple failover attempts for the same site while one is in progress.
    // Russian: Предотвращаем множественные попытки failover для одного сайта, пока одна выполняется.
    private static _failoverInProgress: Set<string> = new Set();

    // English: Track current index in the sorted proxy list for each site during failover
    // Russian: Отслеживание текущего индекса в отсортированном списке прокси для каждого сайта во время failover
    private static _failoverIndex: Map<string, number> = new Map();

    // English: Track number of full cycles for each site (used for maxFailoverAttempts)
    // Russian: Отслеживание количества полных циклов для каждого сайта (используется для maxFailoverAttempts)
    private static _failoverCycleCount: Map<string, number> = new Map();

    // English: Store the proxy that user manually selected for a site (to try it first)
    // Russian: Храним прокси, который пользователь выбрал вручную для сайта (чтобы попробовать его первым)
    private static _userSelectedProxy: Map<string, string> = new Map();

    // English: Temporary skip list for a site (proxies to skip in current cycle)
    // Russian: Временный список пропуска для сайта (прокси, которые нужно пропустить в текущем цикле)
    private static _tempSkipList: Map<string, Set<string>> = new Map();

    // English: Sites where auto-pin should be skipped (e.g. after user initiated change via 🔄)
    // Russian: Сайты, для которых следует пропустить авто-закрепление (например, после смены через 🔄)
    private static _skipAutoPinForSite: Set<string> = new Set();

    // English: Sites where user initiated a change via 🔄 (used to suppress change dialog on next load)
    // Russian: Сайты, где пользователь инициировал смену через 🔄 (используется для подавления диалога смены при следующей загрузке)
    private static _userInitiatedChange: Set<string> = new Set();

    // English: Store user-initiated navigation type per tab (reload, typed)
    // Russian: Хранит тип навигации, инициированной пользователем, для каждой вкладки
    private static _userInitiatedNavigation: Map<number, 'reload' | 'typed'> = new Map();

    // English: Track which sites we've already shown the "add unreachable" dialog for
    // Russian: Отслеживаем сайты, для которых уже показали диалог добавления недоступного
    private static _addSiteDialogsShown: Set<string> = new Set();

    // English: Track last time we showed change dialog for a pinned site (to prevent spam)
    // Russian: Отслеживаем время последнего показа диалога смены для закреплённого сайта (чтобы избежать спама)
    private static _lastChangeDialogTime: Map<string, number> = new Map();
	
    // English: Track last time we showed pin dialog for a site + proxy (to prevent duplicate pin dialogs)
    // Russian: Отслеживаем время последнего показа диалога закрепления для сайта + прокси (чтобы избежать дублирования)
    private static _lastPinDialogTime: Map<string, number> = new Map();	

    // English: Per-site cancel flag for failover (user pressed stop in browser)
    // Russian: Флаг отмены failover для конкретного сайта (пользователь нажал стоп в браузере)
    private static _cancelFailoverForSite: Set<string> = new Set();

    // English: Flag to prevent automatic restart of failover after user pressed stop
    // Russian: Флаг для предотвращения автоматического перезапуска failover после того, как пользователь нажал стоп
    private static _userStoppedFailover: Set<string> = new Set();

    /**
     * English: Normalizes site domain (removes protocol, www., trailing slash)
     * Russian: Нормализует домен сайта (удаляет протокол, www., завершающий слэш)
     */
    private static normalizeSite(site: string): string | null {
        if (!site) return null;
        let normalized = site.trim().toLowerCase();
        // Remove protocol
        normalized = normalized.replace(/^https?:\/\//, '');
        // Remove trailing slash
        normalized = normalized.replace(/\/$/, '');
        // Remove www.
        if (normalized.startsWith('www.')) {
            normalized = normalized.substring(4);
        }
        // Validate that it's a valid domain (contains at least one dot and no slashes)
        if (!normalized.includes('.') || normalized.includes('/') || normalized.includes(':')) {
            return null;
        }
        return normalized;
    }	
	
    /**
     * English: Handles tab removal: cleans up failover state for the site associated with this tab.
     * Russian: Обрабатывает закрытие вкладки: очищает состояние failover для сайта, связанного с этой вкладкой.
     */
    private static _onTabRemoved(tabData: any): void {
        if (!tabData || !tabData.url) return;
        const site = Utils.extractHostFromUrl(tabData.url);
        if (!site) return;
        const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
        if (!normalizedSite) return;

        // English: Cancel failover for this site
        // Russian: Отменяем failover для этого сайта
        console.log(`[WebFailedRequestMonitor] Вкладка закрыта для сайта ${normalizedSite}, очищаем failover`);
        WebFailedRequestMonitor.cancelFailoverForSite(normalizedSite);
        // Also clear from timeout map if any
        if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
            clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
            WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
        }
        WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
        WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
        WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
        WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
        WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
        WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
        // English: Ensure dynamic proxy is cleared
        // Russian: Убеждаемся, что динамический прокси очищен
        ProxyEngine.clearDynamicProxyForSite(normalizedSite);
    }	

    // English: Store timeouts for failover reloads to allow cancellation
    // Russian: Храним таймауты перезагрузки failover для возможности отмены
    private static _failoverTimeouts: Map<string, NodeJS.Timeout> = new Map();

    public static setUserInitiatedNavigation(tabId: number, type: 'reload' | 'typed'): void {
        if (tabId < 0) return;
        WebFailedRequestMonitor._userInitiatedNavigation.set(tabId, type);
        console.log(`[WebFailedRequestMonitor] Пользователь инициировал навигацию: вкладка ${tabId}, тип ${type}`);
        // English: When user initiates navigation, reset the user-stopped flag for the site associated with this tab
        // Russian: Когда пользователь инициирует навигацию, сбрасываем флаг остановки для сайта, связанного с этой вкладкой
        const tabData = TabManager.getTab(tabId);
        if (tabData && tabData.url) {
            const site = Utils.extractHostFromUrl(tabData.url);
            if (site) {
                const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
                if (normalizedSite) {
                    WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);
                    console.log(`[WebFailedRequestMonitor] Сброшен флаг остановки для ${normalizedSite} (новая навигация)`);
                }
            }
        }
    }

    public static clearUserInitiatedNavigation(tabId: number): void {
        WebFailedRequestMonitor._userInitiatedNavigation.delete(tabId);
    }

    // English: (Deprecated) Lock to prevent failover after successful load – replaced by pinning via AutoStatusService.
    // Russian: (Устарело) Блокировка для предотвращения failover после успешной загрузки – заменена на закрепление через AutoStatusService.
    // Kept as a no-op stub to avoid breaking existing calls.
    public static clearSiteLock(): void {
        // English: Clear pin dialog time cache to prevent stale duplicate prevention
        // Russian: Очищаем кэш времени диалогов, чтобы предотвратить устаревшее подавление дублей
        WebFailedRequestMonitor._lastPinDialogTime.clear();
        Debug.log("[WebFailedRequestMonitor] clearSiteLock called (cleared _lastPinDialogTime)");
    }

    /** Domain is being added to the rules list, so removing it from failed requests list */
    public static removeDomainsFromTabFailedRequests(tabId: number, domainList: string[]) {
        if (!(tabId > -1))
            return null;
        if (!domainList || !domainList.length)
            return null;

        let tabData = TabManager.getTab(tabId);

        if (!tabData)
            return null;

        let failedRequests = tabData.failedRequests;
        if (!failedRequests) return null;

        for (let domain of domainList) {
            WebFailedRequestMonitor.deleteFailedRequests(failedRequests, domain);
        }

        let settingsActive = Settings.active;
        let activeSmartProfile = settingsActive.activeProfile;

        // rechecking the failed requests
        failedRequests.forEach((request, key, map) => {
            let testResult = ProxyRules.findMatchedDomainInRulesInfo(request.domain, activeSmartProfile.compiledRules);

            if (testResult != null) {
                WebFailedRequestMonitor.deleteFailedRequests(failedRequests, request.domain);
            }
        });

        return failedRequests;
    }

    /** Monitor entry point */
    private static requestMonitorCallback(eventType: RequestMonitorEvent, requestDetails: any) {
        console.log(`[WebFailedRequestMonitor] requestMonitorCallback вызван: eventType=${eventType}, url=${requestDetails?.url}`);
        // English: Ensure settings and options are initialized before checking detectRequestFailures
        // Russian: Убеждаемся, что настройки и опции инициализированы перед проверкой detectRequestFailures
        if (!Settings.current?.options?.detectRequestFailures) {
            console.log('[WebFailedRequestMonitor] detectRequestFailures отключена, выход');
            return;
        }

        let tabId = requestDetails.tabId;
        if (tabId < 0)
            return null;

        let tabData = TabManager.getOrSetTab(tabId, false);

        if (!tabData)
            return;

        let requestUrl = requestDetails.url;
        if (WebFailedRequestMonitor.checkIfUrlIgnored(requestUrl)) {
            // no logging or reporting requested to ignore domains
            return;
        }

        let requestHost = Utils.extractHostFromUrl(requestUrl);
        let failedRequests = tabData.failedRequests || (tabData.failedRequests = new Map<string, FailedRequestType>());

        switch (eventType) {
            case RequestMonitorEvent.RequestStart:
                {
                    // English: Reset user-stopped failover flag on new main_frame request
                    // Russian: Сбрасываем флаг остановки пользователем при новом запросе основного документа
                    if (requestDetails.type === 'main_frame') {
                        const site = requestHost;
                        if (site) {
                            const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
                            if (normalizedSite) {
                                WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);
                                console.log(`[WebFailedRequestMonitor] Сброшен флаг остановки для ${normalizedSite} (новый запрос main_frame)`);
                            }
                        }
                    }
                    break;
                }

            case RequestMonitorEvent.RequestComplete:
            case RequestMonitorEvent.RequestRevertTimeout:
                {
                    // remove the log
                    let removed = WebFailedRequestMonitor.deleteFailedRequests(failedRequests, requestHost);

                    // English: If main frame loaded, handle auto-proxy logic and status update
                    // Russian: Если основной документ загружен, обрабатываем логику автопрокси и обновление статуса
                    if (requestDetails.type === 'main_frame') {
                        const site = requestHost;
                        if (site) {
                            // English: Normalize site (remove www., protocol, trailing slash)
                            // Russian: Нормализуем сайт (удаляем www., протокол, завершающий слэш)
                            const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
                            if (!normalizedSite) break;

                            const statusCode = requestDetails.statusCode || 0;

                            // ========== NEW: Save success status for ANY profile ==========
                            // English: Get current proxy for this site (works for any profile)
                            // Russian: Получаем текущий прокси для этого сайта (работает для любого профиля)
                            const currentProxyId = WebFailedRequestMonitor.getProxyForSite(normalizedSite);
							console.log(`[WebFailedRequestMonitor] RequestComplete main_frame: site=${normalizedSite}, status=${statusCode}, proxyId=${currentProxyId}, url=${requestDetails.url}, tabId=${requestDetails.tabId}`);
                            if (statusCode === 200 && currentProxyId) {
                                console.log(`[WebFailedRequestMonitor] ✅ УСПЕШНАЯ ЗАГРУЗКА (статус 200) для ${normalizedSite} через прокси ${currentProxyId} в профиле ${Settings.active?.activeProfile?.profileName}`);
                                saveResult(currentProxyId, normalizedSite, 'success', Date.now());
                                // Кешируем успешный прокси
                                WebFailedRequestMonitor._successfulProxyCache.set(normalizedSite, currentProxyId);
                            } else if (statusCode === 200 && !currentProxyId) {
                                console.log(`[WebFailedRequestMonitor] ✅ УСПЕШНАЯ ЗАГРУЗКА напрямую (без прокси) для ${normalizedSite}`);
                            } else {
                                console.log(`[WebFailedRequestMonitor] Загрузка ${normalizedSite} завершена со статусом ${statusCode}, прокси: ${currentProxyId || 'нет'}`);
                            }
                            // ========== END ==========

                            // English: Check if active profile is SmartRules
                            // Russian: Проверяем, активен ли профиль SmartRules
                            const settingsActive = Settings.active;
                            const activeProfile = settingsActive?.activeProfile;
                            if (!activeProfile || activeProfile.profileType !== SmartProfileType.SmartRules) {
                                // English: Not SmartRules profile – no auto-logic, but status already saved
                                // Russian: Не профиль SmartRules – авто-логика не применяется, но статус уже сохранён
                                break;
                            }

                            // English: Check if this site has a rule and its mode is 'auto'
                            // Russian: Проверяем, есть ли правило для этого сайта и его режим 'auto'
                            let ruleMode: string | null = null;
                            let profile: any = null;
                            profile = Settings.current.proxyProfiles.find(p => p.profileId === activeProfile.profileId);
                            if (profile) {
                                const rule = profile.proxyRules.find(r => r.hostName === normalizedSite);
                                if (rule && rule.enabled) {
                                    ruleMode = rule.mode || 'auto';
                                }
                            }

                            // English: If rule is not in 'auto' mode, we don't process auto-logic at all
                            // Russian: Если правило не в режиме 'auto', мы вообще не обрабатываем авто-логику
                            if (ruleMode !== 'auto') {
                                // English: Clear any pending failover state for this site (since we're not in auto mode)
                                // Russian: Очищаем любое ожидающее состояние failover для этого сайта (так как мы не в режиме auto)
                                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                                WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
                                // English: Also clear dynamic override if any
                                // Russian: Также очищаем динамическое переопределение, если есть
                                if (ProxyEngine.getDynamicProxyForSite(normalizedSite)) {
                                    ProxyEngine.clearDynamicProxyForSite(normalizedSite);
                                }
                                break;
                            }

                            // English: Only now we proceed with auto-logic (rule is auto)
                            // Russian: Только теперь мы продолжаем с авто-логикой (правило auto)

                            // English: Get pinned proxy for this site
                            // Russian: Получаем закреплённый прокси для этого сайта
                            const statusService = AutoStatusService.getInstance();
                            const pinnedProxyId = statusService.getPinnedProxy(normalizedSite);
                            const isPinned = pinnedProxyId !== null;
                            const isUserInitiated = WebFailedRequestMonitor._userInitiatedChange.has(normalizedSite);

                            // English: If site is pinned and user did NOT initiate change, skip ALL auto logic
                            // Russian: Если сайт закреплён и пользователь НЕ инициировал смену, пропускаем ВСЮ авто-логику
                            if (isPinned && !isUserInitiated) {
                                // English: Force apply pinned proxy
                                // Russian: Принудительно применяем закреплённый прокси
                                console.log(`[WebFailedRequestMonitor] Применяем закреплённый прокси ${pinnedProxyId} для ${normalizedSite}`);
                                ProxyEngine.setDynamicProxyForSite(normalizedSite, pinnedProxyId);
                                // English: Clear any pending failover state for this site
                                // Russian: Очищаем любое ожидающее состояние failover для этого сайта
                                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                                WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
                                console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён, авто-логика пропущена (нет инициации)`);
                                // English: Check if this navigation was user-initiated (reload or typed)
                                // Russian: Проверяем, была ли эта навигация инициирована пользователем (перезагрузка или ввод адреса)
                                const navType = WebFailedRequestMonitor._userInitiatedNavigation.get(tabId);
                                if (navType) {
                                    WebFailedRequestMonitor.clearUserInitiatedNavigation(tabId);
                                    // English: Check if auto-proxy change dialog is enabled globally
                                    // Russian: Проверяем, включён ли глобальный диалог смены автопрокси
                                    if (profile?.showAutoDialog === false) {
                                        console.log(`[WebFailedRequestMonitor] Диалог смены отключён глобально, пропускаем показ для ${normalizedSite}`);
                                        // English: Do nothing, keep using the pinned proxy
                                        // Russian: Ничего не делаем, продолжаем использовать закреплённый прокси
                                    } else {
                                        // English: Show change dialog for pinned site on user-initiated reload/typed
                                        // Russian: Показываем диалог смены для закреплённого сайта при перезагрузке или вводе адреса
                                        const proxyServer = pinnedProxyId ? SettingsOperation.findProxyServerById(pinnedProxyId) : null;
                                        const proxyDisplayName = proxyServer ? (proxyServer.name || `${proxyServer.host}:${proxyServer.port}`) : pinnedProxyId || 'unknown';
                                        console.log(`[WebFailedRequestMonitor] Открываем диалог смены для закреплённого сайта ${normalizedSite} (инициация пользователя: ${navType})`);
                                        Core.openDialog(
                                            'change',
                                            normalizedSite,
                                            pinnedProxyId,
                                            proxyDisplayName,
                                            'dialogChangeTitle',
                                            'dialogChangeMessage',
                                            'dialogChangeConfirm',
                                            'dialogChangeCancel',
                                            'dialogChangeCheckbox',
                                            'btn-danger',
                                            tabId
                                        );
                                    }
                                }
                                break; // Выходим из обработки main_frame
                            }

                            // English: If user initiated change, clear the flag after this request (it will be re-set if needed)
                            // Russian: Если пользователь инициировал смену, очищаем флаг после этого запроса (будет переустановлен при необходимости)
                            if (isUserInitiated) {
                                WebFailedRequestMonitor.clearUserInitiatedChange(normalizedSite);
                            }

                            // English: Get current proxy using unified method (dynamic override, rule, or default)
                            // Russian: Получаем текущий прокси через унифицированный метод (динамическое переопределение, правило или по умолчанию)
                            let currentProxyIdForAuto = WebFailedRequestMonitor.getProxyForSite(normalizedSite);

                            // English: If status is 200 (success) – stop failover, save status (already saved), show pin dialog or auto-pin
                            // Russian: Если статус 200 (успех) – останавливаем failover, показываем диалог закрепления или авто-закрепляем
                            if (statusCode === 200) {
                                // English: Remove from cancelled list on success
                                // Russian: Удаляем из списка отменённых при успехе
                                WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);

                                // English: Clear any pending failover timeout and watchdog for this site on success
                                // Russian: Очищаем любой ожидающий таймаут failover и watchdog для этого сайта при успехе
                                if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
                                    clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
                                    WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
                                }
                                const watchdogKey = `${normalizedSite}_watchdog`;
                                if (WebFailedRequestMonitor._failoverTimeouts.has(watchdogKey)) {
                                    clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(watchdogKey)!);
                                    WebFailedRequestMonitor._failoverTimeouts.delete(watchdogKey);
                                }

                                // English: Reset failover state for this site on success
                                // Russian: Сбрасываем состояние failover для этого сайта при успехе
                                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);

                                // English: On success, keep user-stopped flag if set – user must explicitly re-enable failover
                                // Russian: При успехе сохраняем флаг остановки, если он установлен – пользователь должен явно включить failover заново
                                // WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);

                                // English: Log success with green color
                                // Russian: Логируем успех зелёным цветом
                                const proxyServer = currentProxyIdForAuto ? SettingsOperation.findProxyServerById(currentProxyIdForAuto) : null;
                                const proxyDisplay = proxyServer ? `${proxyServer.host}:${proxyServer.port} (${proxyServer.protocol})` : currentProxyIdForAuto || 'unknown';
                                console.log(`%c✅ УСПЕХ (авто-режим): ${normalizedSite} загружен через ${proxyDisplay}`, 'color: #00ff00; font-weight: bold; font-size: 1.2em');
                                Core.sendTestLogStep({
                                    type: 'page',
                                    proxyId: currentProxyIdForAuto || 'unknown',
                                    site: normalizedSite,
                                    pageSuccess: true,
                                    statusCode: 200,
                                    message: `✅ ${normalizedSite} загружен через ${proxyDisplay} (авто-режим)`
                                });

                                // English: Determine if we should show pin dialog or auto-pin
                                // Russian: Определяем, показывать ли диалог закрепления или авто-закрепление
                                let autoPinEnabled = profile?.autoPinSuccess === true;
                                let showDialog = true;
                                if (isPinned) {
                                    // English: If site is already pinned, we don't show pin dialog (only change dialog on user initiation)
                                    // Russian: Если сайт уже закреплён, не показываем диалог закрепления (только диалог смены по инициации пользователя)
                                    showDialog = false;
                                } else {
                                    // English: Check if pin dialog is suppressed for this site
                                    // Russian: Проверяем, подавлен ли диалог закрепления для этого сайта
                                    if (profile?.suppressPinDialogForSites && profile.suppressPinDialogForSites.includes(normalizedSite)) {
                                        showDialog = false;
                                    }
                                }

                                if (showDialog && !autoPinEnabled && currentProxyIdForAuto) {
                                    // English: Show pin dialog only if global auto-dialog is enabled
                                    // Russian: Показываем диалог закрепления только если глобальный показ диалогов включён
                                    if (profile?.showAutoDialog !== false) {
                                        // English: Prevent duplicate dialogs for the same proxy within 10 seconds
                                        // Russian: Предотвращаем дублирование диалогов для одного прокси в течение 10 секунд
                                        const dialogKey = `${normalizedSite}_${currentProxyIdForAuto}`;
                                        const now = Date.now();
                                        const lastTime = WebFailedRequestMonitor._lastPinDialogTime.get(dialogKey) || 0;
                                        if (now - lastTime < 10000) {
                                            console.log(`[WebFailedRequestMonitor] Пропускаем повторный диалог для ${normalizedSite} (прокси ${currentProxyIdForAuto}) - слишком часто`);
                                            // English: Still set the proxy as applied, but don't show dialog again
                                            // Russian: Всё равно применяем прокси, но не показываем диалог повторно
                                            if (currentProxyIdForAuto && ProxyEngine.getDynamicProxyForSite(normalizedSite) !== currentProxyIdForAuto) {
                                                ProxyEngine.setDynamicProxyForSite(normalizedSite, currentProxyIdForAuto);
                                            }
                                            break;
                                        }
                                        WebFailedRequestMonitor._lastPinDialogTime.set(dialogKey, now);

                                // English: For pin dialog, try to get the actual proxy ID that is currently applied
                                // Russian: Для диалога закрепления пытаемся получить актуальный ID прокси, который сейчас применён
                                let pinProxyId = currentProxyIdForAuto;
                                const currentAppliedProxy = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                                if (currentAppliedProxy) {
                                    pinProxyId = currentAppliedProxy;
                                }
                                // Also try to get from rule or default if not set
                                if (!pinProxyId) {
                                    pinProxyId = WebFailedRequestMonitor.getProxyForSite(normalizedSite);
                                }
                                const proxyDisplayName = pinProxyId ? SettingsOperation.formatProxyDisplay(pinProxyId) : currentProxyIdForAuto || 'unknown';
                                console.log(`[WebFailedRequestMonitor] Открываем диалог закрепления для сайта ${normalizedSite} (прокси: ${proxyDisplayName})`);
                                Core.openDialog(
                                    'pin',
                                    normalizedSite,
                                    pinProxyId || currentProxyIdForAuto,
                                    proxyDisplayName,
                                    'dialogPinTitle',
                                    'dialogPinMessage',
                                    'dialogPinConfirm',
                                    'dialogPinCancel',
                                    'dialogPinCheckbox',
                                    'btn-primary',
                                    tabId  // передаём tabId для перезагрузки при отказе
                                );
                                    } else {
                                        console.log(`[WebFailedRequestMonitor] Диалог закрепления для ${normalizedSite} пропущен (showAutoDialog = false)`);
                                    }
                                } else if (autoPinEnabled && !isPinned && currentProxyIdForAuto) {
                                    // English: Auto-pin without dialog
                                    // Russian: Авто-закрепление без диалога
                                    if (!WebFailedRequestMonitor._skipAutoPinForSite.has(normalizedSite)) {
                                        statusService.pinProxy(normalizedSite, currentProxyIdForAuto);
                                        console.log(`[WebFailedRequestMonitor] Авто-закреплён прокси ${currentProxyIdForAuto} для сайта ${normalizedSite}`);
                                    } else {
                                        console.log(`[WebFailedRequestMonitor] Пропускаем авто-закрепление для ${normalizedSite} (skipAutoPinForSite)`);
                                        WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                    }
                                }
                                // English: Ensure the successful proxy is applied (it should already be)
                                // Russian: Убеждаемся, что успешный прокси применён (он уже должен быть применён)
                                if (currentProxyIdForAuto && ProxyEngine.getDynamicProxyForSite(normalizedSite) !== currentProxyIdForAuto) {
                                    console.log(`[WebFailedRequestMonitor] Применяем прокси ${currentProxyIdForAuto} для ${normalizedSite} (setDynamicProxyForSite)`);
                                    ProxyEngine.setDynamicProxyForSite(normalizedSite, currentProxyIdForAuto);
                                }

                                // English: Do NOT trigger failover after success
                                // Russian: НЕ запускаем failover после успеха
                                break;
                            }

                            // English: If status is not 200 (error) – trigger failover (only if not pinned)
                            // Russian: Если статус не 200 (ошибка) – запускаем failover (только если не закреплён)
                            if (!isPinned) {
                                // English: Add current proxy to temp skip list to avoid retrying it immediately
                                // Russian: Добавляем текущий прокси во временный список пропуска, чтобы не пробовать его сразу
                                if (currentProxyIdForAuto) {
                                    WebFailedRequestMonitor.addToTempSkipList(normalizedSite, currentProxyIdForAuto);
                                }
                                // English: Clear cache and lock, then trigger failover
                                // Russian: Очищаем кэш и блокировку, затем запускаем failover
                                WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(normalizedSite);
                                WebFailedRequestMonitor.clearSiteLock();
                                ProxyEngine.clearDynamicProxyForSite(normalizedSite);
                                console.log(`[WebFailedRequestMonitor] Загрузка ${normalizedSite} не удалась (статус ${statusCode}), запускаем failover`);
                                // English: If this is the first load (tabId may be -1 or tab just created), we need to ensure we have a valid tabId
                                // Russian: Если это первая загрузка (tabId может быть -1 или вкладка только что создана), нужно убедиться, что у нас есть валидный tabId
                                const effectiveTabId = (tabId > -1) ? tabId : -1;
                                WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, currentProxyIdForAuto, effectiveTabId);
                            } else {
                                console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён, но загрузка не удалась (статус ${statusCode}) – failover не запускается (пользователь должен инициировать смену)`);
                            }
                        }
                    }

                    if (removed) {
                        // if there was an entry
                        // send message to the tab
                        WebFailedRequestMonitor.sendWebFailedRequestNotification(
                            tabId,
                            null,
                            failedRequests);

                        Core.setBrowserActionStatus(tabData);
                    }
                    break;
                }

            case RequestMonitorEvent.RequestRedirected:
                {
                    let failedInfo = failedRequests.get(requestHost);
                    if (!failedInfo) {
                        // considering redirect as complete
                        WebFailedRequestMonitor.deleteFailedRequests(failedRequests, requestHost);

                        // send message to the tab
                        WebFailedRequestMonitor.sendWebFailedRequestNotification(
                            tabId,
                            failedInfo,
                            failedRequests);

                        Core.setBrowserActionStatus(tabData);
                    }
                    break;
                }

            case RequestMonitorEvent.RequestTimeoutAborted:
                {
                    // request is either aborted or timeout, doesn't matter
                    // it should not be considered as failed.
                    let failedInfo = failedRequests.get(requestHost);
                    if (!failedInfo) {
                        // send message to the tab
                        WebFailedRequestMonitor.sendWebFailedRequestNotification(
                            tabId,
                            failedInfo,
                            failedRequests);

                        Core.setBrowserActionStatus(tabData);
                    }

                    // English: If this is a main_frame abort, cancel failover for this site (user pressed stop)
                    // Russian: Если это прерывание основного документа, отменяем failover для этого сайта (пользователь нажал стоп)
                    if (requestDetails.type === 'main_frame') {
                        const site = requestHost;
                        if (site) {
                            const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
                            if (normalizedSite) {
                                WebFailedRequestMonitor.cancelFailoverForSite(normalizedSite);
                                console.log(`[WebFailedRequestMonitor] Failover отменён для ${normalizedSite} (пользователь нажал стоп)`);
                            }
                        }
                    }
                    break;
                }

            case RequestMonitorEvent.RequestTimeout:
            case RequestMonitorEvent.RequestError:
                {
                    // ===== DEBUG LOG =====
                    console.log(`[WebFailedRequestMonitor] Событие ошибки: ${eventType === RequestMonitorEvent.RequestTimeout ? 'RequestTimeout' : 'RequestError'} для ${requestHost} (${requestDetails.url}), type: ${requestDetails.type}`);
                    // ===== END DEBUG =====

                    let failedInfo = failedRequests.get(requestHost);
                    if (failedInfo) {
                        if (eventType == RequestMonitorEvent.RequestError) {
                            // only on error increase hit count
                            failedInfo.hitCount += 1;
                        }
                    } else {
                        // --- Existing logic to add failed request ---
                        let settingsActive = Settings.active;
                        let activeSmartProfileForRules = settingsActive.activeProfile;

                        let shouldNotifyFailures = false;
                        let proxyableDomainList = Utils.extractSubdomainListFromHost(requestHost);
                        if (proxyableDomainList && proxyableDomainList.length > 1) {

                            let multiTestResultList = ProxyRules.findMatchedDomainListInRulesInfo(proxyableDomainList, activeSmartProfileForRules.compiledRules);
                            let requestHostRule: CompiledProxyRule = null;

                            // checking if the request itself has rule or not
                            for (let result of multiTestResultList) {
                                if (result &&
                                    result.compiledRule.hostName == requestHost) {

                                    requestHostRule = result.compiledRule;
                                    break;
                                }
                            }

                            // add only if the request doesn't have rule
                            if (requestHostRule == null) {

                                // adding the sub-domains and top-level domain all together
                                for (let i = 0; i < multiTestResultList.length; i++) {
                                    let resultRuleInfo = multiTestResultList[i];
                                    let resultRule = resultRuleInfo?.compiledRule;
                                    let domain = proxyableDomainList[i];
                                    let matchedHost = resultRule?.hostName || domain;

                                    failedInfo = new FailedRequestType();
                                    failedInfo.url = requestDetails.url;
                                    failedInfo.domain = domain;
                                    failedInfo.hitCount = 1;

                                    let ruleIsForThisHost = false;
                                    if (resultRule != null) {
                                        // check to see if the matched rule is for this host or not!
                                        if (resultRule.hostName == domain) {
                                            ruleIsForThisHost = true;
                                        }

                                        failedInfo.hasRule = true;
                                        failedInfo.ruleId = resultRule.ruleId;
                                        failedInfo.isRuleForThisHost = ruleIsForThisHost;
                                    }
                                    else {
                                        failedInfo.hasRule = false;
                                        failedInfo.ruleId = null;
                                        failedInfo.isRuleForThisHost = false;

                                        shouldNotifyFailures = true;
                                    }
                                    failedInfo.isRootHost = requestHost == matchedHost;

                                    WebFailedRequestMonitor.markIgnoreDomain(failedInfo, domain);
                                    // add to the list
                                    failedRequests.set(domain, failedInfo);
                                }
                            } else {
                                // the root has match, just add it to prevent further checks
                                failedInfo = new FailedRequestType();
                                failedInfo.url = requestDetails.url;
                                failedInfo.domain = requestHost;
                                failedInfo.hitCount = 1;
                                failedInfo.hasRule = true;
                                failedInfo.ruleId = requestHostRule.ruleId;

                                WebFailedRequestMonitor.markIgnoreDomain(failedInfo, requestHost);

                                // add to the list
                                failedRequests.set(requestHost, failedInfo);
                            }

                            if (shouldNotifyFailures) {
                                // send message to the tab
                                // only on the first hit
                                WebFailedRequestMonitor.sendWebFailedRequestNotification(
                                    tabId,
                                    failedInfo,
                                    failedRequests);

                                Core.setBrowserActionStatus(tabData);
                            }

                        } else if (proxyableDomainList && proxyableDomainList.length == 1) {
                            failedInfo = new FailedRequestType();
                            failedInfo.url = requestDetails.url;
                            failedInfo.domain = requestHost;
                            failedInfo.hitCount = 1;
                            failedInfo.hasRule = false;

                            let testResult = ProxyRules.findMatchedUrlInRulesInfo(requestUrl, activeSmartProfileForRules.compiledRules);

                            if (testResult != null) {
                                // there is a rule for this url, so don't bother
                                // we are just adding this to prevent
                                // further call to 'proxyRules.testSingleRule' which is expensive
                                failedInfo.hasRule = true;
                                failedInfo.ruleId = testResult.compiledRule.ruleId;
                            }

                            WebFailedRequestMonitor.markIgnoreDomain(failedInfo, requestHost);

                            // add to the list
                            failedRequests.set(requestHost, failedInfo);

                            // send only if there is no rule
                            if (!failedInfo.hasRule && !failedInfo.ignored) {
                                // send message to the tab
                                // only on the first hit
                                WebFailedRequestMonitor.sendWebFailedRequestNotification(
                                    tabId,
                                    failedInfo,
                                    failedRequests);

                                Core.setBrowserActionStatus(tabData);
                            }
                        }
                        // --- End of existing logic ---
                    }

                    // ========== AUTOMATIC FAILOVER FOR AUTOPROXY (ON ERROR) ==========
                    // English: Only handle failover if:
                    // - auto mode is active for this site (rule mode === 'auto')
                    // - the request is for main_frame
                    // - site is not pinned
                    // - we don't already have a failover in progress
                    // Russian: Обрабатываем failover только если:
                    // - для этого сайта активен авто-режим (mode === 'auto')
                    // - запрос для основного документа
                    // - сайт не закреплён
                    // - нет уже выполняющегося failover
                    console.log(`[WebFailedRequestMonitor] Проверка main_frame для ${requestHost}, тип запроса: ${requestDetails.type}`);
                    if (requestDetails.type === 'main_frame') {
                        console.log(`[WebFailedRequestMonitor] Запрос main_frame для ${requestHost}, обрабатываем`);
                        const site = requestHost;
                        if (!site) {
                            console.log(`[WebFailedRequestMonitor] site is null, break`);
                            break;
                        }

                        const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
                        if (!normalizedSite) {
                            console.log(`[WebFailedRequestMonitor] normalizedSite is null for site: ${site}, break`);
                            break;
                        }
                        console.log(`[WebFailedRequestMonitor] normalizedSite: ${normalizedSite}`);

                        // English: Check if active profile is SmartRules
                        // Russian: Проверяем, активен ли профиль SmartRules
                        const settingsActive = Settings.active;
                        const activeProfile = settingsActive?.activeProfile;
                        if (!activeProfile || activeProfile.profileType !== SmartProfileType.SmartRules) {
                            // English: Not SmartRules profile – no auto-logic
                            // Russian: Не профиль SmartRules – авто-логика не применяется
                            console.log(`[WebFailedRequestMonitor] Активный профиль не SmartRules или отсутствует, activeProfile: ${activeProfile?.profileName}, тип: ${activeProfile?.profileType}`);
                            break;
                        }
                        console.log(`[WebFailedRequestMonitor] Активный профиль: ${activeProfile.profileName}`);

                        // ========== ADD UNREACHABLE SITE TO AUTOPROXY ==========
                        // English: If site has no rule and profile setting allows, suggest adding it
                        // Russian: Если у сайта нет правила и настройка профиля разрешает, предложить добавить
                        console.log(`[WebFailedRequestMonitor] Проверка условий для добавления сайта ${normalizedSite} в автопрокси`);
                        // Check if site has a rule
                        let hasExistingRule = false;
                        const profile = Settings.current.proxyProfiles.find(p => p.profileId === activeProfile.profileId);
                        if (profile) {
                            const existingRule = profile.proxyRules.find(r => r.hostName === normalizedSite);
                            if (existingRule && existingRule.enabled) {
                                hasExistingRule = true;
                            }
                        }
                        console.log(`[WebFailedRequestMonitor] hasExistingRule: ${hasExistingRule}`);

                        if (!hasExistingRule) {
                            if (profile && profile.autoAddUnreachableSites !== false) {
                                if (!WebFailedRequestMonitor._addSiteDialogsShown.has(normalizedSite)) {
                                    WebFailedRequestMonitor._addSiteDialogsShown.add(normalizedSite);
                                    const proxyDisplayName = Settings.active?.currentProxyServer?.name || 'default proxy';
                                    console.log(`[WebFailedRequestMonitor] Показываем диалог добавления сайта ${normalizedSite}`);
                                    Core.openDialog(
                                        'add_site',
                                        normalizedSite,
                                        null,
                                        proxyDisplayName,
                                        'popupAddUnreachableSiteTitle',
                                        'popupAddUnreachableSiteMessage',
                                        'popupAddUnreachableSiteConfirm',
                                        'popupAddUnreachableSiteCancel',
                                        '', // no checkbox
                                        'btn-primary',
                                        tabId,
                                        false  // hide checkbox
                                    );
                                    console.log(`[WebFailedRequestMonitor] Диалог добавления сайта ${normalizedSite} отправлен`);
                                } else {
                                    console.log(`[WebFailedRequestMonitor] Диалог для ${normalizedSite} уже был показан ранее`);
                                }
                            } else {
                                console.log(`[WebFailedRequestMonitor] autoAddUnreachableSites отключено для профиля или профиль не найден`);
                            }
                        } else {
                            console.log(`[WebFailedRequestMonitor] Правило для ${normalizedSite} уже существует`);
                        }
                        // ========== END ADD UNREACHABLE SITE ==========

                        // English: Check if this site has a rule and its mode is 'auto'
                        // Russian: Проверяем, есть ли правило для этого сайта и его режим 'auto'
                        let ruleMode: string | null = null;
                        if (profile) {
                            const rule = profile.proxyRules.find(r => r.hostName === normalizedSite);
                            if (rule && rule.enabled) {
                                ruleMode = rule.mode || 'auto';
                            }
                        }
                        console.log(`[WebFailedRequestMonitor] ruleMode: ${ruleMode}`);

                        // English: Only auto-failover for auto mode
                        // Russian: Только для режима auto
                        if (ruleMode !== 'auto') {
                            console.log(`[WebFailedRequestMonitor] Режим не 'auto', очищаем состояние`);
                            // English: Clear any pending failover state for this site (since we're not in auto mode)
                            // Russian: Очищаем любое ожидающее состояние failover для этого сайта (так как мы не в режиме auto)
                            WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                            WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                            WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                            WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                            WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                            WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
                            if (ProxyEngine.getDynamicProxyForSite(normalizedSite)) {
                                ProxyEngine.clearDynamicProxyForSite(normalizedSite);
                            }
                            break;
                        }
                        console.log(`[WebFailedRequestMonitor] Режим 'auto', правило найдено`);

                        // English: Check if site is pinned
                        // Russian: Проверяем, закреплён ли сайт
                        const statusService = AutoStatusService.getInstance();
                        const pinnedProxyId = statusService.getPinnedProxy(normalizedSite);
                        if (pinnedProxyId !== null) {
                            console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён за прокси ${pinnedProxyId}, failover не запускается`);
                            // English: Check if user initiated a change (reload, typed, or 🔄 button)
                            // Russian: Проверяем, инициировал ли пользователь смену (перезагрузка, ввод адреса, кнопка 🔄)
                            const isUserInitiated = WebFailedRequestMonitor._userInitiatedChange.has(normalizedSite) ||
                                                    WebFailedRequestMonitor._userInitiatedNavigation.has(tabId);
                            if (!isUserInitiated) {
                                // English: No user initiation – just keep using the pinned proxy without any dialog
                                // Russian: Нет инициации пользователем – просто продолжаем использовать закреплённый прокси без диалога
                                console.log(`[WebFailedRequestMonitor] Сайт закреплён, ошибка загрузки, но пользователь не инициировал смену – диалог не показываем`);
                                // English: Clear user-initiated navigation if present (should not be, but just in case)
                                // Russian: Очищаем инициацию пользователя, если есть (на всякий случай)
                                if (WebFailedRequestMonitor._userInitiatedNavigation.has(tabId)) {
                                    WebFailedRequestMonitor.clearUserInitiatedNavigation(tabId);
                                }
                                break;
                            }
                            // English: User initiated a change – show dialog if globally enabled
                            // Russian: Пользователь инициировал смену – показываем диалог, если глобально включён
                            if (profile?.showAutoDialog === false) {
                                console.log(`[WebFailedRequestMonitor] Диалог смены отключён глобально, пропускаем показ для ${normalizedSite}`);
                                // English: Clear user-initiated flags and keep using pinned proxy
                                // Russian: Очищаем флаги инициации и продолжаем использовать закреплённый прокси
                                WebFailedRequestMonitor._userInitiatedChange.delete(normalizedSite);
                                if (WebFailedRequestMonitor._userInitiatedNavigation.has(tabId)) {
                                    WebFailedRequestMonitor.clearUserInitiatedNavigation(tabId);
                                }
                                break;
                            }
                            // English: Show change dialog for pinned site (only on user initiation)
                            // Russian: Показываем диалог смены для закреплённого сайта (только при инициации пользователем)
                            // English: Prevent showing dialog multiple times for the same site in a short period
                            // Russian: Предотвращаем многократный показ диалога для одного сайта за короткое время
                            const now = Date.now();
                            const lastDialogTime = WebFailedRequestMonitor._lastChangeDialogTime.get(normalizedSite) || 0;
                            if (now - lastDialogTime > 5000) { // 5 seconds cooldown
                                WebFailedRequestMonitor._lastChangeDialogTime.set(normalizedSite, now);
                                const proxyDisplayName = pinnedProxyId ? SettingsOperation.formatProxyDisplay(pinnedProxyId) : 'unknown';
                                console.log(`[WebFailedRequestMonitor] Открываем диалог смены для закреплённого сайта ${normalizedSite} (инициация пользователя)`);
                                Core.openDialog(
                                    'change',
                                    normalizedSite,
                                    pinnedProxyId,
                                    proxyDisplayName,
                                    'dialogChangeTitle',
                                    'dialogChangeMessage',
                                    'dialogChangeConfirm',
                                    'dialogChangeCancel',
                                    'dialogChangeCheckbox',
                                    'btn-danger',
                                    tabId
                                );
                            } else {
                                console.log(`[WebFailedRequestMonitor] Пропускаем показ диалога смены для ${normalizedSite}, слишком часто (cooldown)`);
                            }
                            // English: Clear user-initiated flags after showing dialog (or attempting to)
                            // Russian: Очищаем флаги инициации после показа диалога (или попытки)
                            WebFailedRequestMonitor._userInitiatedChange.delete(normalizedSite);
                            if (WebFailedRequestMonitor._userInitiatedNavigation.has(tabId)) {
                                WebFailedRequestMonitor.clearUserInitiatedNavigation(tabId);
                            }
                            break;
                        }
                        console.log(`[WebFailedRequestMonitor] Сайт не закреплён`);

                        // English: If failover is already in progress, but we got an error, continue with next proxy
                        // Russian: Если failover уже выполняется, но мы получили ошибку, переключаемся на следующий прокси
                        if (WebFailedRequestMonitor._failoverInProgress.has(normalizedSite)) {
                            console.log(`[WebFailedRequestMonitor] Failover уже выполняется для ${normalizedSite}, но получена ошибка - переключаемся на следующий прокси`);
                            // English: Remove the in-progress flag to allow new failover
                            // Russian: Снимаем флаг выполнения, чтобы разрешить новый failover
                            WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                            // English: Clear any pending timeout for this site
                            // Russian: Очищаем ожидающий таймаут для этого сайта
                            if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
                                clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
                                WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
                            }
                            // English: Get current proxy and continue failover with next
                            // Russian: Получаем текущий прокси и продолжаем failover со следующим
                            let currentProxyId = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                            if (!currentProxyId) {
                                currentProxyId = Settings.active?.currentProxyServer?.id || null;
                            }
                            if (currentProxyId) {
                                WebFailedRequestMonitor.addToTempSkipList(normalizedSite, currentProxyId);
                            }
                            WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, currentProxyId, tabId);
                            // English: Remove the failed request to avoid duplicate notifications
                            // Russian: Удаляем неудачный запрос, чтобы избежать дублирования уведомлений
                            WebFailedRequestMonitor.deleteFailedRequests(failedRequests, normalizedSite);
                            return;
                        }

                        // English: Check cached proxy (if any) – but if we are here, it likely failed
                        // Russian: Проверяем кэшированный прокси (если есть) – но если мы здесь, он, вероятно, не сработал
                        const cachedProxyId = WebFailedRequestMonitor._successfulProxyCache.get(normalizedSite);
                        if (cachedProxyId) {
                            const staleHours = Settings.current?.userPrefs?.staleHours ?? 6;
                            const autoStatus = Settings.current?.autoStatus || {};
                            const statusInfo = getProxyStatus(cachedProxyId, normalizedSite, autoStatus, staleHours);
                            if (statusInfo.type === 'direct-success' || statusInfo.type === 'indirect-success') {
                                // English: Cached proxy is still valid, apply it and reload
                                // Russian: Кэшированный прокси всё ещё действителен, применяем и перезагружаем
                                const currentOverride = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                                if (currentOverride !== cachedProxyId) {
                                    console.log(`[WebFailedRequestMonitor] Используем кэшированный прокси ${cachedProxyId} для ${normalizedSite}`);
                                    ProxyEngine.setDynamicProxyForSite(normalizedSite, cachedProxyId);
                                    if (tabId > -1) {
                                        setTimeout(() => {
                                            PolyFill.tabsReload(tabId);
                                        }, 300);
                                    }
                                }
                                break;
                            } else {
                                // English: Cache invalid, remove it
                                // Russian: Кэш недействителен, удаляем
                                WebFailedRequestMonitor._successfulProxyCache.delete(normalizedSite);
                            }
                        }

                        // English: Get current proxy (to skip in temp list)
                        // Russian: Получаем текущий прокси (чтобы пропустить его во временном списке)
                        let currentProxyId = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                        if (!currentProxyId) {
                            currentProxyId = Settings.active?.currentProxyServer?.id || null;
                        }
                        console.log(`[WebFailedRequestMonitor] currentProxyId: ${currentProxyId}`);

                        // English: Add current proxy to temp skip list to avoid retrying it immediately
                        // Russian: Добавляем текущий прокси во временный список пропуска, чтобы не пробовать его сразу
                        if (currentProxyId) {
                            WebFailedRequestMonitor.addToTempSkipList(normalizedSite, currentProxyId);
                        }

                        // English: Verify tab exists before triggering failover
                        // Russian: Проверяем существование вкладки перед запуском failover
                        PolyFill.tabsGet(tabId, (tab: any) => {
                            if (!tab) {
                                console.log(`[WebFailedRequestMonitor] Вкладка ${tabId} не существует, отмена failover для ${normalizedSite}`);
                                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                                WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
                                ProxyEngine.clearDynamicProxyForSite(normalizedSite);
                                return;
                            }
                            // English: Trigger failover with the next proxy
                            // Russian: Запускаем failover со следующим прокси
                            console.log(`[WebFailedRequestMonitor] Запуск failover для ${normalizedSite} после ошибки (текущий прокси: ${WebFailedRequestMonitor.formatProxyInfo(currentProxyId, normalizedSite)})`);
                            WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, currentProxyId, tabId);
                        });
                        // English: Remove the failed request to avoid duplicate notifications
                        // Russian: Удаляем неудачный запрос, чтобы избежать дублирования уведомлений
                        WebFailedRequestMonitor.deleteFailedRequests(failedRequests, normalizedSite);
                        // English: Prevent further processing for this request
                        // Russian: Предотвращаем дальнейшую обработку для этого запроса
                        return;
                    }
                    // ========== END AUTOMATIC FAILOVER ==========

                    // send message to the tab (if there was no failover or it failed)
                    if (failedInfo) {
                        WebFailedRequestMonitor.sendWebFailedRequestNotification(
                            tabId,
                            failedInfo,
                            failedRequests);
                        Core.setBrowserActionStatus(tabData);
                    }
                }
        }
    }

    /** Marks the a failed request to be ignored if it is requested by user using the ignore rules. */
    private static markIgnoreDomain(failedInfo: FailedRequestType, requestHost: string) {

        if (WebFailedRequestMonitor.checkIfDomainIgnored(requestHost)) {
            Debug.info("markIgnoreDomain=true", requestHost, failedInfo);
            failedInfo.ignored = true;
        }
    }

    private static checkIfUrlIgnored(requestUrl: string): boolean {

        let ignoreFailureProfile = Settings.active.currentIgnoreFailureProfile;
        if (!ignoreFailureProfile)
            return false;

        let matchedRule = ProxyRules.findMatchedUrlInRules(requestUrl, ignoreFailureProfile.compiledRules.Rules);
        if (matchedRule) {
            return true;
        }

        return false;
    }

    /** Checks if a domain is in ignore rules list */
    private static checkIfDomainIgnored(requestHost: string): boolean {

        let ignoreFailureProfile = Settings.active.currentIgnoreFailureProfile;
        if (!ignoreFailureProfile)
            return false;

        let matchedRule = ProxyRules.findMatchedDomainRule(requestHost, ignoreFailureProfile.compiledRules.Rules);
        if (matchedRule) {
            return true;
        }

        return false;
    }

    private static sendWebFailedRequestNotification(tabId: number, failedInfo: FailedRequestType, failedRequests: Map<string, FailedRequestType>) {
        if (!WebFailedRequestMonitor.notifyFailedRequestNotification)
            return;

        PolyFill.runtimeSendMessage(
            {
                command: CommandMessages.WebFailedRequestNotification,
                tabId: tabId,
                failedRequests: WebFailedRequestMonitor.convertFailedRequestsToArray(failedRequests),
            },
            null,
            error => {
                if (error && error["message"] &&
                    error.message.includes("Could not establish connection")) {
                    WebFailedRequestMonitor.disableFailedRequestNotification();
                }
            });
    }

    /** Converts failed requests to array */
    public static convertFailedRequestsToArray(failedRequests: Map<string, FailedRequestType>): FailedRequestType[] {

        let result: FailedRequestType[] = [];

        failedRequests.forEach((value, key, map) => {
            result.push(value);
        });

        return result;
    }

    /** Number of un-proxified requests */
    public static failedRequestsNotProxifiedCount(failedRequests: Map<string, FailedRequestType>): number {
        let failedCount = 0;

        failedRequests.forEach((request, key, map) => {
            if (request.hasRule || request.ignored)
                return;

            if (request.isRootHost)
                failedCount += request.hitCount;
        });

        return failedCount;
    }

    /** Remove the domain from failed list. Also removed the parent if parent doesn't any other subdomain. */
    private static deleteFailedRequests(failedRequests: Map<string, FailedRequestType>, requestHost: string): boolean {

        if (requestHost == null)
            return false;

        let isRemoved = failedRequests.delete(requestHost);

        let subDomains = Utils.extractSubdomainListFromHost(requestHost);
        if (subDomains && subDomains.length) {
            subDomains.reverse();

            subDomains.forEach((subDomain, index) => {

                let domainHasSubDomain = false;
                failedRequests.forEach((request, requestDomainKey, map) => {
                    if (domainHasSubDomain)
                        return;
                    if (requestDomainKey.endsWith("." + subDomain)) {
                        domainHasSubDomain = true;
                    }
                });

                if (domainHasSubDomain)
                    return;

                let removed = failedRequests.delete(subDomain);
                isRemoved = removed || isRemoved;
            });
        }
        return isRemoved;
    }

    /**
     * English: Clears the successful proxy cache.
     * Russian: Очищает кэш успешных прокси.
     */
    public static clearSuccessfulProxyCache(): void {
        WebFailedRequestMonitor._successfulProxyCache.clear();
        console.log('[WebFailedRequestMonitor] Кэш успешных прокси очищен');
    }

    /**
     * English: Clears the successful proxy cache for a specific site.
     * Russian: Очищает кэш успешных прокси для конкретного сайта.
     */
    public static clearSuccessfulProxyCacheForSite(site: string): void {
        if (!site) return;
        // English: Also clear cache for www. variant if site doesn't have www.
        // Russian: Также очищаем кэш для варианта с www., если сайт без www.
        WebFailedRequestMonitor._successfulProxyCache.delete(site);
        if (site.startsWith('www.')) {
            WebFailedRequestMonitor._successfulProxyCache.delete(site.substring(4));
        } else {
            WebFailedRequestMonitor._successfulProxyCache.delete('www.' + site);
        }
        // English: Clear pin dialog time cache for this site as well
        // Russian: Также очищаем кэш времени диалогов для этого сайта
        for (const key of WebFailedRequestMonitor._lastPinDialogTime.keys()) {
            if (key.startsWith(site + '_')) {
                WebFailedRequestMonitor._lastPinDialogTime.delete(key);
            }
        }
        console.log(`[WebFailedRequestMonitor] Кэш успешных прокси и время диалогов очищены для сайта ${site}`);
    }

    /**
     * English: Formats proxy information for logging (host:port, protocol, status)
     * Russian: Форматирует информацию о прокси для логов (хост:порт, протокол, статус)
     */
    private static formatProxyInfo(proxyId: string | null, site: string): string {
        if (!proxyId) return 'none';
        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (!proxy) return proxyId;

        const staleHours = Settings.current?.userPrefs?.staleHours ?? 6;
        const autoStatus = Settings.current?.autoStatus || {};
        const statusInfo = getProxyStatus(proxyId, site, autoStatus, staleHours);
        const symbol = statusInfo.symbol;
        const host = proxy.host || '?';
        const port = proxy.port || '?';
        const protocol = proxy.protocol || '?';
        return `${symbol} ${host}:${port} (${protocol}) [${proxyId.substring(0, 8)}]`;
    }

    /**
     * English: Resets all failover state for a site (user-initiated restart)
     * Russian: Сбрасывает всё состояние failover для сайта (перезапуск по инициативе пользователя)
     */
    public static resetFailoverStateForSite(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._failoverInProgress.delete(site);
        WebFailedRequestMonitor._failoverIndex.delete(site);
        WebFailedRequestMonitor._failoverCycleCount.set(site, 0);
        console.log(`[WebFailedRequestMonitor] Состояние failover сброшено для сайта ${site}`);
    }

    /**
     * English: Triggers failover for a site, starting from the next proxy after currentProxyId.
     * Russian: Запускает failover для сайта, начиная со следующего прокси после currentProxyId.
     */
    public static triggerFailoverForSite(site: string, currentProxyId: string | null, tabId: number): void {
		 console.log(`[WebFailedRequestMonitor] triggerFailoverForSite вызван для site=${site}, currentProxyId=${currentProxyId}, tabId=${tabId}`);
        
        if (!site) return;
        const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
        if (!normalizedSite) return;

        // English: Reset user-stopped flag when we explicitly trigger failover (user wants to continue)
        // Russian: Сбрасываем флаг остановки пользователем, когда мы явно запускаем failover (пользователь хочет продолжить)
        WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);

        // English: Check if failover was cancelled globally or for this site
        // Russian: Проверяем, не была ли отменена операция глобально или для этого сайта
        if (WebFailedRequestMonitor._cancelFailover) {
            console.log(`[WebFailedRequestMonitor] Failover глобально отменён, прерываем для ${site}`);
            WebFailedRequestMonitor._cancelFailover = false;
            return;
        }

        // English: Check if this site was specifically cancelled (user pressed stop)
        // Russian: Проверяем, не был ли этот сайт специально отменён (пользователь нажал стоп)
        if (WebFailedRequestMonitor._cancelFailoverForSite.has(normalizedSite)) {
            console.log(`[WebFailedRequestMonitor] Failover отменён для сайта ${normalizedSite} (пользователь остановил)`);
            // English: Clear any pending timeout for this site
            // Russian: Очищаем любой ожидающий таймаут для этого сайта
            if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
                clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
                WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
            }
            // English: Remove from cancelled set after cleanup
            // Russian: Удаляем из отменённых после очистки
            WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);
            return;
        }
		
        // English: If user explicitly stopped failover for this site, do not restart,
        // unless this is a user-initiated navigation (reload or typed)
        // Russian: Если пользователь явно остановил failover для этого сайта, не перезапускаем,
        // если только это не навигация, инициированная пользователем (перезагрузка или ввод адреса)
        const isUserInitiated = WebFailedRequestMonitor._userInitiatedNavigation.has(tabId) ||
                                WebFailedRequestMonitor._userInitiatedChange.has(normalizedSite);
        // Note: _userStoppedFailover is already deleted above, so this check is redundant, but keep for safety
        if (WebFailedRequestMonitor._userStoppedFailover.has(normalizedSite) && !isUserInitiated) {
            console.log(`[WebFailedRequestMonitor] Failover для ${normalizedSite} был остановлен пользователем, пропускаем`);
            return;
        }
        // If user initiated, clear the stopped flag to allow failover (already done)
        if (isUserInitiated && WebFailedRequestMonitor._userStoppedFailover.has(normalizedSite)) {
            WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);
            console.log(`[WebFailedRequestMonitor] Сброшен флаг остановки для ${normalizedSite} (инициация пользователя)`);
        }		

        // English: Check if site is pinned – if so, do nothing (user must initiate change)
        // Russian: Проверяем, закреплён ли сайт – если да, ничего не делаем (пользователь должен инициировать смену)
        const statusService = AutoStatusService.getInstance();
        const pinnedProxyId = statusService.getPinnedProxy(normalizedSite);
        if (pinnedProxyId !== null) {
            console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён, failover не запускается`);
            return;
        }

        // English: Mark this site to skip auto-pin after this failover
        // Russian: Отмечаем этот сайт, чтобы пропустить авто-закрепление после этого failover
        WebFailedRequestMonitor._skipAutoPinForSite.add(normalizedSite);
        // English: Clear user-initiated change flag at start of failover (it will be re-set if needed)
        // Russian: Очищаем флаг инициированной пользователем смены при старте failover (будет переустановлен при необходимости)
        WebFailedRequestMonitor.clearUserInitiatedChange(normalizedSite);
        // English: Reset cycle counter for this site on user-initiated failover
        // Russian: Сбрасываем счётчик циклов для этого сайта при инициированном пользователем failover
        WebFailedRequestMonitor._failoverCycleCount.set(normalizedSite, 0);

        // English: Clear cache for this site
        // Russian: Очищаем кэш для этого сайта
        WebFailedRequestMonitor._successfulProxyCache.delete(normalizedSite);

        // English: Get all proxies from both manual and ALL subscriptions (even disabled, if proxies are loaded)
        // Russian: Получаем все прокси из ручных и ВСЕХ подписок (даже отключённых, если прокси загружены)
        const allProxies: ProxyServer[] = [];
        if (Settings.current?.proxyServers) {
            allProxies.push(...Settings.current.proxyServers);
        }
        if (Settings.current?.proxyServerSubscriptions) {
            for (const sub of Settings.current.proxyServerSubscriptions) {
                // English: Include proxies from subscriptions even if disabled, as long as they are loaded
                // Russian: Включаем прокси из подписок даже если они отключены, пока они загружены
                if (sub.proxies && sub.proxies.length > 0) {
                    allProxies.push(...sub.proxies);
                }
            }
        }

        const staleHours = Settings.current?.userPrefs?.staleHours ?? 6;
        const autoStatus = Settings.current?.autoStatus || {};

        // English: Log total proxies before filtering
        // Russian: Логируем общее количество прокси до фильтрации
        console.log(`[WebFailedRequestMonitor] Всего прокси (до фильтрации) для ${normalizedSite}: ${allProxies.length}`);

        // English: Get max failover attempts from profile settings
        // Russian: Получаем максимальное количество попыток из настроек профиля
        let maxAttempts = 5; // временно увеличено для диагностики
        const activeProfile = Settings.active?.activeProfile;
        if (activeProfile && activeProfile.profileType === SmartProfileType.SmartRules) {
            const profile = Settings.current.proxyProfiles.find(p => p.profileId === activeProfile.profileId);
            if (profile && profile.autoProxySettings?.maxFailoverAttempts) {
                maxAttempts = profile.autoProxySettings.maxFailoverAttempts;
            }
        }

        // English: Get current cycle count for this site
        // Russian: Получаем текущее количество циклов для этого сайта
        let cycleCount = WebFailedRequestMonitor._failoverCycleCount.get(normalizedSite) || 0;

        // English: If we've already done maxAttempts full cycles, stop failover
        // Russian: Если мы уже сделали maxAttempts полных циклов, останавливаем failover
        if (cycleCount >= maxAttempts) {
            console.log(`[WebFailedRequestMonitor] Максимальное количество попыток (${maxAttempts}) достигнуто для ${normalizedSite}, остановка (текущий прокси: ${WebFailedRequestMonitor.formatProxyInfo(currentProxyId, normalizedSite)})`);
            PolyFill.runtimeSendMessage({
                command: "NOTIFY_FAILOVER_STOP",
                site: normalizedSite,
                reason: "max_attempts_reached",
                attempts: maxAttempts
            });
            // English: Clear temp skip list when max attempts reached
            // Russian: Очищаем временный список пропуска при достижении максимума попыток
            WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
            return;
        }

        // English: Get sorted proxies by priority
        // Russian: Получаем отсортированные прокси по приоритету
        let sortedProxies = allProxies
            .filter(p => {
                const statusInfo = getProxyStatus(p.id, normalizedSite, autoStatus, staleHours);
                return statusInfo.type !== 'direct-fail' && statusInfo.type !== 'indirect-fail';
            })
            .sort((a, b) => {
                const weightA = ProxySelector.calculateWeight(a, normalizedSite, autoStatus, staleHours);
                const weightB = ProxySelector.calculateWeight(b, normalizedSite, autoStatus, staleHours);
                return weightB - weightA;
            });

        if (sortedProxies.length === 0) {
            console.log(`[WebFailedRequestMonitor] Нет подходящих прокси для ${normalizedSite}, failover прерван`);
            WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
            return;
        }

        console.log(`[WebFailedRequestMonitor] Отсортированных прокси для ${normalizedSite}: ${sortedProxies.length}`);

        // English: Get temp skip list for this site
        // Russian: Получаем временный список пропуска для этого сайта
        let tempSkipList = WebFailedRequestMonitor._tempSkipList.get(normalizedSite) || new Set();

        // English: Check if user has a manually selected proxy for this site
        // Russian: Проверяем, есть ли у пользователя вручную выбранный прокси для этого сайта
        const userSelectedProxyId = WebFailedRequestMonitor._userSelectedProxy.get(normalizedSite);

        let startProxyId: string | null = null;
        let isUserSelected = false;

        if (userSelectedProxyId) {
            const userProxy = allProxies.find(p => p.id === userSelectedProxyId);
            if (userProxy) {
                startProxyId = userSelectedProxyId;
                isUserSelected = true;
                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
                console.log(`[WebFailedRequestMonitor] Используем выбранный пользователем прокси ${WebFailedRequestMonitor.formatProxyInfo(userSelectedProxyId, normalizedSite)} как первый для ${normalizedSite}`);
            }
        }

        let orderedProxies: ProxyServer[] = [];

        if (startProxyId && isUserSelected) {
            const userProxy = allProxies.find(p => p.id === startProxyId);
            if (userProxy) {
                orderedProxies.push(userProxy);
            }
            const otherProxies = sortedProxies.filter(p => p.id !== startProxyId);
            orderedProxies = orderedProxies.concat(otherProxies);
        } else {
            orderedProxies = sortedProxies;
        }

        const originalOrderedProxies = [...orderedProxies];

        let startIndex = 0;
        if (currentProxyId) {
            const currentIndex = originalOrderedProxies.findIndex(p => p.id === currentProxyId);
            if (currentIndex !== -1) {
                startIndex = (currentIndex + 1) % originalOrderedProxies.length;
            } else {
                const savedIndex = WebFailedRequestMonitor._failoverIndex.get(normalizedSite);
                if (savedIndex !== undefined && savedIndex < originalOrderedProxies.length) {
                    startIndex = savedIndex;
                } else {
                    startIndex = 0;
                }
            }
        } else {
            const savedIndex = WebFailedRequestMonitor._failoverIndex.get(normalizedSite);
            if (savedIndex !== undefined && savedIndex < originalOrderedProxies.length) {
                startIndex = savedIndex;
            } else {
                startIndex = 0;
            }
        }

        console.log(`[WebFailedRequestMonitor] Начинаем с индекса ${startIndex} для ${normalizedSite}`);

        if (tempSkipList.size > 0) {
            orderedProxies = orderedProxies.filter(p => !tempSkipList.has(p.id));
            if (orderedProxies.length === 0) {
                console.log(`[WebFailedRequestMonitor] Все прокси пропущены для ${normalizedSite}, увеличиваем счётчик цикла и очищаем список пропуска`);
                cycleCount++;
                WebFailedRequestMonitor._failoverCycleCount.set(normalizedSite, cycleCount);
                console.log(`[WebFailedRequestMonitor] Цикл ${cycleCount}/${maxAttempts} для ${normalizedSite} (все прокси пропущены)`);
                if (cycleCount >= maxAttempts) {
                    console.log(`[WebFailedRequestMonitor] Максимальное количество попыток (${maxAttempts}) достигнуто для ${normalizedSite}, остановка`);
                    PolyFill.runtimeSendMessage({
                        command: "NOTIFY_FAILOVER_STOP",
                        site: normalizedSite,
                        reason: "max_attempts_reached_all_skipped",
                        attempts: maxAttempts
                    });
                    WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                    return;
                }
                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                tempSkipList = new Set();
                orderedProxies = sortedProxies;
            }
        }

        if (orderedProxies.length === 0) {
            console.log(`[WebFailedRequestMonitor] Нет доступных прокси для ${normalizedSite} после фильтрации, прерывание`);
            WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
            return;
        }

        let nextProxy = null;
        let nextIndex = -1;
        for (let i = 0; i < originalOrderedProxies.length; i++) {
            const idx = (startIndex + i) % originalOrderedProxies.length;
            const candidate = originalOrderedProxies[idx];
            if (candidate && !tempSkipList.has(candidate.id)) {
                nextProxy = candidate;
                nextIndex = (idx + 1) % originalOrderedProxies.length;
                break;
            }
        }

        if (!nextProxy) {
            console.log(`[WebFailedRequestMonitor] Следующий прокси не найден для ${normalizedSite}`);
            return;
        }

        if (nextIndex <= 1) {
            console.log(`[WebFailedRequestMonitor] Зацикливание к началу для ${normalizedSite}, nextIndex ${nextIndex}`);
        }

        WebFailedRequestMonitor._failoverIndex.set(normalizedSite, nextIndex);

        WebFailedRequestMonitor._failoverInProgress.add(normalizedSite);
        console.log(`[WebFailedRequestMonitor] Переключение на ${WebFailedRequestMonitor.formatProxyInfo(nextProxy.id, normalizedSite)} для ${normalizedSite} (следующий индекс ${nextIndex})`);
        ProxyEngine.setDynamicProxyForSite(normalizedSite, nextProxy.id);

        const delay = 5000;
        console.log(`[WebFailedRequestMonitor] triggerFailoverForSite: tabId=${tabId}, site=${normalizedSite}, delay=${delay}`);
        if (tabId > -1) {
            // English: Verify that the tab still exists before scheduling reload
            // Russian: Проверяем, что вкладка ещё существует перед планированием перезагрузки
            api.tabs.get(tabId, (tab: any) => {
                if (api.runtime.lastError || !tab) {
                    console.log(`[WebFailedRequestMonitor] Вкладка ${tabId} не существует, отмена failover для ${normalizedSite}`);
                    WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                    WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                    WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                    WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                    WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                    WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
                    ProxyEngine.clearDynamicProxyForSite(normalizedSite);
                    return;
                }
                // English: Tab exists, proceed with reload
                // Russian: Вкладка существует, продолжаем с перезагрузкой
                // English: Clear any existing timeout for this site before setting a new one
                // Russian: Очищаем существующий таймаут для этого сайта перед установкой нового
                if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
                    clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
                    WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
                }
                const timeoutId = setTimeout(() => {
                    console.log(`[WebFailedRequestMonitor] Таймаут сработал для ${normalizedSite}`);
                    if (WebFailedRequestMonitor._cancelFailoverForSite.has(normalizedSite)) {
                        console.log(`[WebFailedRequestMonitor] Перезагрузка отменена для ${normalizedSite} (пользователь остановил)`);
                        WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);
                        WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
                        WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                        return;
                    }
                    console.log(`[WebFailedRequestMonitor] Попытка перезагрузки вкладки ${tabId} для сайта ${normalizedSite}`);
                    WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                    const currentProxy = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                    console.log(`[WebFailedRequestMonitor] Текущий прокси для ${normalizedSite} перед перезагрузкой: ${currentProxy}`);
                    api.tabs.reload(tabId, { bypassCache: true }, () => {
                        if (api.runtime.lastError) {
                            console.warn(`[WebFailedRequestMonitor] Ошибка перезагрузки вкладки ${tabId}:`, api.runtime.lastError);
                        } else {
                            console.log(`[WebFailedRequestMonitor] Вкладка ${tabId} перезагружена успешно`);
                        }
                        WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
                        
                        // ========== WATCHDOG AFTER RELOAD ==========
                        console.log(`[WebFailedRequestMonitor] Запуск watchdog для ${normalizedSite} (10 секунд)`);
                        const watchdogId = setTimeout(() => {
                            console.log(`[WebFailedRequestMonitor] Watchdog сработал для ${normalizedSite} - нет ответа после перезагрузки, продолжаем перебор`);
                            if (WebFailedRequestMonitor._cancelFailoverForSite.has(normalizedSite)) {
                                console.log(`[WebFailedRequestMonitor] Watchdog отменён для ${normalizedSite} (пользователь остановил)`);
                                WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);
                                return;
                            }
                            const hasInProgress = WebFailedRequestMonitor._failoverInProgress.has(normalizedSite);
                            const currentProxyNow = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                            console.log(`[WebFailedRequestMonitor] Watchdog: _failoverInProgress=${hasInProgress}, currentProxy=${currentProxyNow}`);
                            if (!hasInProgress && currentProxyNow) {
                                console.log(`[WebFailedRequestMonitor] Watchdog: продолжаем перебор для ${normalizedSite}`);
                                const proxyId = currentProxyNow;
                                WebFailedRequestMonitor.addToTempSkipList(normalizedSite, proxyId);
                                WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, proxyId, tabId);
                            } else {
                                console.log(`[WebFailedRequestMonitor] Watchdog: пропускаем, уже есть процесс или прокси не установлен`);
                            }
                        }, 10000);
                        WebFailedRequestMonitor._failoverTimeouts.set(`${normalizedSite}_watchdog`, watchdogId);
                        // ========== END WATCHDOG ==========
                    });
                }, delay);
                WebFailedRequestMonitor._failoverTimeouts.set(normalizedSite, timeoutId);
                console.log(`[WebFailedRequestMonitor] Таймаут установлен для ${normalizedSite}, id=${timeoutId}, delay=${delay}ms`);
            });
        } else {
            WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
            console.log(`[WebFailedRequestMonitor] tabId = -1, прокси применён, но перезагрузка не выполнена.`);
        }
    }

    /**
     * English: Sets the user-selected proxy for a site (tried first in failover)
     * Russian: Устанавливает выбранный пользователем прокси для сайта (пробуется первым при failover)
     */
    public static setUserSelectedProxy(site: string, proxyId: string): void {
        if (!site || !proxyId) return;
        WebFailedRequestMonitor._userSelectedProxy.set(site, proxyId);
        console.log(`[WebFailedRequestMonitor] Установлен выбранный пользователем прокси ${proxyId} для сайта ${site}`);
    }

    /**
     * English: Clears the user-selected proxy for a site
     * Russian: Очищает выбранный пользователем прокси для сайта
     */
    public static clearUserSelectedProxy(site: string): void {
        WebFailedRequestMonitor._userSelectedProxy.delete(site);
        console.log(`[WebFailedRequestMonitor] Очищен выбранный пользователем прокси для сайта ${site}`);
    }

    /**
     * English: Adds a proxy to the temporary skip list for a site (skipped in current cycle)
     * Russian: Добавляет прокси во временный список пропуска для сайта (пропускается в текущем цикле)
     */
    public static addToTempSkipList(site: string, proxyId: string): void {
        if (!site || !proxyId) return;
        if (!WebFailedRequestMonitor._tempSkipList.has(site)) {
            WebFailedRequestMonitor._tempSkipList.set(site, new Set());
        }
        WebFailedRequestMonitor._tempSkipList.get(site)!.add(proxyId);
        console.log(`[WebFailedRequestMonitor] Добавлен ${proxyId} во временный список пропуска для ${site}`);
    }

    /**
     * English: Clears the temporary skip list for a site
     * Russian: Очищает временный список пропуска для сайта
     */
    public static clearTempSkipList(site: string): void {
        WebFailedRequestMonitor._tempSkipList.delete(site);
        console.log(`[WebFailedRequestMonitor] Очищен временный список пропуска для ${site}`);
    }

    /**
     * English: Determines the proxy ID that would be used for a given site in the current active profile.
     * Russian: Определяет ID прокси, который будет использоваться для данного сайта в текущем активном профиле.
     */
    private static getProxyForSite(site: string): string | null {
        const settingsActive = Settings.active;
        const activeProfile = settingsActive?.activeProfile;
        if (!activeProfile) return null;
        const profileType = activeProfile.profileType;
        // Direct and SystemProxy do not use a proxy we control
        if (profileType === SmartProfileType.Direct || profileType === SmartProfileType.SystemProxy) {
            return null;
        }
        // Check dynamic override first (set by AutoProxy or manual switching)
        const dynamicProxy = ProxyEngine.getDynamicProxyForSite(site);
        if (dynamicProxy) return dynamicProxy;
        // For SmartRules, check if there is a rule with explicit proxy
        if (profileType === SmartProfileType.SmartRules) {
            const profile = Settings.current.proxyProfiles.find(p => p.profileId === activeProfile.profileId);
            if (profile) {
                const rule = profile.proxyRules.find(r => r.hostName === site && r.enabled);
                if (rule && rule.proxyServerId && rule.proxyServerId !== ProxyRuleSpecialProxyServer.DefaultGeneral && rule.proxyServerId !== ProxyRuleSpecialProxyServer.ProfileProxy) {
                    return rule.proxyServerId;
                }
            }
        }
        // Use profile's own proxy if set, otherwise default
        const profileProxyId = activeProfile.profileProxyServerId;
        if (profileProxyId) return profileProxyId;
        return Settings.current.defaultProxyServerId || null;
    }

    /**
     * English: Marks that user initiated a change via 🔄 for a site
     * Russian: Отмечает, что пользователь инициировал смену через 🔄 для сайта
     */
    public static setUserInitiatedChange(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._userInitiatedChange.add(site);
        // English: User initiated change, reset the cancel flag so failover can restart
        // Russian: Пользователь инициировал смену, сбрасываем флаг отмены, чтобы failover мог перезапуститься
        WebFailedRequestMonitor._cancelFailoverForSite.delete(site);
        console.log(`[WebFailedRequestMonitor] Пользователь инициировал смену для сайта ${site}`);
        // English: User initiated change, reset the user-stopped flag so failover can restart
        // Russian: Пользователь инициировал смену, сбрасываем флаг остановки, чтобы failover мог перезапуститься
        WebFailedRequestMonitor._userStoppedFailover.delete(site);		
    }

    /**
     * English: Clears the user-initiated-change flag for a site
     * Russian: Очищает флаг инициированной пользователем смены для сайта
     */
    public static clearUserInitiatedChange(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._userInitiatedChange.delete(site);
        console.log(`[WebFailedRequestMonitor] Флаг инициированной пользователем смены очищен для сайта ${site}`);
    }

    /**
     * English: Marks a site to skip auto-pin on next successful load
     * Russian: Отмечает сайт, чтобы пропустить авто-закрепление при следующей успешной загрузке
     */
    public static skipAutoPinForSite(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._skipAutoPinForSite.add(site);
        console.log(`[WebFailedRequestMonitor] Авто-закрепление будет пропущено для сайта ${site}`);
    }

    /**
     * English: Clears the skip-auto-pin flag for a site
     * Russian: Очищает флаг пропуска авто-закрепления для сайта
     */
    public static clearSkipAutoPinForSite(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._skipAutoPinForSite.delete(site);
        console.log(`[WebFailedRequestMonitor] Флаг пропуска авто-закрепления очищен для сайта ${site}`);
    }

    /**
     * English: Resets the user-stopped flag for a site, allowing failover to restart.
     * Russian: Сбрасывает флаг остановки пользователем для сайта, позволяя перезапустить failover.
     */
    public static resetUserStoppedFailover(site: string): void {
        if (!site) return;
        const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
        if (!normalizedSite) return;
        WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);
        console.log(`[WebFailedRequestMonitor] Сброшен флаг остановки пользователем для сайта ${normalizedSite}`);
    }

    /**
     * English: Resets the user-stopped flag for all sites.
     * Russian: Сбрасывает флаг остановки пользователем для всех сайтов.
     */
    public static resetAllUserStoppedFailovers(): void {
        WebFailedRequestMonitor._userStoppedFailover.clear();
        console.log('[WebFailedRequestMonitor] Сброшены флаги остановки пользователем для всех сайтов');
    }
	
    /**
     * English: Resets user-stopped flag for the site of a given tab.
     * Russian: Сбрасывает флаг остановки пользователем для сайта, открытого в указанной вкладке.
     */
    public static resetUserStoppedFailoverForTab(tabId: number): void {
        if (tabId < 0) return;
        const tabData = TabManager.getTab(tabId);
        if (tabData && tabData.url) {
            const site = Utils.extractHostFromUrl(tabData.url);
            if (site) {
                const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
                if (normalizedSite) {
                    WebFailedRequestMonitor._userStoppedFailover.delete(normalizedSite);
                    console.log(`[WebFailedRequestMonitor] Сброшен флаг остановки для сайта ${normalizedSite} при активации вкладки ${tabId}`);
                }
            }
        }
    }	

    /**
     * English: Cancels failover for a specific site (user pressed stop in browser)
     * Russian: Отменяет failover для конкретного сайта (пользователь нажал стоп в браузере)
     */
    public static cancelFailoverForSite(site: string): void {
        if (!site) return;
        const normalizedSite = WebFailedRequestMonitor.normalizeSite(site);
        if (!normalizedSite) return;

        console.log(`[WebFailedRequestMonitor] Отмена failover для сайта ${normalizedSite}`);

        // English: Mark site as cancelled
        // Russian: Отмечаем сайт как отменённый
        WebFailedRequestMonitor._cancelFailoverForSite.add(normalizedSite);
        // English: Also mark as user-stopped to prevent automatic restart
        // Russian: Также отмечаем как остановленный пользователем, чтобы предотвратить автоматический перезапуск
        WebFailedRequestMonitor._userStoppedFailover.add(normalizedSite);

        // English: Clear pending timeout if any
        // Russian: Очищаем ожидающий таймаут, если есть
        if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
            console.log(`[WebFailedRequestMonitor] Очистка таймаута для ${normalizedSite} (отмена failover)`);
            clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
            WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
        }

        // English: Reset failover state for this site
        // Russian: Сбрасываем состояние failover для этого сайта
        WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
        WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
        WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
        WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
        WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
        WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);

        // English: Remove from cancelled set after cleanup
        // Russian: Удаляем из отменённых после очистки
        WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);
    }
}