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
 */
import { WebRequestMonitor, RequestMonitorEvent } from "./WebRequestMonitor";
import { Core } from "./Core";
import { PolyFill } from "../lib/PolyFill";
import { ProxyRules } from "./ProxyRules";
import { Utils } from "../lib/Utils";
import { TabManager } from "./TabManager";
import { CommandMessages, FailedRequestType, CompiledProxyRule, SmartProfileType, ProxyServer } from "./definitions";
import { Settings } from "./Settings";
import { Debug } from "../lib/Debug";
import { ProxySelector } from './ProxySelector';
import { SettingsOperation } from './SettingsOperation';
import { ProxyEngine } from './ProxyEngine';
import { getProxyStatus } from './statusUtils';
import { saveResult } from './ResultSaver';
import { AutoStatusService } from './AutoStatusService';

export class WebFailedRequestMonitor {

    public static startMonitor() {
        WebRequestMonitor.startMonitor(WebFailedRequestMonitor.requestMonitorCallback);
    }

    private static notifyFailedRequestNotification: boolean = true;

    // English: Global cancel flag for failover (user pressed stop)
    // Russian: Глобальный флаг отмены failover (пользователь нажал стоп)
    private static _cancelFailover: boolean = false;

    public static cancelFailover(): void {
        WebFailedRequestMonitor._cancelFailover = true;
//console.log('[WebFailedRequestMonitor] Failover cancellation requested')
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

    // English: Per-site cancel flag for failover (user pressed stop in browser)
    // Russian: Флаг отмены failover для конкретного сайта (пользователь нажал стоп в браузере)
    private static _cancelFailoverForSite: Set<string> = new Set();

    // English: Store timeouts for failover reloads to allow cancellation
    // Russian: Храним таймауты перезагрузки failover для возможности отмены
    private static _failoverTimeouts: Map<string, NodeJS.Timeout> = new Map();

    public static setUserInitiatedNavigation(tabId: number, type: 'reload' | 'typed'): void {
        if (tabId < 0) return;
        WebFailedRequestMonitor._userInitiatedNavigation.set(tabId, type);
//console.log(`[WebFailedRequestMonitor] User initiated navigation: tab ${tabId}, type ${type}`)
    }

    public static clearUserInitiatedNavigation(tabId: number): void {
        WebFailedRequestMonitor._userInitiatedNavigation.delete(tabId);
    }

    // English: (Deprecated) Lock to prevent failover after successful load – replaced by pinning via AutoStatusService.
    // Russian: (Устарело) Блокировка для предотвращения failover после успешной загрузки – заменена на закрепление через AutoStatusService.
    // Kept as a no-op stub to avoid breaking existing calls.
    public static clearSiteLock(): void {
        // English: No-op, kept for backward compatibility.
        // Russian: Пустая заглушка для обратной совместимости.
        Debug.log("[WebFailedRequestMonitor] clearSiteLock called (no-op)");
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
        // English: Ensure settings and options are initialized before checking detectRequestFailures
        // Russian: Убеждаемся, что настройки и опции инициализированы перед проверкой detectRequestFailures
        if (!Settings.current?.options?.detectRequestFailures) {
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
            case RequestMonitorEvent.RequestComplete:
            case RequestMonitorEvent.RequestRevertTimeout:
                {
                    // remove the log
                    let removed = WebFailedRequestMonitor.deleteFailedRequests(failedRequests, requestHost);

                    // English: If main frame loaded, handle auto-proxy logic
                    // Russian: Если основной документ загружен, обрабатываем логику автопрокси
                    if (requestDetails.type === 'main_frame') {
                        const site = requestHost;
                        if (site) {
                            // English: Normalize site (remove www., protocol, trailing slash)
                            // Russian: Нормализуем сайт (удаляем www., протокол, завершающий слэш)
                            const normalizedSite = Core.normalizeSite(site);
                            if (!normalizedSite) break;

                            // English: Check if active profile is SmartRules
                            // Russian: Проверяем, активен ли профиль SmartRules
                            const settingsActive = Settings.active;
                            const activeProfile = settingsActive?.activeProfile;
                            if (!activeProfile || activeProfile.profileType !== SmartProfileType.SmartRules) {
                                // English: Not SmartRules profile – no auto-logic
                                // Russian: Не профиль SmartRules – авто-логика не применяется
                                break;
                            }

                            // English: Check if this site has a rule and its mode is 'auto'
                            // Russian: Проверяем, есть ли правило для этого сайта и его режим 'auto'
                            let ruleMode: string | null = null;
                            let ruleId: number | null = null;
                            let profile: any = null;
                            profile = Settings.current.proxyProfiles.find(p => p.profileId === activeProfile.profileId);
                            if (profile) {
                                const rule = profile.proxyRules.find(r => r.hostName === normalizedSite);
                                if (rule && rule.enabled) {
                                    ruleMode = rule.mode || 'auto';
                                    ruleId = rule.ruleId;
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
                                // English: Ensure pinned proxy is applied
                                // Russian: Убеждаемся, что закреплённый прокси применён
                                if (ProxyEngine.getDynamicProxyForSite(normalizedSite) !== pinnedProxyId) {
                                    ProxyEngine.setDynamicProxyForSite(normalizedSite, pinnedProxyId);
                                }
                                // English: Clear any pending failover state for this site
                                // Russian: Очищаем любое ожидающее состояние failover для этого сайта
                                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                                WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
//console.log(`%c[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён за прокси ${WebFailedRequestMonitor.formatProxyInfo(pinnedProxyId, normalizedSite)}, авто-логика ПОЛНОСТЬЮ ПРОПУЩЕНА`, 'color: #888')
                                // English: Check if this navigation was user-initiated (reload or typed)
                                // Russian: Проверяем, была ли эта навигация инициирована пользователем (перезагрузка или ввод адреса)
                                const navType = WebFailedRequestMonitor._userInitiatedNavigation.get(tabId);
                                if (navType) {
                                    WebFailedRequestMonitor.clearUserInitiatedNavigation(tabId);
                                    // English: Check if auto-proxy change dialog is enabled globally
                                    // Russian: Проверяем, включён ли глобальный диалог смены автопрокси
                                    if (profile?.showAutoDialog === false) {
//console.log(`[WebFailedRequestMonitor] Диалог смены отключён глобально (showAutoDialog=false), пропускаем показ для ${normalizedSite}`)
                                        // English: Do nothing, keep using the pinned proxy
                                        // Russian: Ничего не делаем, продолжаем использовать закреплённый прокси
                                    } else {
                                        // English: Show change dialog for pinned site on user-initiated reload/typed
                                        // Russian: Показываем диалог смены для закреплённого сайта при перезагрузке или вводе адреса
                                        const proxyServer = pinnedProxyId ? SettingsOperation.findProxyServerById(pinnedProxyId) : null;
                                        const proxyDisplayName = proxyServer ? (proxyServer.name || `${proxyServer.host}:${proxyServer.port}`) : pinnedProxyId || 'unknown';
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
//console.log(`[WebFailedRequestMonitor] Показан диалог смены для закреплённого сайта ${normalizedSite} (прокси: ${proxyDisplayName})`)
                                    }
                                }
                                break; // Выходим из обработки main_frame
                            }

                            // English: If user initiated change, clear the flag after this request (it will be re-set if needed)
                            // Russian: Если пользователь инициировал смену, очищаем флаг после этого запроса (будет переустановлен при необходимости)
                            if (isUserInitiated) {
                                WebFailedRequestMonitor.clearUserInitiatedChange(normalizedSite);
                            }

                            // English: Get current proxy (dynamic override or from rule)
                            // Russian: Получаем текущий прокси (динамическое переопределение или из правила)
                            let currentProxyId = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                            if (!currentProxyId) {
                                // English: Check if rule has explicit proxyServerId
                                // Russian: Проверяем, есть ли у правила явный proxyServerId
                                const rule = profile.proxyRules.find(r => r.ruleId === ruleId);
                                if (rule && rule.proxyServerId) {
                                    const explicitProxy = SettingsOperation.findProxyServerById(rule.proxyServerId);
                                    if (explicitProxy) {
                                        currentProxyId = explicitProxy.id;
                                        // English: Apply this proxy as dynamic override
                                        // Russian: Применяем этот прокси как динамическое переопределение
                                        if (ProxyEngine.getDynamicProxyForSite(normalizedSite) !== currentProxyId) {
                                            ProxyEngine.setDynamicProxyForSite(normalizedSite, currentProxyId);
                                        }
//console.log(`[WebFailedRequestMonitor] Используем явный прокси из правила ${currentProxyId} для ${normalizedSite}`)
                                    }
                                }
                                if (!currentProxyId) {
                                    currentProxyId = Settings.active?.currentProxyServer?.id || null;
                                }
                            }

                            const statusCode = requestDetails.statusCode || 0;

                            // English: If status is 200 (success) – stop failover, save status, show pin dialog or auto-pin
                            // Russian: Если статус 200 (успех) – останавливаем failover, сохраняем статус, показываем диалог закрепления или авто-закрепляем
                            if (statusCode === 200) {
                                // English: Save success status
                                // Russian: Сохраняем статус успеха
                                if (currentProxyId) {
                                    saveResult(currentProxyId, normalizedSite, 'success', Date.now());
                                    // English: Cache the successful proxy
                                    // Russian: Кэшируем успешный прокси
                                    WebFailedRequestMonitor._successfulProxyCache.set(normalizedSite, currentProxyId);
                                }

                                // English: Reset ALL failover state for this site
                                // Russian: Сбрасываем ВСЁ состояние failover для этого сайта
                                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverIndex.delete(normalizedSite);
                                WebFailedRequestMonitor._failoverCycleCount.delete(normalizedSite);
                                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                                WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);

                                // English: Log success with green color
                                // Russian: Логируем успех зелёным цветом
                                const proxyServer = currentProxyId ? SettingsOperation.findProxyServerById(currentProxyId) : null;
                                const proxyDisplay = proxyServer ? `${proxyServer.host}:${proxyServer.port} (${proxyServer.protocol})` : currentProxyId || 'unknown';
                                console.log(`%c✅ УСПЕХ: ${normalizedSite} загружен через ${proxyDisplay}`, 'color: #00ff00; font-weight: bold; font-size: 1.2em');
                                Core.sendTestLogStep({
                                    type: 'page',
                                    proxyId: currentProxyId || 'unknown',
                                    site: normalizedSite,
                                    pageSuccess: true,
                                    statusCode: 200,
                                    message: `✅ ${normalizedSite} загружен через ${proxyDisplay}`
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

                                if (showDialog && !autoPinEnabled && currentProxyId) {
                                    // English: Show pin dialog only if global auto-dialog is enabled
                                    // Russian: Показываем диалог закрепления только если глобальный показ диалогов включён
                                    if (profile?.showAutoDialog !== false) {
                                        const proxyDisplayName = proxyServer ? (proxyServer.name || `${proxyServer.host}:${proxyServer.port}`) : currentProxyId;
                                        Core.openDialog(
                                            'pin',
                                            normalizedSite,
                                            currentProxyId,
                                            proxyDisplayName,
                                            'dialogPinTitle',
                                            'dialogPinMessage',
                                            'dialogPinConfirm',
                                            'dialogPinCancel',
                                            'dialogPinCheckbox',
                                            'btn-primary'
                                        );
//console.log(`[WebFailedRequestMonitor] Показан диалог закрепления для сайта ${normalizedSite} (прокси: ${proxyDisplayName})`)
                                    } else {
//console.log(`[WebFailedRequestMonitor] Диалог закрепления для ${normalizedSite} пропущен (showAutoDialog = false)`)
                                    }
                                } else if (autoPinEnabled && !isPinned && currentProxyId) {
                                    // English: Auto-pin without dialog
                                    // Russian: Авто-закрепление без диалога
                                    if (!WebFailedRequestMonitor._skipAutoPinForSite.has(normalizedSite)) {
                                        statusService.pinProxy(normalizedSite, currentProxyId);
//console.log(`[WebFailedRequestMonitor] Авто-закреплён прокси ${currentProxyId} для сайта ${normalizedSite}`)
                                    } else {
//console.log(`[WebFailedRequestMonitor] Пропускаем авто-закрепление для ${normalizedSite} (skipAutoPinForSite)`)
                                        WebFailedRequestMonitor._skipAutoPinForSite.delete(normalizedSite);
                                    }
                                }
                                // English: Ensure the successful proxy is applied (it should already be)
                                // Russian: Убеждаемся, что успешный прокси применён (он уже должен быть применён)
//console.log(`[WebFailedRequestMonitor] Проверка применения прокси для ${normalizedSite}: currentProxyId=${currentProxyId}, текущий динамический=${ProxyEngine.getDynamicProxyForSite(normalizedSite)}`)
                                if (currentProxyId && ProxyEngine.getDynamicProxyForSite(normalizedSite) !== currentProxyId) {
//console.log(`[WebFailedRequestMonitor] Применяем прокси ${currentProxyId} для ${normalizedSite} через setDynamicProxyForSite`)
                                    ProxyEngine.setDynamicProxyForSite(normalizedSite, currentProxyId);
                                } else {
//console.log(`[WebFailedRequestMonitor] Прокси уже применён или currentProxyId отсутствует`)
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
                                if (currentProxyId) {
                                    WebFailedRequestMonitor.addToTempSkipList(normalizedSite, currentProxyId);
                                }
                                // English: Clear cache and lock, then trigger failover
                                // Russian: Очищаем кэш и блокировку, затем запускаем failover
                                WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(normalizedSite);
                                WebFailedRequestMonitor.clearSiteLock();
                                ProxyEngine.clearDynamicProxyForSite(normalizedSite);
//console.log(`[WebFailedRequestMonitor] Загрузка ${normalizedSite} не удалась (статус ${statusCode}), запускаем failover`)
                                // English: If this is the first load (tabId may be -1 or tab just created), we need to ensure we have a valid tabId
                                // Russian: Если это первая загрузка (tabId может быть -1 или вкладка только что создана), нужно убедиться, что у нас есть валидный tabId
                                const effectiveTabId = (tabId > -1) ? tabId : -1;
                                WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, currentProxyId, effectiveTabId);
                            } else {
//console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён, но загрузка не удалась (статус ${statusCode}) – failover не запускается (пользователь должен инициировать смену)`)
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
                            const normalizedSite = Core.normalizeSite(site);
                            if (normalizedSite) {
                                WebFailedRequestMonitor.cancelFailoverForSite(normalizedSite);
//console.log(`[WebFailedRequestMonitor] Failover cancelled for ${normalizedSite} due to user stop`)
                            }
                        }
                    }
                    break;
                }

            case RequestMonitorEvent.RequestTimeout:
            case RequestMonitorEvent.RequestError:
                {
                    // ===== DEBUG LOG =====
//console.log(`[WebFailedRequestMonitor] Событие ошибки: ${eventType === RequestMonitorEvent.RequestTimeout ? 'RequestTimeout' : 'RequestError'} для ${requestHost} (${requestDetails.url}), type: ${requestDetails.type}`)
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
//console.log(`[WebFailedRequestMonitor] Проверка main_frame для ${requestHost}, тип запроса: ${requestDetails.type}`)
                    if (requestDetails.type === 'main_frame') {
//console.log(`[WebFailedRequestMonitor] Запрос main_frame для ${requestHost}, обрабатываем`)
                        const site = requestHost;
                        if (!site) {
//console.log(`[WebFailedRequestMonitor] site is null, break`)
                            break;
                        }

                        const normalizedSite = Core.normalizeSite(site);
                        if (!normalizedSite) {
//console.log(`[WebFailedRequestMonitor] normalizedSite is null for site: ${site}, break`)
                            break;
                        }
//console.log(`[WebFailedRequestMonitor] normalizedSite: ${normalizedSite}`)

                        // English: Check if active profile is SmartRules
                        // Russian: Проверяем, активен ли профиль SmartRules
                        const settingsActive = Settings.active;
                        const activeProfile = settingsActive?.activeProfile;
                        if (!activeProfile || activeProfile.profileType !== SmartProfileType.SmartRules) {
                            // English: Not SmartRules profile – no auto-logic
                            // Russian: Не профиль SmartRules – авто-логика не применяется
//console.log(`[WebFailedRequestMonitor] Активный профиль не SmartRules или отсутствует, activeProfile: ${activeProfile?.profileName}, тип: ${activeProfile?.profileType}`)
                            break;
                        }
//console.log(`[WebFailedRequestMonitor] Активный профиль: ${activeProfile.profileName}`)

                        // ========== ADD UNREACHABLE SITE TO AUTOPROXY ==========
                        // English: If site has no rule and profile setting allows, suggest adding it
                        // Russian: Если у сайта нет правила и настройка профиля разрешает, предложить добавить
//console.log(`[WebFailedRequestMonitor] Проверка условий для добавления сайта ${normalizedSite} в автопрокси`)
                        // Check if site has a rule
                        let hasExistingRule = false;
                        const profile = Settings.current.proxyProfiles.find(p => p.profileId === activeProfile.profileId);
                        if (profile) {
                            const existingRule = profile.proxyRules.find(r => r.hostName === normalizedSite);
                            if (existingRule && existingRule.enabled) {
                                hasExistingRule = true;
                            }
                        }
//console.log(`[WebFailedRequestMonitor] hasExistingRule: ${hasExistingRule}`)

                        if (!hasExistingRule) {
                            if (profile && profile.autoAddUnreachableSites !== false) {
                                if (!WebFailedRequestMonitor._addSiteDialogsShown.has(normalizedSite)) {
                                    WebFailedRequestMonitor._addSiteDialogsShown.add(normalizedSite);
                                    const proxyDisplayName = Settings.active?.currentProxyServer?.name || 'default proxy';
									console.log(`[WebFailedRequestMonitor] Показываем диалог добавления сайта ${normalizedSite}`)
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
                                        tabId
                                    );
//console.log(`[WebFailedRequestMonitor] Диалог добавления сайта ${normalizedSite} отправлен`)
                                } else {
//console.log(`[WebFailedRequestMonitor] Диалог для ${normalizedSite} уже был показан ранее`)
                                }
                            } else {
//console.log(`[WebFailedRequestMonitor] autoAddUnreachableSites отключено для профиля или профиль не найден`)
                            }
                        } else {
						console.log(`[WebFailedRequestMonitor] Правило для ${normalizedSite} уже существует`)
                        }
                        // ========== END ADD UNREACHABLE SITE ==========

                        // English: Check if this site has a rule and its mode is 'auto'
                        // Russian: Проверяем, есть ли правило для этого сайта и его режим 'auto'
                        let ruleMode: string | null = null;
                        let ruleId: number | null = null;
                        if (profile) {
                            const rule = profile.proxyRules.find(r => r.hostName === normalizedSite);
                            if (rule && rule.enabled) {
                                ruleMode = rule.mode || 'auto';
                                ruleId = rule.ruleId;
                            }
                        }
//console.log(`[WebFailedRequestMonitor] ruleMode: ${ruleMode}, ruleId: ${ruleId}`)

                        // English: Only auto-failover for auto mode
                        // Russian: Только для режима auto
                        if (!(ruleMode === 'auto' && ruleId)) {
//console.log(`[WebFailedRequestMonitor] Режим не 'auto' или правило отсутствует, очищаем состояние`)
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
//console.log(`[WebFailedRequestMonitor] Режим 'auto', правило найдено`)

                        // English: Check if site is pinned
                        // Russian: Проверяем, закреплён ли сайт
                        const statusService = AutoStatusService.getInstance();
                        const pinnedProxyId = statusService.getPinnedProxy(normalizedSite);
                        if (pinnedProxyId !== null) {
						console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён за прокси ${pinnedProxyId}, failover не запускается`)
                            // English: Check if user initiated a change (reload, typed, or 🔄 button)
                            // Russian: Проверяем, инициировал ли пользователь смену (перезагрузка, ввод адреса, кнопка 🔄)
                            const isUserInitiated = WebFailedRequestMonitor._userInitiatedChange.has(normalizedSite) ||
                                                    WebFailedRequestMonitor._userInitiatedNavigation.has(tabId);
                            if (!isUserInitiated) {
                                // English: No user initiation – just keep using the pinned proxy without any dialog
                                // Russian: Нет инициации пользователем – просто продолжаем использовать закреплённый прокси без диалога
//console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён, ошибка загрузки, но пользователь не инициировал смену – диалог не показываем`)
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
//console.log(`[WebFailedRequestMonitor] Диалог смены отключён глобально (showAutoDialog=false), пропускаем показ для ${normalizedSite}`)
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
                                const proxyServer = pinnedProxyId ? SettingsOperation.findProxyServerById(pinnedProxyId) : null;
                                const proxyDisplayName = proxyServer ? (proxyServer.name || `${proxyServer.host}:${proxyServer.port}`) : pinnedProxyId || 'unknown';
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
							console.log(`[WebFailedRequestMonitor] Показан диалог смены для закреплённого сайта ${normalizedSite} (прокси: ${proxyDisplayName}) по инициации пользователя`)
                            } else {
//console.log(`[WebFailedRequestMonitor] Пропускаем показ диалога смены для ${normalizedSite}, слишком часто (cooldown)`)
                            }
                            // English: Clear user-initiated flags after showing dialog (or attempting to)
                            // Russian: Очищаем флаги инициации после показа диалога (или попытки)
                            WebFailedRequestMonitor._userInitiatedChange.delete(normalizedSite);
                            if (WebFailedRequestMonitor._userInitiatedNavigation.has(tabId)) {
                                WebFailedRequestMonitor.clearUserInitiatedNavigation(tabId);
                            }
                            break;
                        }
							console.log(`[WebFailedRequestMonitor] Сайт не закреплён`)

                        // English: If failover is already in progress, skip
                        // Russian: Если failover уже выполняется, пропускаем
                        if (WebFailedRequestMonitor._failoverInProgress.has(normalizedSite)) {
						console.log(`[WebFailedRequestMonitor] Failover уже выполняется для ${normalizedSite}, пропускаем`)
                            break;
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
								console.log(`[WebFailedRequestMonitor] Используем кэшированный прокси ${cachedProxyId} для ${normalizedSite}`)
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
						console.log(`[WebFailedRequestMonitor] currentProxyId: ${currentProxyId}`)

                        // English: Add current proxy to temp skip list to avoid retrying it immediately
                        // Russian: Добавляем текущий прокси во временный список пропуска, чтобы не пробовать его сразу
                        if (currentProxyId) {
                            WebFailedRequestMonitor.addToTempSkipList(normalizedSite, currentProxyId);
                        }

                        // English: Trigger failover with the next proxy
                        // Russian: Запускаем failover со следующим прокси
						console.log(`[WebFailedRequestMonitor] Запуск failover для ${normalizedSite} после ошибки (текущий прокси: ${WebFailedRequestMonitor.formatProxyInfo(currentProxyId, normalizedSite)})`)
                        // English: Use the tabId from request, it should be valid
                        // Russian: Используем tabId из запроса, он должен быть валидным
                        WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, currentProxyId, tabId);
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
	console.log('[WebFailedRequestMonitor] Successful proxy cache cleared')
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
//console.log(`[WebFailedRequestMonitor] Successful proxy cache cleared for site ${site}`)
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
	console.log(`[WebFailedRequestMonitor] Failover state reset for site ${site}`)
    }
	
    /**
     * English: Triggers failover for a site, starting from the next proxy after currentProxyId.
     * Russian: Запускает failover для сайта, начиная со следующего прокси после currentProxyId.
     */
    public static triggerFailoverForSite(site: string, currentProxyId: string | null, tabId: number): void {
        // English: Check if failover was cancelled globally or for this site
        // Russian: Проверяем, не была ли отменена операция глобально или для этого сайта
        if (WebFailedRequestMonitor._cancelFailover) {
//console.log(`[WebFailedRequestMonitor] Failover globally cancelled, aborting for ${site}`)
            WebFailedRequestMonitor._cancelFailover = false;
            return;
        }
        if (!site) return;

        const normalizedSite = Core.normalizeSite(site);
        if (!normalizedSite) return;

        // English: Check if this site was specifically cancelled (user pressed stop)
        // Russian: Проверяем, не был ли этот сайт специально отменён (пользователь нажал стоп)
        if (WebFailedRequestMonitor._cancelFailoverForSite.has(normalizedSite)) {
//console.log(`[WebFailedRequestMonitor] Failover cancelled for site ${normalizedSite} (user stopped)`)
            WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);
            // English: Clear any pending timeout for this site
            // Russian: Очищаем любой ожидающий таймаут для этого сайта
            if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
                clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
                WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
            }
            return;
        }

        // English: Check if site is pinned – if so, do nothing (user must initiate change)
        // Russian: Проверяем, закреплён ли сайт – если да, ничего не делаем (пользователь должен инициировать смену)
        const statusService = AutoStatusService.getInstance();
        const pinnedProxyId = statusService.getPinnedProxy(normalizedSite);
        if (pinnedProxyId !== null) {
		console.log(`[WebFailedRequestMonitor] Сайт ${normalizedSite} закреплён, failover не запускается`)
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
		console.log(`[WebFailedRequestMonitor] Всего прокси (до фильтрации) для ${normalizedSite}: ${allProxies.length}`)

        // English: Get max failover attempts from profile settings
        // Russian: Получаем максимальное количество попыток из настроек профиля
        let maxAttempts = 3; // default
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
		console.log(`[WebFailedRequestMonitor] Max failover attempts (${maxAttempts}) reached for ${normalizedSite}, stopping (current proxy: ${WebFailedRequestMonitor.formatProxyInfo(currentProxyId, normalizedSite)})`)
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
		console.log(`[WebFailedRequestMonitor] No suitable proxies for ${normalizedSite}, failover aborted`)
            // English: Clear temp skip list when no proxies available
            // Russian: Очищаем временный список пропуска, когда нет доступных прокси
            WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
            return;
        }

        // English: Log filtered and sorted proxies count
        // Russian: Логируем количество отфильтрованных и отсортированных прокси
		console.log(`[WebFailedRequestMonitor] Отсортированных прокси для ${normalizedSite}: ${sortedProxies.length}`)

        // English: Get temp skip list for this site
        // Russian: Получаем временный список пропуска для этого сайта
        let tempSkipList = WebFailedRequestMonitor._tempSkipList.get(normalizedSite) || new Set();

        // English: Check if user has a manually selected proxy for this site
        // Russian: Проверяем, есть ли у пользователя вручную выбранный прокси для этого сайта
        const userSelectedProxyId = WebFailedRequestMonitor._userSelectedProxy.get(normalizedSite);

        // English: Determine the starting proxy
        // Russian: Определяем начальный прокси
        let startProxyId: string | null = null;
        let isUserSelected = false;

        if (userSelectedProxyId) {
            // English: User manually selected a proxy - try it first (even if it's unknown)
            // Russian: Пользователь вручную выбрал прокси - пробуем его первым (даже если он неизвестен)
            const userProxy = allProxies.find(p => p.id === userSelectedProxyId);
            if (userProxy) {
                startProxyId = userSelectedProxyId;
                isUserSelected = true;
                // English: Clear user selected proxy after first use (it will be in the list normally)
                // Russian: Очищаем выбранный пользователем прокси после первого использования (он будет в списке обычно)
                WebFailedRequestMonitor._userSelectedProxy.delete(normalizedSite);
		console.log(`[WebFailedRequestMonitor] Using user-selected proxy ${WebFailedRequestMonitor.formatProxyInfo(userSelectedProxyId, normalizedSite)} as first try for ${normalizedSite}`)
            }
        }

        // English: Build the ordered list of proxies to try (without filtering skip yet)
        // Russian: Строим упорядоченный список прокси для перебора (без фильтрации пропуска)
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

        // English: Save original ordered list before filtering for index calculation
        // Russian: Сохраняем исходный упорядоченный список до фильтрации для вычисления индекса
        const originalOrderedProxies = [...orderedProxies];

        // English: Find starting index in the original list (before filtering)
        // Russian: Находим начальный индекс в исходном списке (до фильтрации)
        let startIndex = 0;
        if (currentProxyId) {
            const currentIndex = originalOrderedProxies.findIndex(p => p.id === currentProxyId);
            if (currentIndex !== -1) {
                startIndex = (currentIndex + 1) % originalOrderedProxies.length;
            } else {
                // English: If current proxy not found, use saved index or 0
                // Russian: Если текущий прокси не найден, используем сохранённый индекс или 0
                const savedIndex = WebFailedRequestMonitor._failoverIndex.get(normalizedSite);
                if (savedIndex !== undefined && savedIndex < originalOrderedProxies.length) {
                    startIndex = savedIndex;
                } else {
                    startIndex = 0;
                }
            }
        } else {
            // English: No current proxy, use saved index or 0
            // Russian: Нет текущего прокси, используем сохранённый индекс или 0
            const savedIndex = WebFailedRequestMonitor._failoverIndex.get(normalizedSite);
            if (savedIndex !== undefined && savedIndex < originalOrderedProxies.length) {
                startIndex = savedIndex;
            } else {
                startIndex = 0;
            }
        }

		console.log(`[WebFailedRequestMonitor] Starting from index ${startIndex} for ${normalizedSite}`)

        // English: Filter out proxies in the temp skip list
        // Russian: Исключаем прокси из временного списка пропуска
        if (tempSkipList.size > 0) {
            orderedProxies = orderedProxies.filter(p => !tempSkipList.has(p.id));
            if (orderedProxies.length === 0) {
                // English: All proxies are in skip list – this means we've tried all available proxies in this cycle
                // Russian: Все прокси в списке пропуска – это значит, что мы перебрали все доступные прокси в этом цикле
				console.log(`[WebFailedRequestMonitor] Все прокси пропущены для ${normalizedSite}, увеличиваем счётчик цикла и очищаем список пропуска`)
                // English: Increment cycle count and clear temp skip list for next cycle
                // Russian: Увеличиваем счётчик циклов и очищаем временный список пропуска для следующего цикла
                cycleCount++;
                WebFailedRequestMonitor._failoverCycleCount.set(normalizedSite, cycleCount);
//console.log(`[WebFailedRequestMonitor] Cycle ${cycleCount}/${maxAttempts} for ${normalizedSite} (все прокси пропущены)`)
                if (cycleCount >= maxAttempts) {
//console.log(`[WebFailedRequestMonitor] Max failover attempts (${maxAttempts}) reached for ${normalizedSite}, stopping`)
                    PolyFill.runtimeSendMessage({
                        command: "NOTIFY_FAILOVER_STOP",
                        site: normalizedSite,
                        reason: "max_attempts_reached_all_skipped",
                        attempts: maxAttempts
                    });
                    WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                    return;
                }
                // English: Clear skip list and retry with all proxies
                // Russian: Очищаем список пропуска и пробуем все прокси
                WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
                tempSkipList = new Set(); // reset for this iteration
                orderedProxies = sortedProxies;
            }
        }

        if (orderedProxies.length === 0) {
		console.log(`[WebFailedRequestMonitor] No proxies available for ${normalizedSite} after filtering, aborting`)
            WebFailedRequestMonitor._tempSkipList.delete(normalizedSite);
            return;
        }

        // English: Find the next proxy starting from startIndex in the original list, skipping those in tempSkipList
        // Russian: Находим следующий прокси, начиная с startIndex в исходном списке, пропуская те, что в tempSkipList
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
		console.log(`[WebFailedRequestMonitor] No next proxy found for ${normalizedSite}`)
            return;
        }

        // English: If we wrapped around to the beginning, log it, but do not clear temp skip list.
        // Russian: Если мы вернулись к началу, логируем это, но не очищаем временный список пропуска.
        // The cycle count is incremented when all proxies are in the skip list (handled above).
        if (nextIndex <= 1) {
		console.log(`[WebFailedRequestMonitor] Wrapping around to beginning for ${normalizedSite}, nextIndex ${nextIndex}`)
        }

        // English: Update failover index for next iteration
        // Russian: Обновляем индекс failover для следующей итерации
        WebFailedRequestMonitor._failoverIndex.set(normalizedSite, nextIndex);

        // English: Apply next proxy
        // Russian: Применяем следующий прокси
        WebFailedRequestMonitor._failoverInProgress.add(normalizedSite);
		console.log(`[WebFailedRequestMonitor] Failover to ${WebFailedRequestMonitor.formatProxyInfo(nextProxy.id, normalizedSite)} for ${normalizedSite} (next index ${nextIndex})`)
        ProxyEngine.setDynamicProxyForSite(normalizedSite, nextProxy.id);

        // Reload tab
        // English: Use a longer delay for the first attempt to allow proxy to stabilize
        // Russian: Используем более длинную задержку для первой попытки, чтобы дать прокси стабилизироваться
        const isFirstAttempt = WebFailedRequestMonitor._failoverCycleCount.get(normalizedSite) === 0 && !currentProxyId;
        const delay = isFirstAttempt ? 5000 : 3000;
        if (tabId > -1) {
            // English: Clear any existing timeout for this site before setting a new one
            // Russian: Очищаем существующий таймаут для этого сайта перед установкой нового
            if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
                clearTimeout(WebFailedRequestMonitor._failoverTimeouts.get(normalizedSite)!);
                WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
            }
            const timeoutId = setTimeout(() => {
                // English: Check if site was cancelled during the delay
                // Russian: Проверяем, не был ли сайт отменён во время задержки
                if (WebFailedRequestMonitor._cancelFailoverForSite.has(normalizedSite)) {
					console.log(`[WebFailedRequestMonitor] Reload cancelled for ${normalizedSite} (user stopped)`)
                    WebFailedRequestMonitor._cancelFailoverForSite.delete(normalizedSite);
                    WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
                    WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                    return;
                }
                PolyFill.tabsReload(tabId);
                WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
                WebFailedRequestMonitor._failoverTimeouts.delete(normalizedSite);
            }, delay);
            WebFailedRequestMonitor._failoverTimeouts.set(normalizedSite, timeoutId);
        } else {
            WebFailedRequestMonitor._failoverInProgress.delete(normalizedSite);
//console.log(`[WebFailedRequestMonitor] tabId is -1, proxy applied but no reload.`)
        }
    }
	
	    /**
     * English: Sets the user-selected proxy for a site (tried first in failover)
     * Russian: Устанавливает выбранный пользователем прокси для сайта (пробуется первым при failover)
     */
    public static setUserSelectedProxy(site: string, proxyId: string): void {
        if (!site || !proxyId) return;
        WebFailedRequestMonitor._userSelectedProxy.set(site, proxyId);
		console.log(`[WebFailedRequestMonitor] User selected proxy ${proxyId} for site ${site}`)
    }

    /**
     * English: Clears the user-selected proxy for a site
     * Russian: Очищает выбранный пользователем прокси для сайта
     */
    public static clearUserSelectedProxy(site: string): void {
        WebFailedRequestMonitor._userSelectedProxy.delete(site);
		console.log(`[WebFailedRequestMonitor] Cleared user selected proxy for site ${site}`)
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
//console.log(`[WebFailedRequestMonitor] Added ${proxyId} to temp skip list for ${site}`)
    }

    /**
     * English: Clears the temporary skip list for a site
     * Russian: Очищает временный список пропуска для сайта
     */
    public static clearTempSkipList(site: string): void {
        WebFailedRequestMonitor._tempSkipList.delete(site);
//console.log(`[WebFailedRequestMonitor] Cleared temp skip list for ${site}`)
    }
	
	    /**
     * English: Marks that user initiated a change via 🔄 for a site
     * Russian: Отмечает, что пользователь инициировал смену через 🔄 для сайта
     */
    public static setUserInitiatedChange(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._userInitiatedChange.add(site);
		console.log(`[WebFailedRequestMonitor] User initiated change for site ${site}`)
    }

    /**
     * English: Clears the user-initiated-change flag for a site
     * Russian: Очищает флаг инициированной пользователем смены для сайта
     */
    public static clearUserInitiatedChange(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._userInitiatedChange.delete(site);
//console.log(`[WebFailedRequestMonitor] User initiated change cleared for site ${site}`)
    }
	
	    /**
     * English: Marks a site to skip auto-pin on next successful load
     * Russian: Отмечает сайт, чтобы пропустить авто-закрепление при следующей успешной загрузке
     */
    public static skipAutoPinForSite(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._skipAutoPinForSite.add(site);
		console.log(`[WebFailedRequestMonitor] Auto-pin will be skipped for site ${site}`)
    }

    /**
     * English: Clears the skip-auto-pin flag for a site
     * Russian: Очищает флаг пропуска авто-закрепления для сайта
     */
    public static clearSkipAutoPinForSite(site: string): void {
        if (!site) return;
        WebFailedRequestMonitor._skipAutoPinForSite.delete(site);
//console.log(`[WebFailedRequestMonitor] Auto-pin skip cleared for site ${site}`)
    }

    /**
     * English: Cancels failover for a specific site (user pressed stop in browser)
     * Russian: Отменяет failover для конкретного сайта (пользователь нажал стоп в браузере)
     */
    public static cancelFailoverForSite(site: string): void {
        if (!site) return;
        const normalizedSite = Core.normalizeSite(site);
        if (!normalizedSite) return;

		console.log(`[WebFailedRequestMonitor] Cancelling failover for site ${normalizedSite}`)

        // English: Mark site as cancelled
        // Russian: Отмечаем сайт как отменённый
        WebFailedRequestMonitor._cancelFailoverForSite.add(normalizedSite);

        // English: Clear pending timeout if any
        // Russian: Очищаем ожидающий таймаут, если есть
        if (WebFailedRequestMonitor._failoverTimeouts.has(normalizedSite)) {
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