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
 */

import { api, environment } from "../../lib/environment";
import { jQuery, messageBox } from "../../lib/External";
import { CommandMessages, PopupInternalDataType, ProxyableDomainType, FailedRequestType, ProxyServer, CompiledProxyRuleSource, SmartProfileBase, SmartProfileType, SmartProfileTypeBuiltinIds, getSmartProfileTypeIcon, ProxyServerFromSubscription, ProxyRuleSpecialProxyServer, AutoStatusMap } from "../../core/definitions";
import { PolyFill } from "../../lib/PolyFill";
import { CommonUi } from "./CommonUi";
import { Utils } from "../../lib/Utils";
import { ProfileOperations } from "../../core/ProfileOperations";
import { CountryCode } from "../../lib/CountryCode";
import { getProxyStatus, ProxyStatusInfo } from "../../core/statusUtils";
import { IP_SERVICES } from "../../core/TestConstants";
// Core import removed – we don't call Core.sendTestLogStep from popup

type JQuery = typeof jQuery;

export class popup {
    private static popupData: PopupInternalDataType = null;
    private static activeProfile: SmartProfileBase;

    // ProxyMust: UI elements
    private static currentSiteLabel: JQuery;
    private static addCurrentSiteBtn: JQuery;
    private static quickTestBtn: JQuery;
    private static quickTestProgress: JQuery;
    private static addAllSuccessfulSubsBtn: JQuery;
    private static openTestLogBtn: JQuery;
    private static quickTestInProgress: boolean = false;
    private static isOpeningLog: boolean = false;

    // English: Last tested site for status display after test completion
    // Russian: Последний тестированный сайт для отображения статусов после завершения теста
    private static lastTestSite: string = '';

    public static initialize() {
        popup.onDocumentReady(popup.bindEvents);

        // English: Check if popup is opened in special "getDirectIp" mode (for Firefox)
        // Russian: Проверяем, открыт ли попап в специальном режиме "getDirectIp" (для Firefox)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("mode") === "getDirectIp") {
            console.log("[ProxyMust] Popup started in getDirectIp mode");
            popup.getDirectIpAndClose().catch(err => {
                console.error("[ProxyMust] Failed to get direct IP:", err);
                PolyFill.runtimeSendMessage({ command: "DIRECT_IP_RESULT", ip: null });
                window.close();
            });
            return;
        }

        PolyFill.runtimeSendMessage(CommandMessages.PopupGetInitialData,
            (dataForPopup: PopupInternalDataType) => {
                if (dataForPopup != null) {
                    popup.popupData = dataForPopup;
                    popup.populateDataForPopup(dataForPopup);
                }
            },
            (error: Error) => {
                PolyFill.runtimeSendMessage("PopupGetInitialData failed! > " + error);
            });
        api.runtime.onMessage.addListener(popup.handleMessages);
        // English: Restore lastTestSite from sessionStorage if available
        // Russian: Восстанавливаем lastTestSite из sessionStorage, если есть
        const storedSite = sessionStorage.getItem("proxyMust_lastTestSite");
        if (storedSite) {
            popup.lastTestSite = storedSite;
            console.log("[ProxyMust] Restored lastTestSite from sessionStorage:", popup.lastTestSite);
        }
        popup.onDocumentReady(CommonUi.localizeHtmlPage);
		        // ========== ProxyMust: listen to storage changes for rating toggle ==========
        // English: Listen to storage changes to update UI when rating setting changes
        // Russian: Слушаем изменения хранилища, чтобы обновлять UI при изменении настройки рейтинга
        api.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.options) {
                const newOptions = changes.options.newValue;
                if (newOptions && typeof newOptions.enableRating === 'boolean') {
                    console.log("[Popup] Rating setting changed to:", newOptions.enableRating);
                    // Update popupData and UI
                    if (popup.popupData) {
                        popup.popupData.enableRating = newOptions.enableRating;
                        popup.updateRatingDependentUI(newOptions.enableRating);
                        popup.updateAddAllSuccessfulSubsButtonVisibility();
                        // Also refresh proxy list because rating affects sorting
                        popup.populateActiveProxy(popup.popupData);
                    }
                }
            }
        });
        // ========== END ==========
    }

    /**
     * English: Gets direct IP using the legacy method (works in Firefox) and sends result to background.
     * Russian: Получает прямой IP старым методом (работает в Firefox) и отправляет результат в фон.
     */
    private static async getDirectIpAndClose(): Promise<void> {
        console.log("[ProxyMust] Getting direct IP via popup...");

        // Step 1: Switch to Direct profile
        await new Promise<void>((resolve) => {
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupChangeActiveProfile,
                profileId: SmartProfileTypeBuiltinIds.Direct
            }, () => {
                console.log("[ProxyMust] Switched to Direct profile");
                resolve();
            });
        });

        // Wait for profile change to take effect
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Step 2: Test all IP services, collect working ones and the fastest IP
        const workingServices: string[] = [];
        let fastestIp: string | null = null;
        let fastestTime = Infinity;

        for (const service of IP_SERVICES) {
            try {
                const start = Date.now();
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
                        workingServices.push(service);
                        const elapsed = Date.now() - start;
                        if (elapsed < fastestTime) {
                            fastestTime = elapsed;
                            fastestIp = ip;
                        }
                        console.log(`[ProxyMust] IP-сервис ${service} вернул ${ip} за ${elapsed}мс`);
                    }
                }
            } catch (e) {
                console.log(`[ProxyMust] IP-сервис ${service} недоступен`);
            }
        }

        if (fastestIp) {
            console.log(`%c[ProxyMust] ПРЯМОЙ IP через попап: ${fastestIp}`, 'color: #00aaff; font-weight: bold; font-size: 1.2em');
        } else {
            console.warn("[ProxyMust] Не удалось получить прямой IP");
        }
        console.log(`[ProxyMust] Работающие IP-сервисы (${workingServices.length}):`, workingServices);

        // Step 3: Switch back to Always Enabled profile
        await new Promise<void>((resolve) => {
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupChangeActiveProfile,
                profileId: SmartProfileTypeBuiltinIds.AlwaysEnabled
            }, () => {
                console.log("[ProxyMust] Switched back to Always Enabled profile");
                resolve();
            });
        });

        // Step 4: Send result to background and close
        PolyFill.runtimeSendMessage({ command: "DIRECT_IP_RESULT", ip: fastestIp, workingServices: workingServices });
        setTimeout(() => window.close(), 500);
    }

    private static handleMessages(message: any, sender: any, sendResponse: Function) {
        // English: If message is empty, just return
        // Russian: Если сообщение пустое, просто возвращаемся
        if (!message) {
            if (sendResponse) sendResponse(null);
            return;
        }

        // English: Handle object messages (commands)
        // Russian: Обрабатываем объектные сообщения (команды)
        if (message && typeof message === "object") {
            const command = message["command"];

            // English: WebFailedRequestNotification - update failed requests display
            // Russian: WebFailedRequestNotification - обновляем отображение упавших запросов
            if (command === CommandMessages.WebFailedRequestNotification) {
                if (message["tabId"] == null) return;
                let sourceTabId = popup.popupData?.currentTabId;
                if (sourceTabId == null) {
                    PolyFill.runtimeSendMessage("Popup has invalid data. popupData is null" + JSON.stringify(popup.popupData));
                    return;
                }
                let tabId = message["tabId"];
                if (tabId != sourceTabId) return;
                let failedRequests: FailedRequestType[] = message["failedRequests"];
                popup.populateFailedRequests(failedRequests);
                if (sendResponse) sendResponse(null);
                return;
            }

            // English: PopupActiveTabChanged - refresh popup data when active tab changes
            // Russian: PopupActiveTabChanged - обновляем данные попапа при смене активной вкладки
            if (command === CommandMessages.PopupActiveTabChanged) {
                popup.refreshPopupData();
                if (sendResponse) sendResponse(null);
                return;
            }
            // English: When proxy test completes or is cancelled, refresh popup data
            // Russian: Когда тест прокси завершён или отменён, обновляем данные попапа
            if (command === "CHECK_COMPLETE" || command === "TEST_CANCELLED") {
                // English: Store the site from completion/cancellation message (always, even if popup wasn't in progress)
                // Russian: Сохраняем сайт из сообщения о завершении/отмене (всегда, даже если попап не был в процессе)
                if (message.site) {
                    popup.lastTestSite = message.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
                }
                // English: Persist lastTestSite across popup sessions
                // Russian: Сохраняем lastTestSite между сессиями попапа
                sessionStorage.setItem("proxyMust_lastTestSite", popup.lastTestSite);
                if (popup.quickTestInProgress) {
                    popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestButton") + "</span>");
                    popup.quickTestBtn.removeClass("btn-danger").addClass("btn-outline-success");
                    popup.quickTestProgress.hide();
                    popup.quickTestInProgress = false;
                }
                popup.refreshPopupData();
                if (sendResponse) sendResponse(null);
                return;
            }

            if (command === "CHECK_PROGRESS") {
                // English: Ensure button shows "Stop" if test is running
                // Russian: Убеждаемся, что кнопка показывает "Stop", если тест запущен
                if (!popup.quickTestInProgress) {
                    popup.quickTestInProgress = true;
                    popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestStopButton") + "</span>");
                    popup.quickTestBtn.removeClass("btn-outline-success").addClass("btn-danger");
                    popup.quickTestProgress.show();
                }
                const completed = message.completed;
                const total = message.total;
                const testType = message.testType;
                // English: Store the site being tested for later status display
                // Russian: Сохраняем тестируемый сайт для последующего отображения статусов
                if (message.site) {
                    popup.lastTestSite = message.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
                }
                sessionStorage.setItem("proxyMust_lastTestSite", popup.lastTestSite);
                // English: Update progress text
                // Russian: Обновляем текст прогресса
                if (testType === "cycle") {
                    popup.quickTestProgress.text(`${completed}/${total} - ${message.proxyHost || ""}`);
                } else {
                    popup.quickTestProgress.text(`${completed}/${total}`);
                }
                if (completed >= total) {
                    popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestButton") + "</span>");
                    popup.quickTestBtn.removeClass("btn-danger").addClass("btn-outline-success");
                    popup.quickTestProgress.hide();
                    popup.quickTestInProgress = false;
                }
                if (sendResponse) sendResponse(null);
                return;
            }
        }

        // English: Default response for unhandled messages
        // Russian: Ответ по умолчанию для необработанных сообщений
        if (sendResponse) sendResponse(null);
    }

    private static onDocumentReady(callback: Function) {
        jQuery(document).ready(callback);
    }

    private static bindEvents() {
        console.log("[Popup] bindEvents вызван, время:", Date.now());
        jQuery("#openSettings").click(() => {
            PolyFill.runtimeOpenOptionsPage();
            popup.closeSelf();
        });
        jQuery("#openProxyable").click(() => {
            if (!popup.popupData) return;
            var sourceTabId = popup.popupData.currentTabId;
            api.tabs.create({
                active: true,
                url: PolyFill.extensionGetURL(`ui/proxyable.html?id=${sourceTabId}`)
            });
            popup.closeSelf();
        });

        jQuery("#divFailedRequests a").click(() => {
            jQuery(".popup-menu-failed").toggle();
        });

        jQuery("#btnAddFailedRequests").click(popup.onAddFailedRequestsClick);
        jQuery("#btnAddIgnoredFailures").click(popup.onAddIgnoredFailuresClick);

        // ProxyMust: bind buttons for current site and test refresh
        // English: Initialize UI elements and tooltips
        // Russian: Инициализация элементов интерфейса и всплывающих подсказок
        popup.currentSiteLabel = jQuery("#currentSiteLabel");
        popup.addCurrentSiteBtn = jQuery("#addCurrentSiteBtn");
        popup.quickTestBtn = jQuery("#quickTestBtn");
        popup.quickTestProgress = jQuery("#quickTestProgress");
        popup.addAllSuccessfulSubsBtn = jQuery("#addAllSuccessfulSubsBtn");
        popup.openTestLogBtn = jQuery("#openTestLogBtn");

        console.log("[ProxyMust] quickTestBtn found:", popup.quickTestBtn.length);

        // English: Add tooltips for buttons
        // Russian: Добавляем всплывающие подсказки для кнопок
        if (popup.quickTestBtn.length) {
            popup.quickTestBtn.attr("title", api.i18n.getMessage("popupQuickTestTooltip") || "Quick test to find working proxies for the current site");
        }
        if (popup.addAllSuccessfulSubsBtn.length) {
            popup.addAllSuccessfulSubsBtn.attr("title", api.i18n.getMessage("popupAddAllSuccessfulSubsTooltip") || "Adds subscription proxies that passed the test to your manual list");
        }
        if (popup.addCurrentSiteBtn.length) {
            popup.addCurrentSiteBtn.attr("title", api.i18n.getMessage("popupAddCurrentSiteTooltip") || "Add current site to test list");
        }
        if (popup.addAllSuccessfulSubsBtn.length) {
            console.log("[Popup] Привязываем обработчик для addAllSuccessfulSubsBtn");
            popup.addAllSuccessfulSubsBtn.off("click").on("click", popup.onAddAllSuccessfulSubscriptionsClick);
        }
        if (popup.openTestLogBtn.length) {
            console.log("[Popup] Привязываем обработчик для openTestLogBtn");
            popup.openTestLogBtn.off("click").on("click", popup.onOpenTestLogClick);
        }

        if (popup.addCurrentSiteBtn.length) {
            popup.addCurrentSiteBtn.off("click").on("click", popup.onAddCurrentSiteClick);
        }
        if (popup.quickTestBtn.length) {
            popup.quickTestBtn.off("click").on("click", popup.onQuickTestClick);
        }
        console.log("[Popup] bindEvents завершён");
        popup.checkRunningTests();
    }

    private static checkRunningTests() {
        // English: Check status of regular proxy test
        // Russian: Проверяем статус обычного теста прокси
        PolyFill.runtimeSendMessage({ command: "GET_PROXY_TEST_STATUS" }, (status: any) => {
            if (status && status.isRunning) {
                popup.quickTestInProgress = true;
                popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestStopButton") + "</span>");
                popup.quickTestBtn.removeClass("btn-outline-success").addClass("btn-danger");
                popup.quickTestProgress.text(`${status.completed}/${status.total}`).show();
            }
        });

        // English: Check status of express cycle test
        // Russian: Проверяем статус экспресс-циклического теста
        PolyFill.runtimeSendMessage({ command: "GET_EXPRESS_CYCLE_TEST_STATUS" }, (status: any) => {
            if (status && status.isRunning) {
                popup.quickTestInProgress = true;
                popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestStopButton") + "</span>");
                popup.quickTestBtn.removeClass("btn-outline-success").addClass("btn-danger");
                popup.quickTestProgress.text(`${status.completed}/${status.total}`).show();
                if (status.site) {
                    popup.lastTestSite = status.site.replace(/^https?:\/\//, '').replace(/\/$/, '');
                    sessionStorage.setItem("proxyMust_lastTestSite", popup.lastTestSite);
                }
            }
        });
    }

    private static populateDataForPopup(dataForPopup: PopupInternalDataType) {
        CommonUi.applyThemes(dataForPopup.themeData);
        CommonUi.applyThemes(dataForPopup.themeData);
        popup.updateActiveProfile(dataForPopup);
        popup.populateUpdateAvailable(dataForPopup);
        popup.populateUnsupportedFeatures(dataForPopup);
        popup.populateSmartProfiles(dataForPopup.proxyProfiles, dataForPopup.activeProfileId);
        popup.populateActiveProxy(dataForPopup);
        popup.populateProxyableDomainList(dataForPopup.proxyableDomains);
        popup.populateFailedRequests(dataForPopup.failedRequests);
        popup.updateCurrentSiteDisplay(dataForPopup.currentSite);
        popup.updateRatingDependentUI(dataForPopup.enableRating);
        // English: Update visibility of "Add working" button based on subscription test results
        // Russian: Обновляем видимость кнопки "ДОБАВИТЬ РАБОЧИЕ" на основе результатов тестов подписок
        popup.updateAddAllSuccessfulSubsButtonVisibility();
    }

    static updateActiveProfile(dataForPopup: PopupInternalDataType) {
        if (dataForPopup.activeProfileId) {
            popup.activeProfile = dataForPopup.proxyProfiles.find(a => a.profileId == dataForPopup.activeProfileId);
        } else {
            popup.activeProfile = null;
        }
    }

    private static updateRatingDependentUI(enableRating: boolean) {
        const $quickTestBtn = jQuery("#quickTestBtn");
        const $addAllSuccessfulSubsBtn = jQuery("#addAllSuccessfulSubsBtn");
        const $proxyMustHeader = jQuery("#proxyMustHeader");
        const $quickTestProgress = jQuery("#quickTestProgress");
        const $openTestLogBtn = jQuery("#openTestLogBtn");

        // English: Show test UI if either rating is enabled OR direct IP detection is enabled
        // Russian: Показываем интерфейс тестирования, если включен рейтинг ИЛИ прямое IP
        const enableRatingOrDirectIp = enableRating || popup.popupData?.enableDirectIpDetection === true;
        console.log(`[Popup] updateRatingDependentUI: enableRating=${enableRating}, enableDirectIpDetection=${popup.popupData?.enableDirectIpDetection}, show=${enableRatingOrDirectIp}`);

        if (enableRatingOrDirectIp) {
            $quickTestBtn.show();
            $proxyMustHeader.show();
            $quickTestProgress.hide(); // initially hidden

            // English: Show "Add working" button only if there are subscription proxies and any successful test results
            // Russian: Показываем кнопку "ДОБАВИТЬ РАБОЧИЕ" только если есть подписочные прокси и хотя бы один успешный результат теста
            const hasSubscriptions = popup.popupData?.proxyServersSubscribed && popup.popupData.proxyServersSubscribed.length > 0;
            let hasSuccessfulSubscriptions = false;

            if (hasSubscriptions && popup.popupData?.autoStatus) {
                const staleHours = popup.popupData?.staleHours ?? 6;
                const autoStatus = popup.popupData.autoStatus;
                const sites = new Set<string>();

                // English: Collect all sites that have test data
                // Russian: Собираем все сайты, для которых есть данные тестов
                for (const proxyId in autoStatus) {
                    for (const site in autoStatus[proxyId]) {
                        sites.add(site);
                    }
                }
                const sitesArray = Array.from(sites);

                // English: Check if any subscription proxy has a successful status for any site
                // Russian: Проверяем, есть ли у какого-либо подписочного прокси успешный статус для любого сайта
                for (const proxy of popup.popupData.proxyServersSubscribed) {
                    for (const site of sitesArray) {
                        const statusInfo = getProxyStatus(proxy.id, site, autoStatus, staleHours);
                        if (statusInfo.type === "direct-success" || statusInfo.type === "indirect-success") {
                            hasSuccessfulSubscriptions = true;
                            break;
                        }
                    }
                    if (hasSuccessfulSubscriptions) break;
                }
            }

            if (hasSubscriptions && hasSuccessfulSubscriptions) {
                $addAllSuccessfulSubsBtn.show();
            } else {
                $addAllSuccessfulSubsBtn.hide();
            }
            // English: Show/hide log button
            // Russian: Показать/скрыть кнопку лога
            if (enableRating) {
                $openTestLogBtn.show();
            } else {
                $openTestLogBtn.hide();
            }
        } else {
            $quickTestBtn.hide();
            $addAllSuccessfulSubsBtn.hide();
            $proxyMustHeader.hide();
            $quickTestProgress.hide();
            $openTestLogBtn.hide();
        }
    }

    /**
     * English: Updates visibility of "Add working" button based on subscription proxies and test results
     * Russian: Обновляет видимость кнопки "ДОБАВИТЬ РАБОЧИЕ" на основе подписочных прокси и результатов тестов
     */
    private static updateAddAllSuccessfulSubsButtonVisibility() {
        const hasSubscriptions = popup.popupData?.proxyServersSubscribed && popup.popupData.proxyServersSubscribed.length > 0;
        console.log("[ProxyMust] updateAddAllSuccessfulSubsButtonVisibility called, hasSubscriptions =", hasSubscriptions, "enableRating =", popup.popupData?.enableRating);
        const $addAllSuccessfulSubsBtn = jQuery("#addAllSuccessfulSubsBtn");
        if (!$addAllSuccessfulSubsBtn.length) return;

        let hasSuccessfulSubscriptions = false;

        if (hasSubscriptions && popup.popupData?.autoStatus && popup.popupData.enableRating) {
            const staleHours = popup.popupData?.staleHours ?? 6;
            const autoStatus = popup.popupData.autoStatus;
            const sites = new Set<string>();

            // English: Collect all sites that have test data
            // Russian: Собираем все сайты, для которых есть данные тестов
            for (const proxyId in autoStatus) {
                for (const site in autoStatus[proxyId]) {
                    sites.add(site);
                }
            }
            const sitesArray = Array.from(sites);

            // English: Check if any subscription proxy has a successful status for any site
            // Russian: Проверяем, есть ли у какого-либо подписочного прокси успешный статус для любого сайта
            for (const proxy of popup.popupData.proxyServersSubscribed) {
                for (const site of sitesArray) {
                    const statusInfo = getProxyStatus(proxy.id, site, autoStatus, staleHours);
                    if (statusInfo.type === "direct-success" || statusInfo.type === "indirect-success") {
                        hasSuccessfulSubscriptions = true;
                        break;
                    }
                }
                if (hasSuccessfulSubscriptions) break;
            }
        }

        if (hasSubscriptions && hasSuccessfulSubscriptions) {
            $addAllSuccessfulSubsBtn.show();
        } else {
            $addAllSuccessfulSubsBtn.hide();
        }
    }

    private static updateCurrentSiteDisplay(site: string) {
        if (!popup.currentSiteLabel) {
            popup.currentSiteLabel = jQuery("#currentSiteLabel");
        }
        popup.currentSiteLabel.text(site || "—");
    }

    private static populateUpdateAvailable(dataForPopup: PopupInternalDataType) {
        // ProxyMust: disable update notifications
        /*
        const updateInfo = dataForPopup.updateInfo;
        if (updateInfo && updateInfo.updateIsAvailable) {
            const updateAvailableText = api.i18n.getMessage('popupUpdateText').replace('{0}', updateInfo.versionName);
            jQuery("#divUpdateIsAvailable").show()
                .find("a")
                .text(updateAvailableText)
                .attr("href", dataForPopup.updateInfo.downloadPage);
        }
        */
    }

    private static populateUnsupportedFeatures(dataForPopup: PopupInternalDataType) {
        if (dataForPopup.notSupportedSetProxySettings) {
            jQuery("#linkSystemProxy").hide();
        }
    }

    private static populateSmartProfiles(profiles: SmartProfileBase[], activeProfileId: string) {
        let divProxyProfiles = jQuery("#divProxyProfiles");
        let divProfileTemplate = divProxyProfiles.find("#divProfileTemplate").hide();
        let popupData = popup.popupData;
        let lastMenu = divProfileTemplate;

        if (popupData.currentTabIsIncognito && popupData.activeIncognitoProfileId) {
            let incognitoProfile = profiles.find(a => a.profileId == popupData.activeIncognitoProfileId);
            if (incognitoProfile != null) {
                jQuery("#divIncognitoProxyProfileHead").removeClass("d-none").show();
                divProxyProfiles.addClass("proxy-profiles-incognito-mode");
                let profileMenu = createMenuItem(incognitoProfile);
                profileMenu.addClass('active');
                profileMenu.show();
                profileMenu.on("click", (e: any) => {
                    PolyFill.runtimeOpenOptionsPage();
                    popup.closeSelf();
                });
                lastMenu.after(profileMenu);
                lastMenu = profileMenu;
                return;
            }
        }

        for (const profile of profiles) {
            if (!profile.enabled) continue;
            if (!profile.profileTypeConfig.selectable) continue;
            if (profile.profileType === SmartProfileType.SystemProxy && popupData.notSupportedSetProxySettings) continue;

            let profileMenu = createMenuItem(profile);
            if (profile.profileId == activeProfileId) profileMenu.addClass('active');
            profileMenu.show();
            profileMenu.on("click", (e: any) => popup.onSmartProfileClick(profile, e));
            lastMenu.after(profileMenu);
            lastMenu = profileMenu;
        }

        function createMenuItem(profile: SmartProfileBase): any {
            let newId = 'smart-profile-' + profile.profileId;
            let profileMenu = divProfileTemplate.clone();
            profileMenu.find("span").text(profile.profileName);
            profileMenu.find(".icon").addClass(getSmartProfileTypeIcon(profile.profileType));
            profileMenu.attr("id", newId);
            return profileMenu;
        }
    }

    private static populateActiveProxy(dataForPopup: PopupInternalDataType) {
        let divActiveProxy = jQuery("#divActiveProxy");
        let cmbActiveProxy = divActiveProxy.find("#cmbActiveProxy");
        let lblActiveProxyLabel = jQuery("#lblActiveProxyLabel");

        if (!dataForPopup.proxyServers) dataForPopup.proxyServers = [];
        if (!dataForPopup.proxyServersSubscribed) dataForPopup.proxyServersSubscribed = [];

        cmbActiveProxy.find("option").remove();

        let isProfileProxyServer = false;
        if (dataForPopup.activeProfileId) {
            let activeProfile = popup.activeProfile;
            if (!activeProfile) activeProfile = dataForPopup.proxyProfiles.find(a => a.profileId == dataForPopup.activeProfileId);
            if (activeProfile?.profileProxyServerId) isProfileProxyServer = true;
        }
        lblActiveProxyLabel.text(isProfileProxyServer ? api.i18n.getMessage("popupActiveProxy") : api.i18n.getMessage("popupActiveProxyDefault"));

        if (dataForPopup.proxyServers.length > 1 || dataForPopup.proxyServersSubscribed.length) {
            divActiveProxy.show();
            let currentProxyServerId = dataForPopup.currentProxyServerId;

            CountryCode.ensureInitialized(() => {
                popup.populateProxyServerOptions(cmbActiveProxy, dataForPopup.proxyServers, dataForPopup.proxyServersSubscribed, currentProxyServerId,
                    dataForPopup.proxyPriority, dataForPopup.autoStatus, dataForPopup.currentSite, dataForPopup.staleHours);
            });

            // Add tooltip for active proxy field (shows protocol of selected proxy)
            cmbActiveProxy.off("mouseenter.smartproxyTooltip");
            cmbActiveProxy.on("mouseenter.smartproxyTooltip", () => {
                const selectedOption = cmbActiveProxy.find("option:selected");
                if (selectedOption.length) {
                    const protocol = selectedOption.attr("title");
                    cmbActiveProxy.attr("title", protocol || "");
                } else {
                    cmbActiveProxy.attr("title", "");
                }
            });

            cmbActiveProxy.off("change.smartproxy").on("change.smartproxy", popup.onActiveProxyChange);

            if (popup.popupData?.enableRating) {
                cmbActiveProxy.off("contextmenu.smartproxyRating");
                cmbActiveProxy.on("contextmenu.smartproxyRating", (e: any) => {
                    e.preventDefault();
                    const selectedOption = cmbActiveProxy.find("option:selected");
                    if (!selectedOption.length) return false;
                    const proxyId = selectedOption.val();
                    const proxyName = selectedOption.text();
                    const isSubscription = selectedOption.attr("data-is-subscription") === "true";
                    if (isSubscription) {
                        popup.showAddSubscriptionDialog(proxyId as string);
                    } else {
                        let currentPriority: "pin" | "star" | null = null;
                        const selectedProxy = popup.popupData?.proxyServers?.find(p => p.id === proxyId);
                        if (selectedProxy) {
                            currentPriority = selectedProxy.priority || null;
                        }
                        popup.showProxyContextMenu(proxyId as string, proxyName, e, currentPriority);
                    }
                    return false;
                });
            }
        } else {
            divActiveProxy.hide();
        }
    }

    /**
     * English: Populates proxy dropdown with status symbols and proper sorting, grouping subscriptions.
     * Russian: Заполняет выпадающий список прокси символами статусов и правильной сортировкой, группируя подписки.
     */
    /**
     * English: Populates proxy dropdown with status symbols and proper sorting, grouped by source (manual / subscriptions).
     * Russian: Заполняет выпадающий список прокси символами статусов и правильной сортировкой, с группировкой по источнику (ручные / подписки).
     */
    private static populateProxyServerOptions(
        selectElement: any,
        proxyServers: ProxyServer[],
        proxyServersSubscribed: ProxyServerFromSubscription[],
        selectedProxyId: string,
        priorityMap: { [id: string]: 'pin' | 'star' | null },
        autoStatus: AutoStatusMap,
        currentSite: string,
        staleHours: number
    ) {
        const enableRating = popup.popupData?.enableRating ?? true;
        selectElement.empty();

        // English: Add manual proxies first (without optgroup)
        // Russian: Добавляем ручные прокси первыми (без optgroup)
        if (proxyServers && proxyServers.length > 0) {
            // English: Sort manual proxies by rating/priority/status
            // Russian: Сортируем ручные прокси по рейтингу/приоритету/статусу
            const sortedManual = this.sortProxiesByPriority(proxyServers, priorityMap, autoStatus, currentSite, staleHours);
            for (const proxy of sortedManual) {
                const option = this.createProxyOption(proxy, selectedProxyId, enableRating, priorityMap, autoStatus, currentSite, staleHours);
                selectElement.append(option);
            }
        }

        // English: Add subscription proxies grouped by subscription name
        // Russian: Добавляем подписочные прокси, сгруппированные по названию подписки
        if (proxyServersSubscribed && proxyServersSubscribed.length > 0) {
            // English: Group subscribed proxies by subscriptionName
            // Russian: Группируем подписочные прокси по subscriptionName
            const grouped: { [name: string]: ProxyServerFromSubscription[] } = {};
            for (const proxy of proxyServersSubscribed) {
                const subName = (proxy as any).subscriptionName || 'Subscription';
                if (!grouped[subName]) grouped[subName] = [];
                grouped[subName].push(proxy);
            }

            // English: Sort group names alphabetically
            // Russian: Сортируем названия групп по алфавиту
            const groupNames = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

            for (const groupName of groupNames) {
                const groupProxies = grouped[groupName];
                // English: Sort proxies inside group by rating/priority/status
                // Russian: Сортируем прокси внутри группы по рейтингу/приоритету/статусу
                const sortedGroup = this.sortProxiesByPriority(groupProxies, priorityMap, autoStatus, currentSite, staleHours);
                const optGroup = jQuery('<optgroup>')
                    .attr('label', groupName)
                    .appendTo(selectElement);
                for (const proxy of sortedGroup) {
                    const option = this.createProxyOption(proxy, selectedProxyId, enableRating, priorityMap, autoStatus, currentSite, staleHours);
                    // English: Mark as subscription for future reference
                    // Russian: Помечаем как подписочный для будущих ссылок
                    option.attr('data-is-subscription', 'true');
                    optGroup.append(option);
                }
            }
        }

        // English: If no proxies at all, add placeholder
        // Russian: Если нет ни одного прокси, добавляем заглушку
        if (selectElement.children().length === 0) {
            selectElement.append(jQuery('<option>')
                .attr('value', '0')
                .text(api.i18n.getMessage('settingsServersGridNoDataContent') || 'No proxies defined'));
        }
    }

    /**
     * English: Sorts proxies by priority (pin > star > none), then status weight, then rating.
     * Russian: Сортирует прокси по приоритету (pin > star > none), затем весу статуса, затем рейтингу.
     */
    private static sortProxiesByPriority(
        proxies: ProxyServer[],
        priorityMap: { [id: string]: 'pin' | 'star' | null },
        autoStatus: AutoStatusMap,
        currentSite: string,
        staleHours: number
    ): ProxyServer[] {
        const getSortWeight = (proxy: ProxyServer): number => {
            let priorityWeight = 1;
            const prio = priorityMap?.[proxy.id] || proxy.priority;
            if (prio === 'pin') priorityWeight = 3;
            else if (prio === 'star') priorityWeight = 2;

            let statusWeight = 3;
            if (autoStatus) {
                const statusInfo = getProxyStatus(proxy.id, currentSite || '', autoStatus, staleHours);
                statusWeight = statusInfo.weight;
            }
            const rating = proxy.rating ?? 0;
            return (priorityWeight * 1000) + (statusWeight * 100) + rating;
        };
        return [...proxies].sort((a, b) => getSortWeight(b) - getSortWeight(a));
    }

    /**
     * English: Creates an <option> element for a proxy with rating, status, and flag.
     * Russian: Создаёт элемент <option> для прокси с рейтингом, статусом и флагом.
     */
    private static createProxyOption(
        proxy: ProxyServer,
        selectedProxyId: string,
        enableRating: boolean,
        priorityMap: { [id: string]: 'pin' | 'star' | null },
        autoStatus: AutoStatusMap,
        currentSite: string,
        staleHours: number
    ): JQuery {
        const flag = CountryCode.getCountryFlagEmoji(proxy.countryCode || CountryCode.getCountryCode(proxy.host));
        const priority = priorityMap?.[proxy.id] || proxy.priority;

        let displayName: string;
        if (enableRating) {
            let statusInfo: ProxyStatusInfo;
            if (autoStatus) {
                statusInfo = getProxyStatus(proxy.id, currentSite || '', autoStatus, staleHours);
            } else {
                statusInfo = { type: "unknown", symbol: "❓", cssClass: "status-unknown", weight: 3 };
            }
            const statusHtml = `<span class="${statusInfo.cssClass}">${statusInfo.symbol}</span>`;
            const rating = proxy.rating ?? 0;
            const ratingText = rating === 0 ? "(0)" : (rating > 0 ? `(+${rating})` : `(${rating})`);
            let priorityIcon = "";
            if (priority === 'pin') priorityIcon = "📌 ";
            else if (priority === 'star') priorityIcon = "⭐ ";
            displayName = `${flag} ${priorityIcon}${proxy.name}${ratingText} ${statusHtml}`;
        } else {
            displayName = `${flag} ${proxy.name}`;
        }

        const option = jQuery("<option>")
            .attr("value", proxy.id)
            .attr("title", proxy.protocol)
            .html(displayName);
        if (selectedProxyId === proxy.id) option.prop("selected", true);
        return option;
    }

    /**
     * Shows custom context menu for manual proxy with rating and priority options
     * Показывает кастомное контекстное меню для ручного прокси с опциями рейтинга и приоритета
     */
    private static showProxyContextMenu(proxyId: string, proxyName: string, event: any, currentPriority: "pin" | "star" | null = null) {
        // Remove existing menu if any
        const existing = document.getElementById("proxyContextMenu");
        if (existing) existing.remove();

        // Detect current theme
        let themeClass = "theme-light";
        if (document.body.classList.contains("theme-dark")) {
            themeClass = "theme-dark";
        } else if (document.body.classList.contains("theme-light")) {
            themeClass = "theme-light";
        } else if (document.body.classList.contains("theme-auto")) {
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            themeClass = isDark ? "theme-dark" : "theme-light";
        }

        const menu = document.createElement("div");
        menu.id = "proxyContextMenu";
        menu.className = `context-menu ${themeClass}`;

        // Localized strings
        const ratingTitle = api.i18n.getMessage("settingsContextMenuRatingTitle") || "Manual rating";
        const resetText = api.i18n.getMessage("settingsContextMenuResetRating") || "Reset rating";

        // Dynamic priority menu texts
        const isStar = currentPriority === "star";
        const isPin = currentPriority === "pin";
        const favoriteText = isStar
            ? (api.i18n.getMessage("settingsContextMenuRemoveFavorite") || "Remove from favorite")
            : (api.i18n.getMessage("settingsContextMenuSetFavorite") || "Set favorite");
        const pinText = isPin
            ? (api.i18n.getMessage("settingsContextMenuUnpin") || "Unpin")
            : (api.i18n.getMessage("settingsContextMenuSetPin") || "Pin");

        menu.innerHTML = `
            <div class="context-menu-header">${escapeHtml(proxyName)}</div>
            <div class="separator"></div>
            <div class="context-menu-rating-title">${escapeHtml(ratingTitle)}</div>
            <div class="context-menu-item" data-action="rating_plus1">${escapeHtml(api.i18n.getMessage("settingsContextMenuPlus1Desc"))} (+1)</div>
            <div class="context-menu-item" data-action="rating_minus1">${escapeHtml(api.i18n.getMessage("settingsContextMenuMinus1Desc"))} (-1)</div>
            <div class="context-menu-item" data-action="rating_reset">${escapeHtml(resetText)}</div>
            <div class="separator"></div>
            <div class="context-menu-item" data-action="set_favorite">⭐ ${escapeHtml(favoriteText)}</div>
            <div class="context-menu-item" data-action="set_pin">📌 ${escapeHtml(pinText)}</div>
        `;
        const menuItems = menu.querySelectorAll('.context-menu-item');
        menuItems.forEach(item => {
            (item as HTMLElement).style.marginLeft = '10px';
        });
        document.body.appendChild(menu);

        // Position near cursor
        let left = event.clientX;
        let top = event.clientY;
        const rect = menu.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;
        if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 10;
        menu.style.left = left + "px";
        menu.style.top = top + "px";

        // Handle clicks
        menu.querySelectorAll(".context-menu-item").forEach(el => {
            el.addEventListener("click", (e) => {
                const action = el.getAttribute("data-action");
                switch (action) {
                    case "rating_plus1":
                        popup.updateRating(proxyId, 1);
                        break;
                    case "rating_minus1":
                        popup.updateRating(proxyId, -1);
                        break;
                    case "rating_reset":
                        popup.resetRating(proxyId);
                        break;
                    case "set_favorite": {
                        const newPriority = currentPriority === "star" ? null : "star";
                        popup.setPriority(proxyId, newPriority);
                        break;
                    }
                    case "set_pin": {
                        const newPriority = currentPriority === "pin" ? null : "pin";
                        popup.setPriority(proxyId, newPriority);
                        break;
                    }
                }
                menu.remove();
            });
        });

        // Close on outside click
        const closeHandler = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 0);
    }

    private static updateRating(proxyId: string, delta: number) {
        PolyFill.runtimeSendMessage({ command: "UpdateProxyRating", proxyId, delta }, () => popup.refreshPopupData());
    }

    private static setPriority(proxyId: string, priority: 'pin' | 'star' | null) {
        PolyFill.runtimeSendMessage({ command: "SetProxyPriority", proxyId, priority }, () => popup.refreshPopupData());
    }

    private static onAddCurrentSiteClick() {
        const site = popup.currentSiteLabel ? popup.currentSiteLabel.text() : "";
        if (!site || site === "—") return;
        PolyFill.runtimeSendMessage({ command: "AddCurrentSiteToManual", site }, (resp) => {
            if (resp?.success) {
                const msg = api.i18n.getMessage('popupAddCurrentSiteSuccess', site) || `Site "${site}" added to test list.`;
                messageBox.success(msg);
            } else {
                messageBox.error(api.i18n.getMessage('popupAddCurrentSiteFailed') || "Failed to add site.");
            }
        });
    }

    private static resetRating(proxyId: string) {
        let currentRating = 0;
        if (popup.popupData?.proxyServers) {
            const proxy = popup.popupData.proxyServers.find(p => p.id === proxyId);
            if (proxy) currentRating = proxy.rating ?? 0;
        }
        const delta = 0 - currentRating;
        if (delta !== 0) {
            PolyFill.runtimeSendMessage({ command: "UpdateProxyRating", proxyId, delta }, () => popup.refreshPopupData());
        }
    }

    private static async onAddAllSuccessfulSubscriptionsClick() {
        const subscribedProxies = popup.popupData?.proxyServersSubscribed || [];
        if (!subscribedProxies.length) {
            messageBox.warning(api.i18n.getMessage("popupNoSubscriptionProxies"));
            return;
        }

        const staleHours = popup.popupData?.staleHours ?? 6;
        const autoStatus = popup.popupData?.autoStatus || {};

        const allSites = new Set<string>();
        for (const proxyId in autoStatus) {
            for (const site in autoStatus[proxyId]) {
                allSites.add(site);
            }
        }
        const sitesArray = Array.from(allSites);
        if (sitesArray.length === 0) {
            messageBox.info(api.i18n.getMessage("popupNoTestData"));
            return;
        }

        const manualProxyKeys = new Set<string>();
        if (popup.popupData?.proxyServers) {
            for (const p of popup.popupData.proxyServers) {
                const key = `${p.protocol}://${p.username ? p.username + '@' : ''}${p.host}:${p.port}`;
                manualProxyKeys.add(key);
            }
        }

        const toAdd: any[] = [];
        for (const proxy of subscribedProxies) {
            let isSuccessful = false;
            for (const site of sitesArray) {
                const statusInfo = getProxyStatus(proxy.id, site, autoStatus, staleHours);
                if (statusInfo.type === "direct-success" || statusInfo.type === "indirect-success") {
                    isSuccessful = true;
                    break;
                }
            }
            if (!isSuccessful) continue;

            const key = `${proxy.protocol}://${proxy.username ? proxy.username + '@' : ''}${proxy.host}:${proxy.port}`;
            if (!manualProxyKeys.has(key)) {
                toAdd.push(proxy);
            }
        }

        if (!toAdd.length) {
            messageBox.info(api.i18n.getMessage("popupNoNewSuccessfulProxies"));
            return;
        }

        popup.addAllSuccessfulSubsBtn.prop("disabled", true).html("⏳ Adding...");

        let addedCount = 0;
        let duplicateCount = 0;
        try {
            for (const proxy of toAdd) {
                const proxyPayload = {
                    id: proxy.id,
                    name: proxy.name || `${proxy.host}:${proxy.port}`,
                    host: proxy.host,
                    port: proxy.port,
                    protocol: proxy.protocol,
                    username: proxy.username || "",
                    password: proxy.password || "",
                    countryCode: proxy.countryCode || "",
                    proxyDNS: proxy.proxyDNS || false,
                    rating: proxy.rating ?? 0,
                    order: proxy.order ?? 0,
                    subscriptionName: (proxy as any).subscriptionName || ""
                };
                const response = await new Promise<any>((resolve) => {
                    PolyFill.runtimeSendMessage({ command: "AddSubscriptionProxyToManual", proxy: proxyPayload }, resolve);
                });
                if (response?.success) {
                    addedCount++;
                } else if (response?.alreadyExists) {
                    duplicateCount++;
                }
            }
        } catch (err) {
            console.error("Error adding proxies:", err);
            messageBox.error(api.i18n.getMessage("popupAddProxiesPartialFail"));
        } finally {
            popup.addAllSuccessfulSubsBtn.prop("disabled", false).html("📋 <span>" + api.i18n.getMessage("popupAddAllSuccessfulSubs") + "</span>");
            popup.refreshPopupData();
            const msg = api.i18n.getMessage("popupAddedProxiesCount", addedCount.toString(), duplicateCount ? `, ${duplicateCount} already existed` : '');
            messageBox.success(msg);
        }
    }

    /**
     * English: Opens the test log window.
     * Russian: Открывает окно лога тестирования.
     */
    private static onOpenTestLogClick() {
        console.log("[Popup] Кнопка 'Лог' нажата, время:", Date.now());
        if (popup.isOpeningLog) {
            console.log("[Popup] isOpeningLog уже true, пропускаем");
            return;
        }
        popup.isOpeningLog = true;
        console.log("[Popup] Отправка команды OPEN_TEST_LOG, isOpeningLog установлен в true");
        PolyFill.runtimeSendMessage({ command: "OPEN_TEST_LOG" }, (response) => {
            console.log("[Popup] Получен ответ на OPEN_TEST_LOG:", response);
            setTimeout(() => {
                popup.isOpeningLog = false;
                console.log("[Popup] isOpeningLog сброшен в false");
            }, 500);
            if (response && response.success) {
                console.log("[Popup] Окно лога открыто/сфокусировано, alreadyOpen:", response.alreadyOpen);
            } else {
                console.warn("[Popup] Не удалось открыть окно лога:", response?.error);
                messageBox.error(api.i18n.getMessage("testLogOpenFailed") || "Failed to open log window.");
            }
        });
    }

    private static onQuickTestClick() {
        if (popup.quickTestInProgress) {
            PolyFill.runtimeSendMessage({ command: "CANCEL_PROXY_TEST_FOR_SITE" });
            PolyFill.runtimeSendMessage({ command: "CANCEL_CYCLE_TEST_FOR_SITE" });
            PolyFill.runtimeSendMessage({ command: "CANCEL_EXPRESS_CYCLE_TEST_FOR_SITE" });
            popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestButton") + "</span>");
            popup.quickTestBtn.removeClass("btn-danger").addClass("btn-outline-success");
            popup.quickTestProgress.hide();
            popup.quickTestInProgress = false;
            return;
        }

        let site = popup.currentSiteLabel ? popup.currentSiteLabel.text() : "";
        if (!site || site === "—") {
            document.documentElement.classList.add("wide-mode-prompt");
            site = prompt(api.i18n.getMessage("settingsProxyMustAddSitePrompt"));
            document.documentElement.classList.remove("wide-mode-prompt");
            if (!site) return;
        }

        const manualProxies = popup.popupData?.proxyServers || [];
        const subscribedProxies = popup.popupData?.proxyServersSubscribed || [];
        console.log("[ProxyMust DEBUG] Case determination - manual:", manualProxies.length, "subscribed:", subscribedProxies.length);

        const allProxiesMap = new Map<string, ProxyServer>();
        for (const p of manualProxies) allProxiesMap.set(p.id, p);
        for (const p of subscribedProxies) allProxiesMap.set(p.id, p);
        const allProxies = Array.from(allProxiesMap.values());

        if (allProxies.length === 0) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
            return;
        }

        popup.showQuickTestMenu(site, manualProxies, subscribedProxies);
    }

    /**
     * English: Shows menu under the Test button with test type options
     * Russian: Показывает меню под кнопкой Тест с вариантами типа теста
     */
    private static showQuickTestMenu(site: string, manualProxies: ProxyServer[], subscribedProxies: ProxyServer[]) {
        const existing = document.getElementById("quickTestMenu");
        if (existing) existing.remove();

        document.documentElement.classList.add("wide-mode");

        const button = popup.quickTestBtn[0];
        const rect = button.getBoundingClientRect();

        const menu = document.createElement("div");
        menu.id = "quickTestMenu";
        // Все стили задаются через CSS, здесь только позиционирование и z-index
        menu.style.cssText = "position:fixed; z-index:1000000;";

        let menuHtml = '';
        
        if (environment.name !== "Firefox") {
            menuHtml += `
                <div class="quick-test-menu-item" data-test-type="all" style="padding:12px 16px; cursor:pointer; border-bottom:1px solid var(--bs-border-color, #dee2e6); transition:background-color 0.1s ease;">
                    <div style="font-weight:500; font-size:14px;">⚡ ${api.i18n.getMessage("popupTestMenuAllProxies") || "Express test for all proxies"}</div>
                    <div style="font-size:11px; color:#888; margin-top:4px;">${api.i18n.getMessage("popupTestMenuAllProxiesDesc") || "Manual + subscription proxies"}</div>
                </div>
                <div class="quick-test-menu-item" data-test-type="subscriptions" style="padding:12px 16px; cursor:pointer; border-bottom:1px solid var(--bs-border-color, #dee2e6); transition:background-color 0.1s ease;">
                    <div style="font-weight:500; font-size:14px;">📦 ${api.i18n.getMessage("popupTestMenuSubscriptionsOnly") || "Express test for subscriptions only"}</div>
                    <div style="font-size:11px; color:#888; margin-top:4px;">${api.i18n.getMessage("popupTestMenuSubscriptionsOnlyDesc") || "Then add working ones to manual list"}</div>
                </div>
            `;
        }
        
        menuHtml += `
            <div class="quick-test-menu-item" data-test-type="express-cycle-all" style="padding:12px 16px; cursor:pointer; border-bottom:1px solid var(--bs-border-color, #dee2e6); transition:background-color 0.1s ease;">
                <div style="font-weight:500; font-size:14px;">⚡🔄 ${api.i18n.getMessage("popupTestMenuExpressCycleAll") || "Express cycle test (all proxies)"}</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">${api.i18n.getMessage("popupTestMenuExpressCycleAllDesc") || "Manual + subscription proxies"}</div>
            </div>
            <div class="quick-test-menu-item" data-test-type="express-cycle-subs" style="padding:12px 16px; cursor:pointer; transition:background-color 0.1s ease;">
                <div style="font-weight:500; font-size:14px;">📦🔄 ${api.i18n.getMessage("popupTestMenuExpressCycleSubsOnly") || "Express cycle test (subscriptions only)"}</div>
                <div style="font-size:11px; color:#888; margin-top:4px;">${api.i18n.getMessage("popupTestMenuExpressCycleSubsOnlyDesc") || "Then add working ones to manual list"}</div>
            </div>
        `;

        menu.innerHTML = menuHtml;
        document.body.appendChild(menu);

        // Позиционируем меню под кнопкой
        let top = rect.bottom + 5;
        if (top + 300 > window.innerHeight) {
            top = rect.top - 300 - 5;
        }
        if (top < 5) top = 5;
        menu.style.top = top + "px";
        // left задаётся через CSS (в wide-mode: left:10px; right:10px;)
        // для страховки оставим left:0, чтобы меню не съезжало влево
        menu.style.left = "0px";

        const cleanupMenu = () => {
            menu.remove();
            document.documentElement.classList.remove("wide-mode");
        };

        const handleClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const menuItem = target.closest(".quick-test-menu-item") as HTMLElement;
            if (!menuItem) return;

            const testType = menuItem.getAttribute("data-test-type");
            cleanupMenu();

            let proxies: ProxyServer[] = [];

            if (testType === "all") {
                const proxyMap = new Map<string, ProxyServer>();
                for (const p of manualProxies) proxyMap.set(p.id, p);
                for (const p of subscribedProxies) proxyMap.set(p.id, p);
                proxies = Array.from(proxyMap.values());
            } else if (testType === "subscriptions") {
                proxies = [...subscribedProxies];
            } else if (testType === "express-cycle-all") {
                e.preventDefault();
                e.stopPropagation();
                let proxiesForExpressCycle: ProxyServer[] = [];
                const proxyMapExpress = new Map<string, ProxyServer>();
                for (const p of manualProxies) proxyMapExpress.set(p.id, p);
                for (const p of subscribedProxies) proxyMapExpress.set(p.id, p);
                proxiesForExpressCycle = Array.from(proxyMapExpress.values());
                popup.runExpressCycleTest(site, proxiesForExpressCycle);
                return;
            } else if (testType === "express-cycle-subs") {
                e.preventDefault();
                e.stopPropagation();
                let proxiesForExpressCycle: ProxyServer[] = [];
                const proxyMapExpress = new Map<string, ProxyServer>();
                for (const p of subscribedProxies) proxyMapExpress.set(p.id, p);
                proxiesForExpressCycle = Array.from(proxyMapExpress.values());
                if (proxiesForExpressCycle.length === 0) {
                    messageBox.warning(api.i18n.getMessage("popupNoSubscriptionProxies") || "No subscription proxies to test.");
                    return;
                }
                popup.runExpressCycleTest(site, proxiesForExpressCycle);
                return;
            }

            if (!proxies.length) {
                messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
                return;
            }

            popup.runQuickTest(site, proxies);
        };

        menu.addEventListener("click", handleClick);

        const closeHandler = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                cleanupMenu();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 0);
    }

    /**
     * English: Runs quick test for specified proxies
     * Russian: Запускает быстрый тест для указанных прокси
     */
    private static runQuickTest(site: string, proxies: ProxyServer[]) {
        if (!proxies.length) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
            return;
        }
        console.log(`[Popup] DEBUG: enableDirectIpDetection = ${popup.popupData?.enableDirectIpDetection}`);
        popup.quickTestInProgress = true;
        popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestStopButton") + "</span>");
        popup.quickTestBtn.removeClass("btn-outline-success").addClass("btn-danger");
        popup.quickTestProgress.text(`0/${proxies.length}`).show();
        PolyFill.runtimeSendMessage({
            command: "START_QUICK_TEST_IN_POPUP",
            site: site,
            proxies: proxies.map(p => ({
                id: p.id,
                host: p.host,
                port: p.port,
                protocol: p.protocol
            }))
        });
    }

    /**
     * English: Runs express cycle test (fast sequential proxy switching with 10s timeout)
     * Russian: Запускает экспресс-циклический тест (быстрое последовательное переключение прокси с таймаутом 10с)
     */
    private static runExpressCycleTest(site: string, proxies?: ProxyServer[]) {
        console.log("[ProxyMust] runExpressCycleTest called for site:", site);
        if (popup.quickTestInProgress) {
            PolyFill.runtimeSendMessage({ command: "CANCEL_EXPRESS_CYCLE_TEST_FOR_SITE" });
            popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestButton") + "</span>");
            popup.quickTestBtn.removeClass("btn-danger").addClass("btn-outline-success");
            popup.quickTestProgress.hide();
            popup.quickTestInProgress = false;
            return;
        }
        popup.quickTestInProgress = true;
        popup.quickTestBtn.html("⚡ <span>" + (api.i18n.getMessage("popupQuickTestStopButton") || "Stop") + "</span>");
        popup.quickTestBtn.removeClass("btn-outline-success").addClass("btn-danger");
        popup.quickTestProgress.text("Starting...").show();

        const cmbActiveProxy = document.querySelector("#cmbActiveProxy") as HTMLSelectElement;
        let totalProxies = 0;
        if (cmbActiveProxy) {
            totalProxies = cmbActiveProxy.options.length;
            for (let i = 0; i < cmbActiveProxy.options.length; i++) {
                if (cmbActiveProxy.options[i].value === "0") {
                    totalProxies--;
                    break;
                }
            }
        }
        popup.quickTestProgress.text(`0/${totalProxies}`);

        const refreshTabOnConfigChanges = popup.popupData?.refreshTabOnConfigChanges || false;
        const originalProfileId = popup.popupData?.activeProfileId || null;

        const command = "START_EXPRESS_CYCLE_TEST_FOR_SITE";
        const message: any = {
            command: command,
            site: site,
            refreshTabOnConfigChanges: refreshTabOnConfigChanges,
            originalProfileId: originalProfileId
        };
        if (proxies && proxies.length) {
            message.proxies = proxies.map(p => ({
                id: p.id,
                host: p.host,
                port: p.port,
                protocol: p.protocol
            }));
        }
        PolyFill.runtimeSendMessage(message, (response: any) => {
            if (response && response.success) {
                // English: Test started successfully
                // Russian: Тест успешно запущен
                console.log("[ProxyMust] Express cycle test started successfully");
            } else {
                // English: Test failed to start
                // Russian: Не удалось запустить тест
                const errorMsg = response?.message || "Unknown error";
                console.error("[ProxyMust] Express cycle test start failed:", errorMsg);
                messageBox.error(api.i18n.getMessage("settingsExpressCycleTestFailed", errorMsg));
                popup.quickTestInProgress = false;
                popup.quickTestBtn.html("⚡ <span>" + api.i18n.getMessage("popupQuickTestButton") + "</span>");
                popup.quickTestBtn.removeClass("btn-danger").addClass("btn-outline-success");
                popup.quickTestProgress.hide();
            }
        });
    }

    private static populateProxyableDomainList(proxyableDomainList: ProxyableDomainType[]) {
        if (!proxyableDomainList || !proxyableDomainList.length) return;

        var divProxyableContainer = jQuery("#divProxyableContainer");
        var divProxyableDomain = divProxyableContainer.find("#divProxyableDomains");
        var divProxyableDomainItem = divProxyableDomain.find("#divProxyableDomainItem");

        if (popup.activeProfile && popup.activeProfile.profileType == SmartProfileType.AlwaysEnabledBypassRules) {
            divProxyableContainer.find("#lblIgnoreTheseDomains").removeClass('d-none');
        } else {
            divProxyableContainer.find("#lblEnableProxyOn").removeClass('d-none');
        }
        divProxyableContainer.show();
        jQuery("#openProxyable").show();

        for (let i = 0; i < proxyableDomainList.length; i++) {
            let proxyableDomain = proxyableDomainList[i];
            let domain = proxyableDomain.domain;

            let item = divProxyableDomainItem.clone();
            item.show().find("span.proxyable-host-name").text(domain);
            item.appendTo(divProxyableDomain);
            item.data("proxyable-domain-type", proxyableDomain);

            var itemIcon = item.find(".proxyable-status-icon");
            var arrowButton = item.find(".proxyable-arrow-btn");

            if (proxyableDomain.ruleSource == CompiledProxyRuleSource.Subscriptions) {
                if (proxyableDomain.ruleHasWhiteListMatch) {
                    itemIcon.removeClass("fa-square").addClass("far fa-hand-paper fa-sm");
                    item.attr("title", api.i18n.getMessage("settingsRuleActionWhitelist"));
                } else {
                    itemIcon.removeClass("fa-square").addClass("fas fa-check fa-sm");
                }
                item.show().find("div.proxyable-is-subscription").show();
                item.find(".nav-link").addClass("disabled").attr("title", `Subscription Rule, can't be disabled individually`);
                arrowButton.show();
            } else if (proxyableDomain.ruleMatched) {
                popup.toggleProxyableItemUI(item, true);
                if (!proxyableDomain.ruleMatchedThisHost) {
                    item.find(".nav-link").addClass("disabled").attr("title", `Enabled by other domains`);
                }
            } else {
                popup.toggleProxyableItemUI(item, false);
            }
            item.on("click", popup.onProxyableDomainClick);
            item.find(".proxyable-arrow-btn").on("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                popup.onProxyableArrowClick(this, proxyableDomain);
            });
            divProxyableDomainItem.hide();
        }
    }

    private static toggleProxyableItemUI(item: any, enabled: boolean) {
        let itemIcon = item.find(".proxyable-status-icon");
        let arrowButton = item.find(".proxyable-arrow-btn");
        if (enabled) {
            itemIcon.removeClass("fa-square").addClass("fa-check-square");
            arrowButton.show();
        } else {
            itemIcon.removeClass("fa-check-square").addClass("fa-square");
            arrowButton.hide();
        }
    }

    private static onProxyableDomainClick() {
        let clickedItem = jQuery(this);
        let proxyableDomain: ProxyableDomainType = clickedItem.data("proxyable-domain-type");
        if (proxyableDomain.ruleSource == CompiledProxyRuleSource.Subscriptions) return;

        let domain = proxyableDomain.domain;
        let hasMatchingRule = proxyableDomain.ruleMatched;
        let ruleIsForThisHost = proxyableDomain.ruleMatchedThisHost;

        if (!hasMatchingRule || (hasMatchingRule && ruleIsForThisHost == true)) {
            PolyFill.runtimeSendMessage(`proxyable-host-name: ${domain}`);
            let ruleIsBeingEnabled = !hasMatchingRule;
            popup.toggleProxyableItemUI(clickedItem, ruleIsBeingEnabled);
            proxyableDomain.ruleMatched = ruleIsBeingEnabled;
            proxyableDomain.ruleMatchedThisHost = ruleIsBeingEnabled;
            clickedItem.data("proxyable-domain-type", proxyableDomain);
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupToggleProxyForDomain,
                domain: domain,
                ruleId: proxyableDomain.ruleId
            });
            popup.refreshActiveTabIfNeeded();
            if (ruleIsBeingEnabled) {
                popup.closeSelfWhenRefreshTabNeeded();
            } else {
                popup.closeSelf();
            }
        } else {
            PolyFill.runtimeSendMessage(`rule is not for this domain: ${domain}`);
        }
    }

    private static onProxyableArrowClick(buttonElement: HTMLElement, proxyableDomain: ProxyableDomainType) {
        let button = jQuery(buttonElement);
        let item = button.closest("li");
        let panel = item.find(".proxyable-panel");
        let icon = button.find("i");

        if (panel.is(":visible")) {
            panel.slideUp(200);
            icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
        } else {
            jQuery(".proxyable-panel:visible").each(function () {
                jQuery(this).slideUp(200);
                jQuery(this).closest("li").find(".proxyable-arrow-btn i").removeClass("fa-chevron-up").addClass("fa-chevron-down");
            });
            if (!panel.data("proxy-servers-populated")) {
                popup.populateProxyableDomainProxyList(item, proxyableDomain);
                panel.data("proxy-servers-populated", true);
            }
            panel.slideDown(200);
            icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
        }
    }

    private static populateProxyableDomainProxyList(item: any, proxyableDomain: ProxyableDomainType) {
        let cmbRuleProxy = item.find(".proxyable-proxy-select");
        cmbRuleProxy.empty();
        if (cmbRuleProxy.length) {
            jQuery("<option>").attr("value", ProxyRuleSpecialProxyServer.DefaultGeneral).text(api.i18n.getMessage("settingsRulesProxyDefault")).appendTo(cmbRuleProxy);
            jQuery("<option>").attr("value", ProxyRuleSpecialProxyServer.ProfileProxy).text(api.i18n.getMessage("settingsRulesProxyFromProfile")).appendTo(cmbRuleProxy);
        }
        if (!popup.popupData.proxyServers) popup.popupData.proxyServers = [];
        if (!popup.popupData.proxyServersSubscribed) popup.popupData.proxyServersSubscribed = [];

        let ruleProxyServerId = proxyableDomain.proxyServerId || null;
        popup.populateProxyServerOptions(cmbRuleProxy, popup.popupData.proxyServers, popup.popupData.proxyServersSubscribed, ruleProxyServerId,
            popup.popupData.proxyPriority, popup.popupData.autoStatus, popup.popupData.currentSite, popup.popupData.staleHours);

        cmbRuleProxy.on("change", function () {
            popup.onProxyableDomainProxyChange(this, proxyableDomain);
        });
        cmbRuleProxy.on("click", function (e) {
            e.stopPropagation();
        });
    }

    private static onProxyableDomainProxyChange(selectElement: HTMLElement, proxyableDomain: ProxyableDomainType) {
        let select = jQuery(selectElement);
        let selectedProxyId = select.val() as string;
        PolyFill.runtimeSendMessage({
            command: CommandMessages.PopupChangeProxyForRule,
            domain: proxyableDomain.domain,
            ruleId: proxyableDomain.ruleId,
            proxyServerId: selectedProxyId
        });
        popup.refreshActiveTabIfNeeded();
    }

    private static populateFailedRequests(failedRequests: FailedRequestType[]) {
        var divFailedRequests = jQuery("#divFailedRequests");
        if (failedRequests && failedRequests.length) {
            let failedRequestCount = 0;
            let failedRequestsItemsContainer = jQuery(".popup-menu-failed .failed-request-container");
            let failedRequestsItemTemplate = failedRequestsItemsContainer.find(".failed-request-template");
            failedRequestsItemTemplate.hide();

            let domainsStatus: { [index: string]: any } = {};
            failedRequestsItemsContainer.find(".request-box input:checkbox").each((index: number, e: any) => {
                var element = jQuery(e);
                domainsStatus[element.attr("data-domain")] = element.prop("checked");
            });
            failedRequestsItemsContainer.find(".request-box:not(.failed-request-template)").remove();

            failedRequests = failedRequests.sort((a, b) => {
                if (a._domainSortable === null) a._domainSortable = Utils.reverseString(a.domain);
                if (b._domainSortable === null) b._domainSortable = Utils.reverseString(b.domain);
                if (a._domainSortable > b._domainSortable) return 1;
                if (a._domainSortable < b._domainSortable) return -1;
                return 0;
            });

            for (let i = 0; i < failedRequests.length; i++) {
                let request = failedRequests[i];
                if (request.hasRule || request.ignored) continue;

                let newItem = failedRequestsItemTemplate.clone();
                newItem.find(".request-name a").attr("href", request.url);
                newItem.find(".request-name label>span").text(request.domain);
                let newItemCheckbox = newItem.find("input");
                newItemCheckbox.attr("data-domain", request.domain);
                newItemCheckbox.attr("data-ruleId", request.ruleId);

                if (request.isRootHost) {
                    failedRequestCount += request.hitCount;
                    newItemCheckbox.prop("checked", false);
                } else {
                    newItem.find(".failed-request-root").show();
                    newItemCheckbox.prop("checked", true);
                    newItem.addClass("request-box-dependant");
                }
                newItem.find(".failed-request-count").text(request.hitCount).show();

                let previousStatus = domainsStatus[request.domain];
                if (previousStatus != null) newItemCheckbox.prop("checked", previousStatus);
                newItem.removeClass("failed-request-template");
                newItem.show();
                failedRequestsItemsContainer.append(newItem);
            }
            divFailedRequests.find("#lblFailedRequestCount").text(failedRequestCount);
            if (failedRequestCount) divFailedRequests.show();
            else divFailedRequests.hide();
        } else {
            divFailedRequests.hide();
        }
    }

    private static onSmartProfileClick(profile: SmartProfileBase, e: any) {
        if (popup.popupData.notAllowedSetProxySettings && profile.profileType == SmartProfileType.SystemProxy) {
            let message: string;
            if (environment.chrome) message = api.i18n.getMessage("popupNotAllowedSetProxySettingsChrome");
            else message = api.i18n.getMessage("popupNotAllowedSetProxySettingsFirefox");
            messageBox.error(message, 5000);
            return;
        }
        PolyFill.runtimeSendMessage({ command: CommandMessages.PopupChangeActiveProfile, profileId: profile.profileId });
        if (profile.profileType != SmartProfileType.Direct && profile.profileType != SmartProfileType.SystemProxy && !popup.popupData.hasProxyServers) {
            PolyFill.runtimeOpenOptionsPage();
        }
        popup.refreshActiveTabIfNeeded();
        popup.closeSelf();
    }

    private static refreshActiveTabIfNeeded() {
        if (popup.popupData.refreshTabOnConfigChanges) {
            PolyFill.tabsReload(popup.popupData.currentTabId);
        }
    }

    private static onActiveProxyChange() {
        let cmbActiveProxy = jQuery("#divActiveProxy #cmbActiveProxy");
        let id = cmbActiveProxy.val();
        if (!id) return;
        PolyFill.runtimeSendMessage(
            { command: CommandMessages.PopupChangeActiveProxyServer, id },
            (response) => {
                if (response && response.success) {
                    // Refresh popup data to reflect the change immediately
                    popup.refreshPopupData();
                    popup.refreshActiveTabIfNeeded();
                } else {
                    console.warn("[Popup] Failed to change active proxy server");
                }
            }
        );
    }
	
    private static getSelectedFailedRequests(): string[] {
        let domainList: string[] = [];
        jQuery(".failed-request-container .request-box input:checked").each((index: number, e: any) => {
            let element = jQuery(e);
            let domain = element.attr("data-domain");
            if (domain) domainList.push(domain);
        });
        return domainList;
    }

    private static onAddFailedRequestsClick() {
        let domainList = popup.getSelectedFailedRequests();
        if (domainList.length) {
            if (!popup.activeProfile.profileTypeConfig.editable || !ProfileOperations.profileTypeSupportsRules(popup.activeProfile.profileType)) {
                let message = api.i18n.getMessage("popupProfileTypeDoesNotSupportsRules").replace("{0}", popup.activeProfile.profileName);
                messageBox.error(message);
                return;
            }
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupAddDomainListToProxyRule,
                domainList: domainList,
                tabId: popup.popupData.currentTabId
            }, (response: any) => {
                let close = true;
                try {
                    if (!response) return;
                    if (response.failedRequests) popup.populateFailedRequests(response.failedRequests);
                    let result = response.result;
                    if (result) {
                        if (result.success) {
                            popup.refreshActiveTabIfNeeded();
                            if (result.message) {
                                messageBox.success(result.message, 4000);
                                close = false;
                            }
                        } else if (!result.success && result.message) {
                            messageBox.error(result.message);
                            close = false;
                        }
                    }
                } finally {
                    if (close) popup.closeSelf();
                }
            });
        }
    }

    private static onAddIgnoredFailuresClick() {
        let domainList = popup.getSelectedFailedRequests();
        if (domainList.length) {
            if ((!environment.chrome && environment.version < environment.bugFreeVersions.firefoxConfirmInPopupWorks) || confirm(api.i18n.getMessage("popupAddIgnoredFailuresConfirm"))) {
                PolyFill.runtimeSendMessage({
                    command: CommandMessages.PopupAddDomainListToIgnored,
                    domainList: domainList,
                    tabId: popup.popupData.currentTabId
                }, (response: any) => {
                    let close = true;
                    try {
                        if (!response) return;
                        if (response.failedRequests) popup.populateFailedRequests(response.failedRequests);
                        let result = response.result;
                        if (result) {
                            if (result.success && result.message) {
                                messageBox.success(result.message, 4000);
                                close = false;
                            } else if (!result.success && result.message) {
                                messageBox.error(result.message);
                                close = false;
                            }
                        }
                    } finally {
                        if (close) popup.closeSelf();
                    }
                });
            }
        }
    }

    private static refreshPopupData() {
        console.log("[ProxyMust] refreshPopupData вызван");
        PolyFill.runtimeSendMessage(CommandMessages.PopupGetInitialData,
            (dataForPopup: PopupInternalDataType) => {
                if (dataForPopup) {
                    console.log("[ProxyMust] Получены свежие данные попапа, currentSite =", dataForPopup.currentSite, "staleHours =", dataForPopup.staleHours);
                    console.log("[ProxyMust] autoStatus keys:", Object.keys(dataForPopup.autoStatus || {}));
                    console.log("[ProxyMust] autoStatus sample:", dataForPopup.autoStatus ? JSON.stringify(dataForPopup.autoStatus).substring(0, 500) : 'empty');
                    let testSite = popup.lastTestSite;
                    if (!testSite) {
                        const storedSite = sessionStorage.getItem("proxyMust_lastTestSite");
                        if (storedSite) {
                            testSite = storedSite;
                            popup.lastTestSite = testSite;
                            console.log("[ProxyMust] Loaded lastTestSite from sessionStorage:", testSite);
                        }
                    }

                    let effectiveSite = dataForPopup.currentSite;
                    const isCurrentSiteEmpty = !effectiveSite || effectiveSite === "—";

                    if (testSite) {
                        let normalizedTestSite = testSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
                        if (isCurrentSiteEmpty) {
                            effectiveSite = normalizedTestSite;
                            dataForPopup.currentSite = normalizedTestSite;
                            console.log("[ProxyMust] Using test site for display:", normalizedTestSite);
                        } else {
                            console.log("[ProxyMust] Using test site", normalizedTestSite, "for status display (current site is", effectiveSite, ")");
                            const originalDisplaySite = effectiveSite;
                            dataForPopup.currentSite = normalizedTestSite;
                            popup.popupData = dataForPopup;
                            popup.updateActiveProfile(dataForPopup);
                            popup.populateActiveProxy(dataForPopup);
                            dataForPopup.currentSite = originalDisplaySite;
                            popup.updateCurrentSiteDisplay(originalDisplaySite);
                            popup.updateAddAllSuccessfulSubsButtonVisibility();
                            return;
                        }
                    } else if (isCurrentSiteEmpty) {
                        popup.updateCurrentSiteDisplay("—");
                        popup.popupData = dataForPopup;
                        popup.updateActiveProfile(dataForPopup);
                        popup.populateActiveProxy(dataForPopup);
                        popup.updateAddAllSuccessfulSubsButtonVisibility();
                        return;
                    }

                    popup.popupData = dataForPopup;
                    popup.updateActiveProfile(dataForPopup);
                    popup.populateActiveProxy(dataForPopup);
                    popup.updateCurrentSiteDisplay(dataForPopup.currentSite || "—");
                    popup.updateAddAllSuccessfulSubsButtonVisibility();
                } else {
                    console.warn("[ProxyMust] refreshPopupData: данные не получены");
                }
            },
            (error: Error) => {
                console.error("[ProxyMust] Ошибка refreshPopupData:", error);
            });
    }

    private static showRatingDialog(proxyName: string, callback: (delta: number) => void) {
        const title = api.i18n.getMessage("popupRatingDialogTitle") || "Change proxy rating";
        const worksText = api.i18n.getMessage("popupRatingWorksButton") || "Works";
        const failsText = api.i18n.getMessage("popupRatingFailsButton") || "Fails";

        const backdrop = jQuery('<div class="modal-backdrop fade show" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1050; background: rgba(0,0,0,0.2);"></div>').appendTo('body');
        const dialog = jQuery(`
            <div class="modal show" style="display: block; position: fixed; top: 92%; left: 50%; transform: translate(-50%, -50%); z-index: 1060; width: 260px; max-width: 90%;">
                <div class="modal-content" style="border-radius: 8px; text-align: center;">
                    <div class="modal-header" style="padding: 8px 12px; border-bottom: none;">
                        <h5 class="modal-title" style="font-size: 1rem; width: 100%;">${escapeHtml(title)}</h5>
                        <button type="button" class="btn-close" style="font-size: 1rem; position: absolute; right: 8px; top: 8px;" data-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" style="padding: 8px 12px;">
                        <p style="margin: 0; word-break: break-word; font-size: 1rem;">${escapeHtml(proxyName)}</p>
                    </div>
                    <div class="modal-footer" style="padding: 8px 12px; justify-content: center; border-top: none;">
                        <button type="button" class="btn btn-success btn-sm" id="rating-works" style="font-size: 1rem; padding: 4px 12px; margin: 0 4px;">${escapeHtml(worksText)}</button>
                        <button type="button" class="btn btn-danger btn-sm" id="rating-fails" style="font-size: 1rem; padding: 4px 12px; margin: 0 4px;">${escapeHtml(failsText)}</button>
                    </div>
                </div>
            </div>
        `).appendTo('body');

        function closeDialog() {
            backdrop.remove();
            dialog.remove();
        }
        dialog.find('#rating-works').on('click', () => { closeDialog(); callback(1); });
        dialog.find('#rating-fails').on('click', () => { closeDialog(); callback(-1); });
        dialog.find('.btn-close').on('click', () => { closeDialog(); callback(0); });
        backdrop.on('click', () => { closeDialog(); callback(0); });
    }

    private static showAddSubscriptionDialog(proxyId: string) {
        let subscriptionProxy: any = null;
        if (popup.popupData?.proxyServersSubscribed) {
            subscriptionProxy = popup.popupData.proxyServersSubscribed.find(p => p.id === proxyId);
        }
        if (!subscriptionProxy) {
            console.error("Subscription proxy not found:", proxyId);
            return;
        }
        const proxyName = subscriptionProxy.name || `${subscriptionProxy.host}:${subscriptionProxy.port}`;
        let displayAddress = `${subscriptionProxy.protocol}://${subscriptionProxy.host}:${subscriptionProxy.port}`;
        if (subscriptionProxy.username) {
            displayAddress = `${subscriptionProxy.protocol}://${subscriptionProxy.username}:${subscriptionProxy.password}@${subscriptionProxy.host}:${subscriptionProxy.port}`;
        }

        document.documentElement.classList.add("wide-mode");

        const backdrop = jQuery('<div class="modal-backdrop fade show" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 1050; background: rgba(0,0,0,0.2);"></div>').appendTo('body');
        const dialog = jQuery(`
            <div class="modal show" style="display: block; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1060; width: 320px; max-width: 90%;">
                <div class="modal-content" style="border-radius: 8px;">
                    <div class="modal-header" style="padding: 12px; border-bottom: 1px solid #dee2e6;">
                        <h5 class="modal-title" style="font-size: 1rem;">${escapeHtml(api.i18n.getMessage("popupAddSubscriptionTitle"))}</h5>
                        <button type="button" class="btn-close" style="font-size: 0.8rem;" data-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" style="padding: 12px;">
                        <p style="margin: 0 0 8px 0; word-break: break-word; font-size: 0.9rem;">${escapeHtml(displayAddress)}</p>
                        <p style="margin: 0; font-size: 0.8rem; color: #6c757d;">${escapeHtml(api.i18n.getMessage("popupAddSubscriptionConfirm"))}</p>
                    </div>
                    <div class="modal-footer" style="padding: 12px; justify-content: center; border-top: 1px solid #dee2e6;">
                        <button type="button" class="btn btn-success btn-sm" id="add-subscription-yes">${escapeHtml(api.i18n.getMessage("popupAddSubscriptionYes"))}</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="add-subscription-no">${escapeHtml(api.i18n.getMessage("settingsCancelButton"))}</button>
                    </div>
                </div>
            </div>
        `).appendTo('body');

        function closeDialog() {
            document.documentElement.classList.remove("wide-mode");
            backdrop.remove();
            dialog.remove();
        }

        dialog.find('#add-subscription-yes').on('click', () => {
            closeDialog();

            const proxyPayload = {
                id: subscriptionProxy.id,
                name: subscriptionProxy.name || `${subscriptionProxy.host}:${subscriptionProxy.port}`,
                host: subscriptionProxy.host,
                port: subscriptionProxy.port,
                protocol: subscriptionProxy.protocol,
                username: subscriptionProxy.username || "",
                password: subscriptionProxy.password || "",
                countryCode: subscriptionProxy.countryCode || "",
                proxyDNS: subscriptionProxy.proxyDNS || false,
                rating: subscriptionProxy.rating || 0,
                order: subscriptionProxy.order || 0,
                subscriptionName: subscriptionProxy.subscriptionName
            };
            PolyFill.runtimeSendMessage({ command: "AddSubscriptionProxyToManual", proxy: proxyPayload }, (response: any) => {
                console.log("[ProxyMust] Sending AddSubscriptionProxyToManual", proxyPayload);
                if (!response) { messageBox.error(api.i18n.getMessage("popupAddProxyFailed")); return; }
                if (response?.success) {
                    messageBox.success(api.i18n.getMessage("popupAddProxySuccess"));
                    setTimeout(() => {
                        popup.refreshPopupData();
                        setTimeout(() => {
                            popup.refreshPopupData();
                        }, 200);
                    }, 100);
                    return;
                }
                if (response?.alreadyExists) {
                        const confirmMessage = api.i18n.getMessage("popupAddProxyExistsConfirm", response.existingProxyRating);
                        messageBox.confirm(confirmMessage, () => {
                        PolyFill.runtimeSendMessage({ command: CommandMessages.PopupChangeActiveProxyServer, id: response.existingProxyId });
                        popup.showRatingDialog(proxyName, (delta: number) => {
                            if (delta !== 0) {
                                PolyFill.runtimeSendMessage({ command: "UpdateProxyRating", proxyId: response.existingProxyId, delta });
                            }
                            popup.refreshPopupData();
                        });
                    });
                    return;
                }
                messageBox.error(response?.message || api.i18n.getMessage("popupAddProxyFailed"));
            });
        });

        dialog.find('#add-subscription-no').on('click', closeDialog);
        dialog.find('.btn-close').on('click', closeDialog);
        backdrop.on('click', closeDialog);
    }

    private static closeSelf() {
        window.close();
    }

    private static closeSelfWhenRefreshTabNeeded() {
        if (popup.popupData.refreshTabOnConfigChanges) {
            window.close();
        }
    }
}

function escapeHtml(str: string): string {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

popup.initialize();