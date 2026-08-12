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
import { CommonUi } from "./CommonUi";
import { PolyFill } from "../../lib/PolyFill";
import { messageBox, jQuery, bootstrap } from "../../lib/External";
import { environment, api } from "../../lib/environment";
import { Utils } from "../../lib/Utils";
import { ProxyImporter } from "../../lib/ProxyImporter";
import { RuleImporter } from "../../lib/RuleImporter";
import { SettingsConfig, CommandMessages, SettingsPageInternalDataType, PopupInternalDataType, proxyServerProtocols, proxyServerSubscriptionObfuscate, ProxyServer, ProxyRule, ProxyRuleType, ProxyServerSubscription, GeneralOptions, UIOptions, ResultHolder, proxyServerSubscriptionFormat, SpecialRequestApplyProxyMode, specialRequestApplyProxyModeKeys, ProxyRulesSubscription, SmartProfile, SettingsPageSmartProfile, SmartProfileType, getSmartProfileTypeIcon, ProxyRuleSpecialProxyServer, getUserSmartProfileTypeConfig, themesCustomType, ThemeType, getSmartProfileTypeConfig, SubscriptionStats, getSmartProfileTypeName, ProxyRulesImportFromUI, ImportedProxyRule, ExternalRulesFormat, SmartProfileTypeBuiltinIds } from "../../core/definitions";
import { Debug } from "../../lib/Debug";
import { ProfileOperations } from "../../core/ProfileOperations";
import { SettingsOperation } from "../../core/SettingsOperation";
import { CountryCode } from "../../lib/CountryCode";
import { getProxyStatus, ProxyStatusInfo } from "../../core/statusUtils";
import { renderLogMessage, t, resetAntiDuplicate } from "./logRenderer";
import { ProxySelector } from '../../core/ProxySelector';
import { Settings } from "../../core/Settings";
//import { ProxyEngine } from "../../core/ProxyEngine";
//import { AutoStatusService } from '../../core/AutoStatusService';
//import { WebFailedRequestMonitor } from '../../core/WebFailedRequestMonitor';

//import { AutoStatusService } from '../../core/AutoStatusService';
//import { Core } from "../../core/Core";
//import { ProxyCycleTester } from "../../core/ProxyCycleTester";

const jq = jQuery;
export class settingsPage {
	private static localized = false;
	private static settingsLoaded = false;
	private static grdServers: any;
	private static grdServerSubscriptions: any;
	private static currentSettings: SettingsConfig;
	private static pageSmartProfiles: SettingsPageSmartProfile[] = [];
	private static debugDiagnosticsRequested = false;
	private static lastNewRuleType: ProxyRuleType = ProxyRuleType.DomainSubdomain;
	private static isTestingForSite: boolean = false;
	// private static currentTestMode: 'precise' | 'express' = 'precise';

	/** Used to track changes and restore when reject changes selected */
	private static originalSettings: SettingsConfig;

	private static changeTracking = {
		options: false,
		smartProfiles: false,
		newSmartProfile: false,
		servers: false,
		activeProxy: false,
		serverSubscriptions: false,
		rulesSubscriptions: false,
		isDirty: function () {
			return this.options
				|| this.servers
				|| this.activeProxy
				|| this.smartProfiles
				|| this.newSmartProfile
				|| this.rulesSubscriptions
				|| this.serverSubscriptions
		},
		resetStats: function () {
			this.options = false;
			this.servers = false;
			this.activeProxy = false;
			this.smartProfiles = false;
			this.newSmartProfile = false;
			this.rulesSubscriptions = false;
			this.serverSubscriptions = false;
		}
	};

	public static initialize() {
		settingsPage.registerMessageReader();
		CommonUi.onDocumentReady(this.initializeAboutTab);
		CommonUi.onDocumentReady(this.localizeUi);
		CommonUi.onDocumentReady(this.bindEvents);
		CommonUi.onDocumentReady(this.initializeGrids);
		CommonUi.onDocumentReady(this.initializeUi);

		settingsPage.readSettingsPageData();

		// English: Ensure ProxySelector is used to avoid TS6133
		// Russian: Убеждаемся, что ProxySelector используется, чтобы избежать TS6133
		if (typeof ProxySelector !== 'undefined') {
			void ProxySelector; // фиктивное использование
		}
	}

private static handleMessages(message: any, sender: any, sendResponse: Function) {
    let command: string;
    if (typeof message == 'string') command = message;
    else {
        command = message['command'];
    }
    if (command !== CommandMessages.WebFailedRequestNotification) {
        console.log("[Settings] handleMessages received:", message);
    }

    if (command === CommandMessages.SettingsPageGetInitialDataResponse) {
        let dataForSettings: SettingsPageInternalDataType = message.settingsPageInitialData;
        settingsPage.applySettingsPageData(dataForSettings);
    }
    else if (command === CommandMessages.SettingsPageShowMessage) {
        if (message.message) {
            if (message.success == true) {
                messageBox.success(message.message);
            }
            else if (message.success == false) {
                messageBox.error(message.message);
            }
        }
    }
    else if (command === "CHECK_START") {
        settingsPage.isTestingForSite = true;
        const $testBtn = jq("#runTestForAllBtn");
        $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
        $testBtn.removeClass("btn-primary").addClass("btn-danger");
        
        const $progressBar = jq("#progressBar");
        const $progressText = jq("#progressText");
        const $checkProgress = jq("#checkProgress");

        const total = message.total ?? 0;
        const completed = message.completed ?? 0;
        if ($progressBar.length) $progressBar.val(completed).attr("max", total);
        if ($progressText.length) $progressText.text(`${completed}/${total}`);
        if ($checkProgress.length) $checkProgress.show();
    }
    else if (command === "CHECK_PROGRESS") {
        // English: Ensure button shows "Stop" if test is running
        // Russian: Убеждаемся, что кнопка показывает "Stop", если тест запущен
        if (!settingsPage.isTestingForSite) {
            settingsPage.isTestingForSite = true;
            const $testBtn = jq("#runTestForAllBtn");
            $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
            $testBtn.removeClass("btn-primary").addClass("btn-danger");
            jq("#checkProgress").show();
        }
        // English: Update progress bar and proxy status in real-time
        // Russian: Обновляем индикатор прогресса и статус прокси в реальном времени
        const $progressBar = jq("#progressBar");
        const $progressText = jq("#progressText");
        const total = message.total ?? 0;
        const completed = message.completed ?? 0;
        if ($progressBar.length) $progressBar.val(completed).attr("max", total);
        if ($progressText.length) {
            $progressText.text(`${completed}/${total} — ${message.proxyHost}: ${message.alive ? "✓" : "✗"}`);
        }

        const proxyId = message.proxyId;
        const site = message.site || (jq("#testSiteSelect").val() as string);

        if (proxyId && site) {
            // English: Normalize site (remove protocol and trailing slash) for consistent keys
            // Russian: Нормализуем сайт (удаляем протокол и завершающий слэш) для единообразных ключей
            const normalizedSite = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
            
            // English: Determine status from message (use statusType if provided, otherwise derive from alive)
            // Russian: Определяем статус из сообщения (используем statusType, если он есть, иначе выводим из alive)
            let statusValue: 'success' | 'indirect' | 'fail' = message.alive ? "success" : "fail";
            if (message.statusType === "indirect") {
                statusValue = "indirect";
            } else if (message.statusType === "success") {
                statusValue = "success";
            } else if (message.statusType === "fail") {
                statusValue = "fail";
            }
            
            // English: Update autoStatus in currentSettings (local copy for UI)
            // Russian: Обновляем autoStatus в currentSettings (локальная копия для UI)
            if (!settingsPage.currentSettings.autoStatus) settingsPage.currentSettings.autoStatus = {};
            if (!settingsPage.currentSettings.autoStatus[proxyId]) settingsPage.currentSettings.autoStatus[proxyId] = {};
            settingsPage.currentSettings.autoStatus[proxyId][normalizedSite] = {
                status: statusValue,
                timestamp: Date.now()
            };
            console.log(`[CHECK_PROGRESS] updated autoStatus for proxy ${proxyId}, site ${normalizedSite}, status ${statusValue}`);
            console.log(`[CHECK_PROGRESS] currentSettings.autoStatus keys:`, Object.keys(settingsPage.currentSettings.autoStatus || {}));
            // Перерисовываем таблицы правил, чтобы отобразить актуальный прокси для авто-правил
            for (const pageProfile of settingsPage.pageSmartProfiles) {
                if (pageProfile.grdRules && pageProfile.smartProfile) {
                    // Обновляем данные таблицы из текущего состояния профиля
                    const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
                    pageProfile.grdRules.clear();
                    pageProfile.grdRules.rows.add(fixedRules);
                    pageProfile.grdRules.draw('full-hold');
                    // English: Re-apply sorting after data update to reflect new statuses
                    // Russian: Повторно применяем сортировку после обновления данных для отражения новых статусов
                    pageProfile.grdRules.order([ ['proxy', 'asc'] ]).draw();
                    // Перепривязываем обработчики (если нужно)
                    settingsPage.refreshRulesGridAllRows(pageProfile);
                }
            }

            // English: Update only the affected proxy row instead of rebuilding entire table
            // Russian: Обновляем только строку затронутого прокси вместо полной перестройки таблицы
            if (settingsPage.grdServers && proxyId) {
                settingsPage.updateProxyRowById(proxyId);
            }
        }

        // English: Update popup if open
        // Russian: Обновляем попап, если открыт
        PolyFill.runtimeSendMessage({ command: CommandMessages.PopupGetInitialData });
    }
    // English: Test completed successfully
    // Russian: Тест успешно завершён
    else if (command === "CHECK_COMPLETE") {
        settingsPage.resetTestButtonUI();
        const messageText = api.i18n.getMessage("proxyTestCompleted") || `Check completed. Tested ${message.total || 0} proxies.`;
        messageBox.info(messageText);
        PolyFill.runtimeSendMessage({ command: CommandMessages.PopupGetInitialData });
        // English: Always reload the page after any test to reset global lock
        // Russian: Всегда перезагружаем страницу после любого теста, чтобы сбросить глобальную блокировку
        sessionStorage.setItem('proxyMust_switchToProxyServers', 'true');
        jq(window).off("beforeunload");
        settingsPage.changeTracking.resetStats();
        // Обновляем таблицы правил после завершения теста
        for (const pageProfile of settingsPage.pageSmartProfiles) {
            if (pageProfile.grdRules && pageProfile.smartProfile) {
                const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
                pageProfile.grdRules.clear();
                pageProfile.grdRules.rows.add(fixedRules);
                pageProfile.grdRules.draw('full-hold');
                settingsPage.refreshRulesGridAllRows(pageProfile);
            }
        }
        console.log(`[CHECK_COMPLETE] Обновление таблиц, pageSmartProfiles count: ${settingsPage.pageSmartProfiles.length}`);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
    // English: Test cancelled by user
    // Russian: Тест отменён пользователем
    else if (command === "TEST_CANCELLED") {
        settingsPage.resetTestButtonUI();
        const cancelMsg = api.i18n.getMessage("settingsProxyTestCancelled") || "Test stopped by user.";
        messageBox.warning(cancelMsg);
        PolyFill.runtimeSendMessage({ command: CommandMessages.PopupGetInitialData });
        // English: Always reload the page after any test cancellation to reset global lock
        // Russian: Всегда перезагружаем страницу после отмены любого теста, чтобы сбросить глобальную блокировку
        sessionStorage.setItem('proxyMust_switchToProxyServers', 'true');
        jq(window).off("beforeunload");
        settingsPage.changeTracking.resetStats();
        // Обновляем таблицы правил после завершения теста
        for (const pageProfile of settingsPage.pageSmartProfiles) {
            if (pageProfile.grdRules && pageProfile.smartProfile) {
                const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
                pageProfile.grdRules.clear();
                pageProfile.grdRules.rows.add(fixedRules);
                pageProfile.grdRules.draw('full-hold');
                settingsPage.refreshRulesGridAllRows(pageProfile);
            }
        }
        console.log(`[TEST_CANCELLED] Обновление таблиц, pageSmartProfiles count: ${settingsPage.pageSmartProfiles.length}`);
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
    // English: Render log messages in the viewer (always, even if hidden)
    // Russian: Отобразить сообщения лога в просмотрщике (всегда, даже если скрыт)
    else if (command === "PROXY_TEST_STEP") {
        console.log("[Settings] PROXY_TEST_STEP received:", message.data);
        const container = document.getElementById('logContainer');
        if (container) {
            renderLogMessage(container, message.data);
        }
    }
    else if (command === "REFRESH_SETTINGS_PAGE_RELOAD") {
        // English: Reload settings page to reflect changes made in popup
        // Russian: Перезагружаем страницу настроек, чтобы отразить изменения из попапа
        window.location.reload();
    }
    else if (command === "PROXY_PROTOCOL_CHANGED") {
        // English: Update proxy row in the table when protocol changes
        // Russian: Обновляем строку прокси в таблице при изменении протокола
        const proxyId = message.proxyId;
        const newProtocol = message.newProtocol;
        if (proxyId && settingsPage.grdServers) {
            // English: Find and update the proxy in the table data
            // Russian: Находим и обновляем прокси в данных таблицы
            const rows = settingsPage.grdServers.rows();
            const data = rows.data();
            for (let i = 0; i < data.length; i++) {
                if (data[i] && data[i].id === proxyId) {
                    data[i].protocol = newProtocol;
                    settingsPage.grdServers.row(i).data(data[i]).draw(false);
                    console.log(`[Settings] Протокол обновлён в таблице: ${proxyId} -> ${newProtocol}`);
                    break;
                }
            }
            // English: Refresh the grid to show changes
            // Russian: Обновляем отображение таблицы
            settingsPage.grdServers.draw(false);
        }
    }
}

	private static registerMessageReader() {
		api.runtime.onMessage.addListener(settingsPage.handleMessages);
	}

	private static readSettingsPageData() {
		PolyFill.runtimeSendMessage(CommandMessages.SettingsPageGetInitialData,
			(dataForSettings: SettingsPageInternalDataType) => {
				if (!dataForSettings) {
					if (!environment.chrome) {
						messageBox.error(api.i18n.getMessage("settingsInitializeFailed"));
					}
					return;
				}
				settingsPage.applySettingsPageData(dataForSettings);
			},
			(error: Error) => {
				PolyFill.runtimeSendMessage("SettingsPageGetInitialData failed! > " + error);
				messageBox.error(api.i18n.getMessage("settingsInitializeFailed"));
			});
	}

	private static applySettingsPageData(dataForSettings: SettingsPageInternalDataType) {
		if (!dataForSettings) {
			return;
		}
		if (settingsPage.settingsLoaded)
			return;

		settingsPage.settingsLoaded = true;
		settingsPage.localizeUi();

        CommonUi.applyThemes(dataForSettings.settings.options);
        CommonUi.onDocumentReady(() => {
            settingsPage.populateDataForSettings(dataForSettings);
            settingsPage.showNewUserWelcome();
            settingsPage.hideLoadingOverlay();
        });
	}

	private static populateDataForSettings(settingsData: SettingsPageInternalDataType) {
		this.currentSettings = settingsData.settings;
		// English: Sync global Settings.current with local copy
		// Russian: Синхронизируем глобальный Settings.current с локальной копией
		if (Settings && this.currentSettings) {
			Settings.current = this.currentSettings;
		}
		
		// English: load userPrefs directly from local storage...
		// Russian: загружаем userPrefs напрямую из локального хранилища (минуя кэшированное значение фона)
		api.storage.local.get("userPrefs").then((result: any) => {
			if (result && result.userPrefs && typeof result.userPrefs === 'object') {
				if (!this.currentSettings.userPrefs) {
					this.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
				}
				if (typeof result.userPrefs.staleHours === 'number') {
					this.currentSettings.userPrefs.staleHours = result.userPrefs.staleHours;
				}
				if (Array.isArray(result.userPrefs.manualSites)) {
					this.currentSettings.userPrefs.manualSites = result.userPrefs.manualSites;
				}
				jq("#staleHoursInput").val(this.currentSettings.userPrefs.staleHours);
			} else {
				if (!this.currentSettings.userPrefs) {
					this.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
				}
				jq("#staleHoursInput").val(6);
			}
			settingsPage.buildSitesDropdown();
		}).catch((err: any) => {
			console.error("[ProxyMust] Failed to load userPrefs from local storage:", err);
			if (!this.currentSettings.userPrefs) {
				this.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
			}
			jq("#staleHoursInput").val(6);
			settingsPage.buildSitesDropdown();
		});

		api.storage.local.get(["proxyMustSettings", "proxyMust_manualSites"]).then((result: any) => {
			let needSave = false;
			if (result.proxyMustSettings && typeof result.proxyMustSettings.staleHours === 'number') {
				if (this.currentSettings.userPrefs.staleHours !== result.proxyMustSettings.staleHours) {
					this.currentSettings.userPrefs.staleHours = result.proxyMustSettings.staleHours;
					jq("#staleHoursInput").val(result.proxyMustSettings.staleHours);
					needSave = true;
				}
				api.storage.local.remove("proxyMustSettings");
			}
			if (result.proxyMust_manualSites && Array.isArray(result.proxyMust_manualSites)) {
				const existingManual = this.currentSettings.userPrefs.manualSites || [];
				const newSites = result.proxyMust_manualSites.filter((site: string) => !existingManual.includes(site));
				if (newSites.length) {
					this.currentSettings.userPrefs.manualSites = [...existingManual, ...newSites];
					needSave = true;
				}
				api.storage.local.remove("proxyMust_manualSites");
			}
			if (needSave) {
				api.storage.local.set({ userPrefs: this.currentSettings.userPrefs }).catch((err: any) => {
					console.error("[ProxyMust] Failed to save userPrefs after migration:", err);
				});
			}
			settingsPage.buildSitesDropdown();
		}).catch((err: any) => console.error("Failed to migrate old preference keys:", err));
		const staleHours = this.currentSettings.userPrefs.staleHours ?? 6;
		jq("#staleHoursInput").val(staleHours);

		settingsPage.buildSitesDropdown();

		CommonUi.applyThemes(this.currentSettings.options);
		this.populateSettingsUiData(settingsData);
		this.loadServersGrid(this.currentSettings.proxyServers);
		this.loadServerSubscriptionsGrid(this.currentSettings.proxyServerSubscriptions);
		this.loadDefaultProxyServer(this.currentSettings.proxyServers, this.currentSettings.proxyServerSubscriptions);
		this.loadSmartProfiles(this.currentSettings.proxyProfiles);
		this.loadGeneralOptions(this.currentSettings.options);

		// Switch to Servers tab if needed (unchanged)
		const needSwitch = localStorage.getItem("proxyMust_switchToServers");
		if (needSwitch !== null) {
			localStorage.removeItem("proxyMust_switchToServers");
			setTimeout(() => {
				const $serversTab = jq('.nav-link[href="#tab-servers"]');
				if ($serversTab.length) {
					if (typeof bootstrap !== 'undefined' && bootstrap.Tab) {
						const tab = bootstrap.Tab.getOrCreateInstance($serversTab[0]);
						tab.show();
					} else {
						$serversTab.trigger('click');
					}
				}
			}, 20);
		}

		const ratingEnabled = this.currentSettings.options.enableRating;
		jq("#chkEnableRating").prop("checked", ratingEnabled);
		jq("#proxyTestControlBlock").toggle(ratingEnabled);
		if (this.grdServers) {
			this.initProxyTable(ratingEnabled);
			this.loadServersGrid(this.currentSettings.proxyServers);
			this.grdServers.draw('full-hold');
			this.attachPriorityClickHandler();
		}

		this.originalSettings = new SettingsConfig();
		CountryCode.ensureInitialized(() => {
			this.loadServersGrid(this.currentSettings.proxyServers);
			this.loadAllProfilesProxyServers();
			
			// English: Reload rules grids for all profiles after CountryCode is ready to show flags
			// Russian: Перезагружаем таблицы правил для всех профилей после готовности CountryCode для отображения флагов
			for (const pageProfile of this.pageSmartProfiles) {
				if (pageProfile.grdRules && pageProfile.smartProfile) {
					const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
					pageProfile.grdRules.clear();
					pageProfile.grdRules.rows.add(fixedRules);
					pageProfile.grdRules.draw('full-hold');
					this.refreshRulesGridAllRows(pageProfile);
				}
			}
			
			this.initTestControl();
			this.attachPriorityClickHandler();
		});
		this.originalSettings.CopyFrom(this.currentSettings);
		settingsPage.updateExportButtonsState();
		settingsPage.restoreActiveTab();
		        // English: If we need to switch to Proxy Servers tab after reload (set by cycle test completion)
        // Russian: Если нужно переключиться на вкладку Proxy Servers после перезагрузки (установлено при завершении циклического теста)
        if (sessionStorage.getItem('proxyMust_switchToProxyServers') === 'true') {
            // Удаляем флаг, чтобы при следующих загрузках не срабатывало
            sessionStorage.removeItem('proxyMust_switchToProxyServers');
            // Переключаемся на вкладку Proxy Servers
            const targetLink = document.querySelector('.nav-link[href="#tab-servers"]') as HTMLElement;
            if (targetLink) {
                setTimeout(() => {
                    if (typeof bootstrap !== 'undefined' && bootstrap.Tab) {
                        const tab = bootstrap.Tab.getOrCreateInstance(targetLink);
                        tab.show();
                    } else {
                        targetLink.click();
                    }
                }, 50);
            }
        } 
		
		else {
        // English: If we need to switch to Proxy Servers tab after reload (set by cycle test completion)
        // Russian: Если нужно переключиться на вкладку Proxy Servers после перезагрузки (установлено при завершении циклического теста)
        if (sessionStorage.getItem('proxyMust_switchToProxyServers') === 'true') {
            // Удаляем флаг, чтобы при следующих загрузках не срабатывало
            sessionStorage.removeItem('proxyMust_switchToProxyServers');
            // Переключаемся на вкладку Proxy Servers
            const targetLink = document.querySelector('.nav-link[href="#tab-servers"]') as HTMLElement;
            if (targetLink) {
                setTimeout(() => {
                    if (typeof bootstrap !== 'undefined' && bootstrap.Tab) {
                        const tab = bootstrap.Tab.getOrCreateInstance(targetLink);
                        tab.show();
                    } else {
                        targetLink.click();
                    }
                }, 50);
            }
        }
	}
	}
	private static bindEvents() {
		jq("#tabSettingsOffCanvas .nav-link").click(settingsPage.uiEvents.onClickMenuOffCanvas)

		jq("#btnSkipWelcome").click(settingsPage.uiEvents.onClickSkipWelcome);

		jq("#cmbGeneralIncognitoProfile").on('focus', settingsPage.uiEvents.onGeneralIncognitoProfileFocus);

		jq("#btnSaveGeneralOptions").click(settingsPage.uiEvents.onClickSaveGeneralOptions);

		jq("#btnRejectGeneralOptions").click(settingsPage.uiEvents.onClickRejectGeneralOptions);

		jq("#chkSyncSettings").change(settingsPage.uiEvents.onSyncSettingsChanged);

		jq("#chkSyncToBrowser").on("change", settingsPage.uiEvents.onSyncDestinationChanged);
		jq("#chkSyncToWebDAV").on("change", settingsPage.uiEvents.onSyncDestinationChanged);
		jq("#btnWebDavServerBackupNow").click(settingsPage.uiEvents.onClickWebDavBackupNow);
		jq("#btnWebDavServerRestoreNow").click(settingsPage.uiEvents.onClickWebDavRestoreNow);

		jq("#btnIgnoreRequestFailuresForDomains").click(settingsPage.uiEvents.onClickIgnoreRequestFailuresForDomains);

		jq("#btnViewShortcuts").click(settingsPage.uiEvents.onClickViewShortcuts);
		jq("#btnConfigureShortcuts,#btnConfigureShortcutsModal").click(settingsPage.uiEvents.onClickConfigureShortcuts);

		jq("#cmbThemesLight").change(settingsPage.uiEvents.onChangeThemesLight);

		jq("#cmbThemesDark").change(settingsPage.uiEvents.onChangeThemesDark);

		jq(".menu-add-smart-profile").click(settingsPage.uiEvents.onClickAddNewSmartProfile);

		jq("#btnSubmitContinueAddingProfile").click(settingsPage.uiEvents.onClickSubmitContinueAddingProfile);

		jq("#cmbActiveProxyServer").on("change", settingsPage.uiEvents.onChangeActiveProxyServer);

		jq("#btnAddProxyServer").click(settingsPage.uiEvents.onClickAddProxyServer);

		jq("#btnRemoveMultipleProxyServer").click(settingsPage.uiEvents.onClickRemoveMultipleProxyServer);

		jq("#cmdServerProtocol").on("change", settingsPage.uiEvents.onChangeServerProtocol);

		jq("#btnSubmitProxyServer").click(settingsPage.uiEvents.onClickSubmitProxyServer);

		jq("#btnSaveProxyServers").click(settingsPage.uiEvents.onClickSaveProxyServers);

		jq("#btnRejectProxyServers").click(settingsPage.uiEvents.onClickRejectProxyServers);

		jq("#btnClearProxyServers").click(settingsPage.uiEvents.onClickClearProxyServers);

		jq("#btnExportProxyServerOpen,#btnExportProxyServerOpenBackup").click(settingsPage.uiEvents.onClickExportProxyServerOpenBackup);

		jq("#btnImportProxyServer").click(settingsPage.uiEvents.onClickImportProxyServer);

		jq("#btnBackupComplete").click(settingsPage.uiEvents.onClickBackupComplete);

		jq("#btnRestoreBackup").click(settingsPage.uiEvents.onClickRestoreBackup);

		jq("#btnFactoryReset").click(settingsPage.uiEvents.onClickFactoryReset);

		jq("#btnAddServerSubscription").click(settingsPage.uiEvents.onClickAddServerSubscription);

		jq("#btnRemoveMultipleServerSubscription").click(settingsPage.uiEvents.onClickRemoveMultipleServerSubscription);

		jq("#btnSaveServerSubscription").click(settingsPage.uiEvents.onClickSaveServerSubscription);

		jq("#btnTestServerSubscription").click(settingsPage.uiEvents.onClickTestServerSubscription);

		jq("#btnClearServerSubscriptions").click(settingsPage.uiEvents.onClickClearServerSubscriptions);

		jq("#btnSaveServerSubscriptionsChanges").click(settingsPage.uiEvents.onClickSaveServerSubscriptionsChanges);

		jq("#btnRejectServerSubscriptionsChanges").click(settingsPage.uiEvents.onClickRejectServerSubscriptionsChanges);

		jq("#btnEnableDiagnostics").click(settingsPage.uiEvents.onClickEnableDiagnostics);
		
jq("#chkEnableRating").off('change').on('change', function () {
    const enabled = jq(this).prop('checked');
    const generalOptions = settingsPage.readGeneralOptions();
    generalOptions.enableRating = enabled;
    
    settingsPage.currentSettings.options.enableRating = enabled;
    
    PolyFill.runtimeSendMessage(
        {
            command: CommandMessages.SettingsPageSaveOptions,
            options: generalOptions
        },
        (response: ResultHolder) => {
            if (response && response.success) {
                api.storage.local.set({ options: generalOptions })
                    .catch((err: any) => console.error("[ProxyMust] Ошибка сохранения options в local storage:", err));
                
                if (settingsPage.grdServers) {
                    settingsPage.initProxyTable(enabled);
                    settingsPage.loadServersGrid(settingsPage.currentSettings.proxyServers);
                    settingsPage.grdServers.draw('full-hold');
                    settingsPage.attachPriorityClickHandler();
                }
                jq("#proxyTestControlBlock").toggle(enabled);
                jq(this).prop('checked', enabled);
            } else {
                if (response && response.message) messageBox.error(response.message);
                jq(this).prop('checked', !enabled);
            }
        },
        (error: Error) => {
            messageBox.error(api.i18n.getMessage("settingsErrorFailedToSaveGeneral") + " " + error.message);
            jq(this).prop('checked', !enabled);
        }
    );
});

// English: Handle auto-detect protocol checkbox change to show/hide mode selector
// Russian: Обработка изменения чекбокса автоопределения протокола для показа/скрытия селектора режима
jq("#chkAutoDetectProtocol").off("change").on("change", function() {
    const enabled = jq(this).prop("checked");
    settingsPage.toggleProtocolSwitchModeVisibility(enabled);
    settingsPage.changeTracking.options = true;
});

// English: Handle protocol switch mode radio change
// Russian: Обработка изменения радиокнопок режима перебора протоколов
jq('input[name="protocolSwitchMode"]').off("change").on("change", function() {
    settingsPage.changeTracking.options = true;
});

// English: Handle direct IP detection toggle
// Russian: Обработка переключателя определения прямого IP
jq("#chkEnableDirectIpDetection").off('change').on('change', function () {
    const enabled = jq(this).prop('checked');
    console.log(`[ProxyMust] Чекбокс enableDirectIpDetection изменён: ${enabled}`);
    const generalOptions = settingsPage.readGeneralOptions();
    generalOptions.enableDirectIpDetection = enabled;
    
    settingsPage.currentSettings.options.enableDirectIpDetection = enabled;
    
    PolyFill.runtimeSendMessage(
        {
            command: CommandMessages.SettingsPageSaveOptions,
            options: generalOptions
        },
        (response: ResultHolder) => {
            console.log(`[ProxyMust] Ответ на сохранение enableDirectIpDetection:`, response);
            if (response && response.success) {
                api.storage.local.set({ options: generalOptions })
                    .catch((err: any) => console.error("[ProxyMust] Ошибка сохранения options в local storage:", err));
                jq(this).prop('checked', enabled);
                console.log(`[ProxyMust] enableDirectIpDetection успешно сохранён: ${enabled}`);
            } else {
                if (response && response.message) messageBox.error(response.message);
                jq(this).prop('checked', !enabled);
                console.warn(`[ProxyMust] Не удалось сохранить enableDirectIpDetection`);
            }
        },
        (error: Error) => {
            messageBox.error(api.i18n.getMessage("settingsErrorFailedToSaveGeneral") + " " + error.message);
            jq(this).prop('checked', !enabled);
            console.error(`[ProxyMust] Ошибка сохранения enableDirectIpDetection:`, error);
        }
    );
});

        // English: Handle staleHours change and save to userPrefs
        // Russian: Обработка изменения staleHours и сохранение в userPrefs
jq("#staleHoursInput").off("change").on("change", function() {
    let newValue = parseInt(jq(this).val() as string) || 6;
    if (newValue < 1) newValue = 1;
    if (newValue > 168) newValue = 168;
    console.log("[ProxyMust] Изменение staleHours: новое значение = " + newValue);

    if (!settingsPage.currentSettings.userPrefs) {
        settingsPage.currentSettings.userPrefs = { staleHours: newValue, manualSites: [] };
    } else {
        settingsPage.currentSettings.userPrefs.staleHours = newValue;
    }

    if (settingsPage.currentSettings.userPrefs) {
        api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
            console.error("[ProxyMust] Failed to save userPrefs on staleHours change:", err);
        });
    }

    jq("#staleHoursInput").val(newValue);
});
		
		jq(window).on("beforeunload", settingsPage.uiEvents.onWindowUnload);

		jq("#chkEnableProxyTest").on("change", function () {
			const enabled = jq(this).prop("checked");
			settingsPage.toggleProxyTestPanel(enabled);
			settingsPage.changeTracking.options = true;

			if (enabled && !settingsPage.currentSettings?.options?.enableRating) {
				jq("#chkEnableRating").prop("checked", true);
				if (settingsPage.currentSettings?.options) {
					settingsPage.currentSettings.options.enableRating = true;
				}
				settingsPage.changeTracking.options = true;
			}
		});

		jq("#btnRunProxyCheck").on("click", async function () {
			if (!settingsPage.hasTestUrls()) {
				messageBox.error(api.i18n.getMessage("proxyTestNoUrls") || "Please add at least one test website.");
				return;
			}

			const generalOptions = settingsPage.readGeneralOptions();
			generalOptions.enableProxyTest = true;
			generalOptions.testUrls = settingsPage.readTestUrls();

			PolyFill.runtimeSendMessage(
				{
					command: CommandMessages.SettingsPageSaveOptions,
					options: generalOptions
				},
				(response: ResultHolder) => {
					if (response && response.success) {
						settingsPage.currentSettings.options = generalOptions;
						
						jq("#btnRunProxyCheck").prop("disabled", true);
						jq("#checkProgress").show();

						PolyFill.runtimeSendMessage({
							command: "START_PROXY_CHECK",
							testUrls: settingsPage.readTestUrls()
						});
					} else {
						messageBox.error(response?.message || "Failed to save test URLs");
					}
				},
				(error: Error) => {
					messageBox.error("Failed to save test URLs: " + error.message);
				}
			);
		});

        // English: Auto-switch to text mode when user types into the proxy list textarea
        // Russian: Автоматическое переключение на текстовый режим при вводе текста в поле списка прокси
        jq("#btnImportProxyServerListText").on("input", function() {
            const textValue = jq(this).val();
            if (textValue && textValue.toString().trim() !== "") {
                jq("#rbtnImportProxyServer_Text").prop("checked", true);
            }
        });

        // English: Auto-switch to file mode when user selects a file
        // Russian: Автоматическое переключение на файловый режим при выборе файла
        jq("#btnImportProxyServerSelectFile").on("change", function() {
            if (this.files && this.files.length > 0) {
                jq("#rbtnImportProxyServer_File").prop("checked", true);
            }
        });
		
        // English: Auto-switch between text/file modes for import rules modal (delegated, context-aware)
        // Russian: Автоматическое переключение между текстовым и файловым режимом для модального окна импорта правил (делегирование, с учётом контекста)
        jq(document).on("shown.bs.modal", "#modalImportRules", function() {
            console.log("[ImportRules] modal shown");
            const $modal = jq(this);
            const $textArea = $modal.find("#txtImportRulesSelectText");
            const $fileInput = $modal.find("#btnImportRulesSelectFile");
            const $textRadio = $modal.find("#rbtnImportRulesSelect_Text");
            const $fileRadio = $modal.find("#rbtnImportRulesSelect_File");

            // Если элементы не найдены — выходим (для безопасности)
            if (!$textArea.length || !$fileInput.length || !$textRadio.length || !$fileRadio.length) {
                console.warn("[ImportRules] elements not found inside modal");
                return;
            }

            // Привязываем обработчики с отключением предыдущих (чтобы избежать дублирования)
            $textArea.off("input.importRules").on("input.importRules", function() {
                const textValue = jq(this).val();
                console.log("[ImportRules] input event fired, textValue:", textValue);
                if (textValue && textValue.trim() !== "") {
                    console.log("[ImportRules] switching to Text mode");
                    $textRadio.prop("checked", true);
                }
            });

            $fileInput.off("change.importRules").on("change.importRules", function() {
                console.log("[ImportRules] change event fired, files:", this.files);
                if (this.files && this.files.length > 0) {
                    console.log("[ImportRules] switching to File mode");
                    $fileRadio.prop("checked", true);
                }
            });
        });
		
		// English: Open test log window
        // Russian: Открыть окно лога тестирования
        jq("#openTestLogBtn").off("click").on("click", settingsPage.uiEvents.onToggleLogViewer);

        // English: Clear log button
        // Russian: Кнопка очистки лога
		jq("#clearLogBtn").off("click").on("click", function() {
			const container = document.getElementById('logContainer');
			if (container) {
				container.innerHTML = '';
				resetAntiDuplicate();
				const emptyState = document.getElementById('emptyState');
				if (emptyState) {
					container.appendChild(emptyState);
					emptyState.style.display = 'block';
				}
			}
		});
        // English: Close log viewer
        // Russian: Закрыть просмотрщик лога
        jq("#closeLogBtn").off("click").on("click", function() {
            jq("#testLogViewer").slideUp(200);
            jq("#openTestLogBtn").find("span").text(api.i18n.getMessage("settingsProxyMustOpenLog") || "Log");
        });
	}

	private static initializeGrids() {
        // English: Set global DataTables localization
        // Russian: Установка глобальной локализации DataTables
        if (jq.fn.dataTable) {
            jq.fn.dataTable.defaults.language = {
                search: api.i18n.getMessage("datatablesSearch"),
                lengthMenu: api.i18n.getMessage("datatablesShow") + " _MENU_ " + api.i18n.getMessage("datatablesEntries"),
                info: api.i18n.getMessage("datatablesInfo"),
                infoEmpty: api.i18n.getMessage("datatablesInfoEmpty"),
                emptyTable: api.i18n.getMessage("datatablesEmptyTable"),
                paginate: {
                    previous: api.i18n.getMessage("datatablesPrevious"),
                    next: api.i18n.getMessage("datatablesNext")
                }
            };
        }
		let dataTableCustomDom = '<t><"row"<"col-sm-12 col-md-5"<"text-left float-left"f>><"col-sm-12 col-md-7"<"text-right"l>>><"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
        const enableRating = settingsPage.currentSettings?.options?.enableRating ?? true;
        settingsPage.initProxyTable(enableRating);


		settingsPage.grdServerSubscriptions = jq("#grdServerSubscriptions").DataTable({
			"dom": dataTableCustomDom,
			paging: true,
			pageLength: settingsPage.currentSettings?.uiOptions?.serverSubscriptionsGridRows || 10,
			select: { style: "os" },
			scrollY: 460,
			scrollCollapse: true,
			responsive: true,
			lengthMenu: [[10, 25, 50, -1], [10, 25, 50, api.i18n.getMessage("datatablesAll")]],
			ordering: false,
			columns: [
				{
					name: "name", data: "name", title: api.i18n.getMessage("settingsServerSubscriptionsGridColName"),
					responsivePriority: 1
				},
				{
					name: "url", data: "url", title: api.i18n.getMessage("settingsServerSubscriptionsGridColUrl"),
					responsivePriority: 3,
					render: (data, type, row: ProxyServerSubscription) => {
						let render = row.url;
						let stats = row.stats;
						if (stats) {
							let status = SubscriptionStats.ToString(stats);
							if (row.stats.lastStatus) {
								render += ` <div id='btnServerSubscriptionsViewStats' title='${status}' class='cursor-pointer float-end'><i class="fas fa-check-circle text-success"></i></div> `;
							} else {
								render += ` <div id='btnServerSubscriptionsViewStats' title='${status}' class='cursor-pointer float-end'><i class="fas fa-exclamation-triangle text-danger"></i></div> `;
							}
						}
						return render;
					},
				},
				{
					name: "totalCount", data: "totalCount", type: "num", title: api.i18n.getMessage("settingsServerSubscriptionsGridColCount")
				},
				{
					name: "enabled", data: "enabled", title: api.i18n.getMessage("settingsServerSubscriptionsGridColEnabled"),
				},
				{
					"width": "70px",
					"data": null,
					"className": "text-nowrap",
					"defaultContent": `<button class='btn btn-sm btn-success' id='btnSubscriptionsEdit'>${api.i18n.getMessage("settingsEditButton")}</button> <button class='btn btn-sm btn-danger' id='btnSubscriptionsRemove'><i class='fas fa-times'></button>`,
					responsivePriority: 2
				}
			],
			language: {
				search: api.i18n.getMessage("datatablesSearch"),
				lengthMenu: api.i18n.getMessage("datatablesShow") + " _MENU_ " + api.i18n.getMessage("datatablesEntries"),
				info: api.i18n.getMessage("datatablesInfo"),
				paginate: {
					previous: api.i18n.getMessage("datatablesPrevious"),
					next: api.i18n.getMessage("datatablesNext")
				}
			}
		});

		settingsPage.grdServerSubscriptions.on('responsive-display',
			function (e, dataTable, row, showHide, update) {
				let rowChild = row.child();
				if (showHide && rowChild && rowChild.length)
					settingsPage.refreshServerSubscriptionsGridRowElement(rowChild[0]);
			}
		);
		settingsPage.grdServerSubscriptions.on("select deselect", () => {
			settingsPage.uiEvents.onRowSelectionChanged(settingsPage.grdServerSubscriptions, jq("#btnRemoveMultipleServerSubscription"));
		});
		settingsPage.grdServerSubscriptions.on('length.dt', function (e, settings, len) {
			settingsPage.currentSettings.uiOptions.serverSubscriptionsGridRows = len || 10;
			settingsPage.saveUiOptions();
		});
		settingsPage.grdServerSubscriptions.draw();

		if (settingsPage.currentSettings) {
			if (settingsPage.currentSettings.proxyServers)
				settingsPage.loadServersGrid(settingsPage.currentSettings.proxyServers);
			if (settingsPage.currentSettings.proxyServerSubscriptions)
				settingsPage.loadServerSubscriptionsGrid(settingsPage.currentSettings.proxyServerSubscriptions);
		} else {
			settingsPage.loadServersGrid([]);
			settingsPage.loadServerSubscriptionsGrid([]);
		}

		jq(`.nav-link[href='#tab-servers'],
			.nav-link[href='#tab-server-subscriptions']`).on('shown.bs.tab', (e: any) => {
			settingsPage.grdServers.columns.adjust().draw();
			settingsPage.grdServerSubscriptions.columns.adjust().draw();
		});

        // English: Global Delete key handler for proxy table (works even if focus is not on table)
        // Russian: Глобальный обработчик клавиши Delete для таблицы прокси (работает даже если фокус не на таблице)
        jq(document).on("keydown", function(e) {
            if (e.key === "Delete" || e.key === "Del" || e.which === 46) {
                const tagName = (document.activeElement?.tagName || "").toLowerCase();
                if (tagName === "input" || tagName === "textarea" || tagName === "select") {
                    return;
                }
                if (!settingsPage.grdServers) return;
                const selectedRows = settingsPage.grdServers.rows({ selected: true });
                if (!selectedRows || selectedRows.count() === 0) return;
                e.preventDefault();
                e.stopPropagation();
                
                // Используем стандартный браузерный диалог (поддерживает клавиатуру)
                const count = selectedRows.count();
                const confirmMsg = api.i18n.getMessage("settingsConfirmRemoveMultipleProxyServer") || `Delete ${count} proxies?`;
                if (confirm(confirmMsg)) {
                    selectedRows.remove().draw('full-hold');
                    settingsPage.changeTracking.servers = true;
                    settingsPage.loadDefaultProxyServer();
                    settingsPage.enableGridMultipleDelete(jq("#btnRemoveMultipleProxyServer"), false);
                    // Немедленно сохраняем изменения, чтобы удаление сохранилось после перезагрузки
                    settingsPage.saveProxyServersChanges();
                }
            }
        });
	}
    private static initProxyTable(orderingEnabled: boolean): void {
        if (settingsPage.grdServers) {
            settingsPage.grdServers.destroy();
            jq("#grdServers").empty();
            settingsPage.grdServers = null;
        }

        localStorage.removeItem('DataTables_grdServers');

        const dataTableCustomDom = '<t><"row"<"col-sm-12 col-md-5"<"text-left float-left"f>><"col-sm-12 col-md-7"<"text-right"l>>><"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
        settingsPage.initCustomRatingSorting();
        settingsPage.grdServers = jq("#grdServers").DataTable({
            "dom": dataTableCustomDom,
            order: [[6, 'desc']],
            stateSave: false,
            paging: true,
            pageLength: settingsPage.currentSettings?.uiOptions?.proxyServersGridRows || 10,
            select: { style: "os" },
            scrollY: 460,
            scrollCollapse: true,
            responsive: true,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, api.i18n.getMessage("datatablesAll")]],
            ordering: orderingEnabled,
            rowReorder: {
                dataSrc: 'order',
                selector: 'tr>td:first-child>i',
                snapX: true
            },
            columnDefs: [
                { targets: 0, visible: false }
            ],
            columns: [
                {
                    name: "order", data: "order", title: '', defaultContent: `<i class="fas fa-random"></i>`, width: 20, orderable: false
                },
                {
                    name: "name", data: "name", title: api.i18n.getMessage("settingsServersGridColName"),
                    render: (data, type, row: ProxyServer) => `<i class="fas fa-bars fa-xs px-2 cursor-move"></i>  ` + (row.name || ''),
                    orderable: false,
                    responsivePriority: 1
                },
                {
                    name: "country", data: "countryCode", title: api.i18n.getMessage("settingsServersGridColCountry"), orderable: true,
                    render: (data, type, row: ProxyServer) => {
                        let countryCode = row.countryCode;
                        if (!countryCode && row.host) {
                            countryCode = CountryCode.getCountryCode(row.host);
                        }
                        const flag = CountryCode.getCountryFlagEmoji(countryCode?.toUpperCase());
                        const code = countryCode ? countryCode.toUpperCase() : "??";
                        return `<span class="flag-emoji">${flag}</span> ${code}`;
                    }
                },
                {
                    name: "protocol", data: "protocol", title: api.i18n.getMessage("settingsServersGridColProtocol"), orderable: true
                },
                {
                    name: "host", data: "host", title: api.i18n.getMessage("settingsServersGridColServer"), orderable: false
                },
                {
                    name: "port", data: "port", type: "num", title: api.i18n.getMessage("settingsServersGridColPort"), orderable: false
                },
{
    name: "rating", data: "rating", title: api.i18n.getMessage("settingsServersGridColRating"), orderable: true,
    orderDataType: 'rating-priority',
    render: (data, type, row: ProxyServer) => {
        if (!settingsPage.currentSettings?.options?.enableRating) {
            return "";
        }
        
        let priorityIcon = "";
        if (row.priority === "pin") priorityIcon = "📌 ";
        else if (row.priority === "star") priorityIcon = "⭐ ";
        
        const rating = row.rating ?? 0;
        const ratingText = rating === 0 ? "(0)" : (rating > 0 ? `(+${rating})` : `(${rating})`);
        
        const siteSelect = document.getElementById("testSiteSelect") as HTMLSelectElement;
        let site = siteSelect?.value || "";
        if (site) {
            // English: Normalize site to match keys in autoStatus
            // Russian: Нормализуем сайт для соответствия ключам в autoStatus
            site = settingsPage.normalizeHost(site) || site;
        }
        
        const staleHours = settingsPage.currentSettings.userPrefs?.staleHours ?? 6;
        
        let statusInfo: ProxyStatusInfo;
        if (settingsPage.currentSettings?.autoStatus) {
            statusInfo = getProxyStatus(row.id, site, settingsPage.currentSettings.autoStatus, staleHours);
        } else {
            statusInfo = { type: "unknown", symbol: "❓", cssClass: "status-unknown", weight: 3 };
        }
        
        const statusHtml = `<span class="${statusInfo.cssClass}">${statusInfo.symbol}</span>`;
        return `<span class="rating-priority-cell" style="cursor:pointer;">${priorityIcon}${ratingText} ${statusHtml}</span>`;
    }
},          {
                    "width": "70px",
                    "data": null, orderable: false,
                    "className": "text-nowrap",
                    "defaultContent": `<button class='btn btn-sm btn-success' id='btnServersEdit'>${api.i18n.getMessage("settingsEditButton")}</button> <button class='btn btn-sm btn-danger' id='btnServersRemove'><i class='fas fa-times'></button>`,
                    responsivePriority: 2
                }
            ],
            language: {
                search: api.i18n.getMessage("datatablesSearch"),
                lengthMenu: api.i18n.getMessage("datatablesShow") + " _MENU_ " + api.i18n.getMessage("datatablesEntries"),
                info: api.i18n.getMessage("datatablesInfo"),
                paginate: {
                    previous: api.i18n.getMessage("datatablesPrevious"),
                    next: api.i18n.getMessage("datatablesNext")
                }
            }
        });

        const enableRating = settingsPage.currentSettings?.options?.enableRating ?? true;
        settingsPage.grdServers.column(6).visible(enableRating);
        
        if (settingsPage.grdServers.rowReorder) {
            settingsPage.grdServers.rowReorder.enable();
        }
        
        if (!orderingEnabled) {
            settingsPage.grdServers.settings()[0].oFeatures.bSort = false;
            settingsPage.grdServers.order([]).draw();
        }

        settingsPage.attachPriorityClickHandler();
        
        // English: Handle Delete key press on proxy table to delete selected proxies (disabled, moved to global handler)
        // Russian: Обработка нажатия клавиши Delete в таблице прокси (отключено, перенесено в глобальный обработчик)
        /*
        jq("#grdServers").off("keydown").on("keydown", function(e: any) {
            if (e.key === "Delete" || e.key === "Del" || e.which === 46) {
                e.preventDefault();
                const selectedRows = settingsPage.grdServers.rows({ selected: true });
                if (!selectedRows || selectedRows.count() === 0) return;
                settingsPage.uiEvents.onClickRemoveMultipleProxyServer();
            }
        });
        */
        
        jq("#grdServers tbody").off("contextmenu", "tr").on("contextmenu", "tr", function(e) {
            e.preventDefault();
            const row = settingsPage.grdServers.row(this);
            const clickedProxyId = row.data()?.id;
            if (!clickedProxyId) return;

            let selectedIds: string[] = [];
            const selectedRows = settingsPage.grdServers.rows({ selected: true });
            if (selectedRows.count() > 0) {
                selectedIds = selectedRows.data().toArray().map(p => p.id);
            } else {
                selectedIds = [clickedProxyId];
                settingsPage.grdServers.row(this).select();
            }

            settingsPage.showTableContextMenu(e.clientX, e.clientY, selectedIds);
        });
    }
    private static initCustomRatingSorting(): void {
        if (jq.fn.dataTable) {
            jq.fn.dataTable.ext.order['rating-priority'] = function (settings: any, col: number) {
                return this.api().column(col, { order: 'index' }).nodes().map(function (td: HTMLElement, i: number) {
                    const row = settingsPage.grdServers.row(td).data() as ProxyServer;
                    if (!row) return 0;

                    let priorityWeight = 1;
                    if (row.priority === 'pin') priorityWeight = 3;
                    else if (row.priority === 'star') priorityWeight = 2;

                    let statusWeight = 3;
                    const siteSelect = document.getElementById("testSiteSelect") as HTMLSelectElement;
                    const site = siteSelect?.value || "";
                    if (settingsPage.currentSettings?.autoStatus) {
                        const staleHours = settingsPage.currentSettings.userPrefs?.staleHours ?? 6;
                        const statusInfo = getProxyStatus(row.id, site, settingsPage.currentSettings.autoStatus, staleHours);
                        statusWeight = statusInfo.weight;
                    }

                    const rating = row.rating ?? 0;
                    const sortValue = (priorityWeight * 1000) + (statusWeight * 100) + rating;
                    return sortValue;
                });
            };
        }
    }

    private static initCustomRuleProxySorting(pageProfile: SettingsPageSmartProfile): void {
        if (jq.fn.dataTable && pageProfile && pageProfile.grdRules) {
            jq.fn.dataTable.ext.order['rule-proxy-priority'] = function (settings: any, col: number) {
                return this.api().column(col, { order: 'index' }).nodes().map(function (td: HTMLElement, i: number) {
                    const row = pageProfile.grdRules?.row(td).data() as ProxyRule;
                    if (!row) return 0;

                    let proxyId = row.proxyServerId;
                    if (!proxyId && row.proxy) {
                        proxyId = row.proxy.id;
                    }
                    if (!proxyId) return 0;

                    const proxy = SettingsOperation.findProxyServerById(proxyId);
                    if (!proxy) return 0;

                    const site = row.hostName || '';
                    const staleHours = settingsPage.currentSettings?.userPrefs?.staleHours ?? 6;
                    const autoStatus = settingsPage.currentSettings?.autoStatus || {};

                    const weight = ProxySelector.calculateWeight(proxy, site, autoStatus, staleHours);
                    return weight;
                });
            };
        }
    }
	
	private static localizeUi() {
		if (settingsPage.localized)
			return;

		settingsPage.localized = true;
		CommonUi.localizeHtmlPage();
	}

	private static initializeUi() {
		if (environment.chrome) {
			jq("#divAlertChrome").show().removeClass('d-none');
			jq(".firefox-only").hide();
			jq(".chrome-only").show().removeClass('d-none');
			if (environment.manifestV3) {
				jq(".chrome-mv3-only").show().removeClass('d-none');
			}
		} else {
			jq("#divAlertFirefox").show().removeClass('d-none');
			jq(".firefox-only").show().removeClass('d-none');
			jq(".chrome-only").hide();
		}

		let cmbServerSubscriptionProtocol = jq("#cmbServerSubscriptionProtocol");
		let cmbServerSubscriptionObfuscation = jq("#cmbServerSubscriptionObfuscation");

		jq("<option>").attr("value", "")
			.text(api.i18n.getMessage("settingsServerSubscriptionProtocolDefault"))
			.appendTo(cmbServerSubscriptionProtocol);
		proxyServerProtocols.forEach(item => {
			jq("<option>").attr("value", item)
				.text(item)
				.appendTo(cmbServerSubscriptionProtocol);
		});

		proxyServerSubscriptionObfuscate.forEach(item => {
			jq("<option>").attr("value", item)
				.text(item)
				.appendTo(cmbServerSubscriptionObfuscation);
		});

		let cmbServerSubscriptionFormat = jq("#cmbServerSubscriptionFormat");
		proxyServerSubscriptionFormat.forEach((item, index) => {
			jq("<option>").attr("value", index)
				.text(item)
				.appendTo(cmbServerSubscriptionFormat);
		});

		let cmbServerSubscriptionApplyProxy = jq("#cmbServerSubscriptionApplyProxy");
		specialRequestApplyProxyModeKeys.forEach((item, index) => {
			jq("<option>").attr("value", index)
				.text(api.i18n.getMessage("settingsServerSubscriptionApplyProxy_" + item))
				.appendTo(cmbServerSubscriptionApplyProxy);
		});
		if (environment.chrome)
			cmbServerSubscriptionApplyProxy.attr("disabled", "disabled");

		var ww = document.body.clientWidth;
		if (ww < 576) {
			const tabSettingsOffCanvas = bootstrap.Offcanvas.getOrCreateInstance(jq("#tabSettingsOffCanvas"));
			tabSettingsOffCanvas.show();
		}
	}

private static showNewUserWelcome() {
    const settings = settingsPage.currentSettings;
    if (!settings) {
        // English: Settings not loaded yet, retry after 100ms
        // Russian: Настройки ещё не загружены, повторяем через 100 мс
        setTimeout(() => settingsPage.showNewUserWelcome(), 100);
        return;
    }
    if (settings.firstEverInstallNotified === true ||
        (settings.proxyServers != null && settings.proxyServers.length > 0))
        return;
    let modal = jq("#modalWelcome");
    modal.modal("show");
}
    private static hideLoadingOverlay() {
        console.log('[ProxyMust] hideLoadingOverlay called');
        let overlay = jq("#loadingOverlay");
        if (overlay.length) {
            overlay.addClass('d-none');
            overlay.hide();
            console.log('[ProxyMust] Overlay hidden');
        } else {
            console.warn('[ProxyMust] Overlay element not found');
        }
    }

	private static hideMenuOffCanvas() {
		const tabSettingsOffCanvas = bootstrap.Offcanvas.getInstance(jq("#tabSettingsOffCanvas"));
		if (tabSettingsOffCanvas) {
			tabSettingsOffCanvas.hide();
		}
	}

	private static windowScrollToTop(delayed?: boolean) {
		if (delayed) {
			setTimeout(() => {
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}, 300);
		}
		else {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	private static populateSettingsUiData(settingsData: SettingsPageInternalDataType) {
		let currentSettings = settingsData.settings;

		let divNoServersWarning = jq("#divNoServersWarning");
		if (currentSettings.proxyServers.length > 0 ||
			(currentSettings.proxyServerSubscriptions && currentSettings.proxyServerSubscriptions.length > 0)) {

			divNoServersWarning.hide();
		} else {
			divNoServersWarning.show().removeClass('d-none');
		}

		jq("#spanVersion").text("Version: " + currentSettings.version);
		
		// Update footer with version
const version = currentSettings.version;
jq('[data-localize="footerVersionInfo"]').text(t('footerVersionInfo', version));

		// ProxyMust: disable update notifications
		/*
		const updateInfo = currentSettings.updateInfo;
		if (updateInfo && updateInfo.updateIsAvailable) {
			let updateAvailableText = api.i18n
				.getMessage('settingsTabUpdateText')
				.replace('{0}', updateInfo.versionName);

			jq(".menu-update-available").removeClass('d-none')
				.attr("href", updateInfo.downloadPage)
				.find("span")
				.text(updateAvailableText);
		}
		*/
	}

	private static populateProxyServersToComboBox(comboBox: any, selectedProxyId?: string, proxyServers?: ProxyServer[], serverSubscriptions?: ProxyServerSubscription[], dontIncludeAuthServers?: boolean) {
		if (!comboBox) return;
		if (!proxyServers)
			proxyServers = settingsPage.readServers();
		if (!serverSubscriptions)
			serverSubscriptions = settingsPage.readServerSubscriptions();

		let hasSelectedItem = false;

		for (const proxyServer of proxyServers) {
			if (dontIncludeAuthServers && proxyServer.username)
				continue;

			let countryCode = proxyServer.countryCode;
			if (!countryCode && proxyServer.host) {
				countryCode = CountryCode.getCountryCode(proxyServer.host);
			}
			const flagEmoji = CountryCode.getCountryFlagEmoji(countryCode?.toUpperCase());
			let displayName = `${flagEmoji} ${proxyServer.name}`;
			let option = jq("<option>")
				.attr("value", proxyServer.id)
				.text(displayName)
				.appendTo(comboBox);

			let selected = (proxyServer.id === selectedProxyId);
			option.prop("selected", selected);

			if (selected) {
				hasSelectedItem = true;
			}
		}

		if (serverSubscriptions && serverSubscriptions.length > 0) {
			let subscriptionGroup = jq("<optgroup>")
				.attr("label", api.i18n.getMessage("settingsActiveProxyServerSubscriptions"))
				.appendTo(comboBox);

			let added = false;

			for (let subscription of serverSubscriptions) {
				if (!subscription.enabled || !subscription.proxies) continue;

				for (let proxyServer of subscription.proxies) {
					if (dontIncludeAuthServers && proxyServer.username)
						continue;

					let countryCode = proxyServer.countryCode;
					if (!countryCode && proxyServer.host) {
						countryCode = CountryCode.getCountryCode(proxyServer.host);
					}
					const flagEmoji = CountryCode.getCountryFlagEmoji(countryCode?.toUpperCase());
					let displayName = `${flagEmoji} ${proxyServer.name}`;
					let option = jq("<option>")
						.attr("value", proxyServer.id)
						.text(displayName)
						.appendTo(subscriptionGroup);

					let selected = (proxyServer.id === selectedProxyId);
					option.prop("selected", selected);
					if (selected) {
						hasSelectedItem = true;
					}

					added = true;
				}
			}
			if (!added) {
				subscriptionGroup.remove();
			}
		}
		if (!hasSelectedItem && comboBox[0] && comboBox[0].options.length > 0) {
			comboBox[0].selectedIndex = 0;
			comboBox.trigger("change");
		} else if (!hasSelectedItem && comboBox[0]) {
			comboBox.val(null);
		}
	}

	private static populateServerProtocol() {
		let modal = jq("#modalModifyProxyServer");
		let serverInputInfo = settingsPage.readServerModel(modal);
		modal.find("#divServerProxy-AuthenticationMessage").hide();

		if (serverInputInfo.protocol == "SOCKS5")
			modal.find("#chkServerProxyDNS-Control").show().removeClass('d-none');
		else
			modal.find("#chkServerProxyDNS-Control").hide();
		if (serverInputInfo.protocol == "SOCKS4")
			modal.find("#chkServerProxy-Authentication").hide();
		else if (serverInputInfo.protocol == "SOCKS5") {
			if (environment.chrome) {
				modal.find("#chkServerProxy-Authentication").hide();
				modal.find("#divServerProxy-AuthenticationMessage").show();
			}
			else
				modal.find("#chkServerProxy-Authentication").show().removeClass('d-none');
		}
		else {
			modal.find("#chkServerProxy-Authentication").show().removeClass('d-none');
		}
	}

	private static populateServerModal(modalContainer: any, server?: ProxyServer) {
		if (server) {
			modalContainer.find("#txtServerOrder").val(server.order);
			modalContainer.find("#txtServerName").val(server.name);
			modalContainer.find("#txtServerAddress").val(server.host);
			modalContainer.find("#txtServerPort").val(server.port);
			modalContainer.find("#cmdServerProtocol").val(server.protocol);
			modalContainer.find("#chkServerProxyDNS").prop('checked', server.proxyDNS);
			modalContainer.find("#txtServerUsername").val(server.username);
			modalContainer.find("#txtServerPassword").val(server.password);
		} else {
			modalContainer.find("#txtServerOrder").val(0);
			modalContainer.find("#txtServerName").val(this.generateNewServerName());

			modalContainer.find("#txtServerAddress").val("127.0.0.1");
			modalContainer.find("#txtServerPort").val("");
			modalContainer.find("#cmdServerProtocol").val("HTTP");
			modalContainer.find("#chkServerProxyDNS").prop('checked', true);
			modalContainer.find("#txtServerUsername").val("");
			modalContainer.find("#txtServerPassword").val("");
		}
		settingsPage.populateServerProtocol();
	}

	private static readServerModel(modalContainer: any): ProxyServer {
		let proxy = new ProxyServer();

		proxy.order = +modalContainer.find("#txtServerOrder").val().trim();
		proxy.name = modalContainer.find("#txtServerName").val().trim();
		proxy.host = modalContainer.find("#txtServerAddress").val().trim();
		proxy.port = modalContainer.find("#txtServerPort").val();
		proxy.protocol = modalContainer.find("#cmdServerProtocol").val();
		proxy.username = modalContainer.find("#txtServerUsername").val().trim();
		proxy.password = modalContainer.find("#txtServerPassword").val().trim();
		proxy.proxyDNS = modalContainer.find("#chkServerProxyDNS").prop("checked");
		if (proxy.order == 0) {
			let proxyServers = settingsPage.readServers();
			proxy.order = proxyServers.length + 1;
		}

		return proxy;
	}

	private static populateRuleModal(pageProfile: SettingsPageSmartProfile, modalContainer: any, proxyRule?: ProxyRule) {
		let cmdRuleProxyServer = modalContainer.find("#cmdRuleProxyServer");
		cmdRuleProxyServer.empty();
		let cmdRuleAction = modalContainer.find("#cmdRuleAction");

		if (cmdRuleProxyServer.length) {
			jq("<option>")
				.attr("value", ProxyRuleSpecialProxyServer.DefaultGeneral)
				.text(api.i18n.getMessage("settingsRulesProxyDefault"))
				.appendTo(cmdRuleProxyServer);
			jq("<option>")
				.attr("value", ProxyRuleSpecialProxyServer.ProfileProxy)
				.text(api.i18n.getMessage("settingsRulesProxyFromProfile"))
				.appendTo(cmdRuleProxyServer);
		}

		let dontIncludeAuthServers = false;
		if (environment.chrome) {
			dontIncludeAuthServers = true;

			let cmdRuleType = modalContainer.find("#cmdRuleType");
			cmdRuleType.find(`optgroup[label=Url]`)
				.remove();
			cmdRuleType.find(`option[value=${ProxyRuleType.MatchPatternUrl}],option[value=${ProxyRuleType.RegexUrl}],option[value=${ProxyRuleType.Exact}]`)
				.remove();
		}

		if (proxyRule) {
			modalContainer.find("#chkRuleGeneratePattern").prop('checked', proxyRule.autoGeneratePattern);
			modalContainer.find("#cmdRuleType").val(proxyRule.ruleType);

			modalContainer.find("#txtRuleSource").val(proxyRule.hostName);
			modalContainer.find("#txtRuleMatchPattern").val(proxyRule.rulePattern);
			modalContainer.find("#txtRuleUrlRegex").val(proxyRule.ruleRegex);
			modalContainer.find("#txtRuleUrlExact").val(proxyRule.ruleExact);
			modalContainer.find("#chkRuleEnabled").prop('checked', proxyRule.enabled);
			modalContainer.find("#chkRuleProxyPerOrigin").prop('checked', proxyRule.enableProxyPerOrigin || false);
			modalContainer.find("#txtRuleCidrIPAddress").val(proxyRule.ruleSearch);
			modalContainer.find("#txtRuleCidrPrefixLength").val(proxyRule.rulePattern);
			cmdRuleAction.val(proxyRule.whiteList ? "1" : "0");

			// English: If rule is whitelist, hide proxy server selection
			// Russian: Если правило whitelist, скрываем выбор прокси
			if (proxyRule.whiteList) {
				modalContainer.find("#divRuleProxyServer").hide();
				modalContainer.find("#divRuleActionWhitelistDesc").show();
			} else {
				modalContainer.find("#divRuleProxyServer").show();
				modalContainer.find("#divRuleActionWhitelistDesc").hide();
			}

			let proxyServerId = proxyRule.proxyServerId;
			if (proxyRule.proxy)
				proxyServerId = proxyRule.proxy.id;

			if (cmdRuleProxyServer.length) {
				cmdRuleProxyServer.val(proxyServerId);
				settingsPage.populateProxyServersToComboBox(cmdRuleProxyServer, proxyServerId, null, null, dontIncludeAuthServers);
			}
		} else {
			modalContainer.find("#chkRuleGeneratePattern").prop('checked', true);
			modalContainer.find("#cmdRuleType").val(settingsPage.lastNewRuleType);

			modalContainer.find("#txtRuleSource").val("");
			modalContainer.find("#txtRuleMatchPattern").val("");
			modalContainer.find("#txtRuleUrlRegex").val("");
			modalContainer.find("#txtRuleUrlExact").val("");
			modalContainer.find("#chkRuleEnabled").prop('checked', true);
			modalContainer.find("#chkRuleProxyPerOrigin").prop('checked', false);
			modalContainer.find("#txtRuleCidrIPAddress").val("");
			modalContainer.find("#txtRuleCidrPrefixLength").val("");

			if (cmdRuleAction.length) {
				if (pageProfile.smartProfile.profileTypeConfig.defaultRuleActionIsWhitelist == true) {
					cmdRuleAction[0].selectedIndex = 1;
					modalContainer.find("#divRuleActionWhitelistDesc").show();
					// English: Hide proxy server selection for whitelist rules
					// Russian: Скрываем выбор прокси для whitelist-правил
					modalContainer.find("#divRuleProxyServer").hide();
				}
				else {
					cmdRuleAction[0].selectedIndex = 0;
					modalContainer.find("#divRuleActionWhitelistDesc").hide();
					modalContainer.find("#divRuleProxyServer").show();
				}
			}

			if (cmdRuleProxyServer.length)
				settingsPage.populateProxyServersToComboBox(cmdRuleProxyServer, null, null, null, dontIncludeAuthServers);
		}

		settingsPage.updateProxyRuleModal(pageProfile.htmlProfileTab);
	}

	private static updateProxyRuleModal(tabContainer: any) {
		let autoPattern = tabContainer.find("#chkRuleGeneratePattern").prop('checked');
		if (autoPattern) {
			tabContainer.find("#txtRuleMatchPattern").attr('disabled', 'disabled');
		}
		else {
			tabContainer.find("#txtRuleMatchPattern").removeAttr('disabled');
		}

		let ruleType = tabContainer.find("#cmdRuleType").val();
		settingsPage.lastNewRuleType = parseInt(ruleType) || ProxyRuleType.DomainSubdomain;

		tabContainer.find("#divRuleCidrNotation").hide();
		tabContainer.find("#divRuleMatchPattern").hide();
		tabContainer.find("#divRuleGeneratePattern").hide();
		tabContainer.find("#divRuleUrlRegex").hide();
		tabContainer.find("#divRuleUrlExact").hide();

		if (ruleType == ProxyRuleType.MatchPatternHost ||
			ruleType == ProxyRuleType.MatchPatternUrl) {
			tabContainer.find("#divRuleMatchPattern").show();
			tabContainer.find("#divRuleGeneratePattern").show();
		}
		else if (ruleType == ProxyRuleType.RegexHost) {
			tabContainer.find("#divRuleUrlRegex")
				.show()
				.find('label').text(api.i18n.getMessage("settingsRulesHostRegex"));
		}
		else if (ruleType == ProxyRuleType.RegexUrl) {
			tabContainer.find("#divRuleUrlRegex")
				.show()
				.find('label').text(api.i18n.getMessage("settingsRulesRegex"));
		}
		else if (ruleType == ProxyRuleType.DomainSubdomain ||
			ruleType == ProxyRuleType.DomainExact ||
			ruleType == ProxyRuleType.DomainAndPath ||
			ruleType == ProxyRuleType.DomainSubdomainAndPath ||
			ruleType == ProxyRuleType.SearchUrl) {
		}
		else if (ruleType == ProxyRuleType.IpCidrNotation) {
			tabContainer.find("#divRuleCidrNotation").show();
		}
		else {
			tabContainer.find("#divRuleUrlExact").show();
		}
		let whiteList = parseInt(tabContainer.find("#cmdRuleAction").val()) != 0
		if (whiteList) {
			tabContainer.find("#divRuleActionWhitelistDesc").show();
			// English: Hide proxy server selection for whitelist rules
			// Russian: Скрываем выбор прокси для whitelist-правил
			tabContainer.find("#divRuleProxyServer").hide();
		}
		else {
			tabContainer.find("#divRuleActionWhitelistDesc").hide();
			tabContainer.find("#divRuleProxyServer").show();
		}
	}

	private static readProxyRuleModel(modalContainer: any): ProxyRule {
		let selectedProxyId = modalContainer.find("#cmdRuleProxyServer").val();
		let selectedProxy = null;

		if (selectedProxyId)
			selectedProxy = settingsPage.findProxyServerById(selectedProxyId);

		let ruleInfo = new ProxyRule();
		ruleInfo.autoGeneratePattern = modalContainer.find("#chkRuleGeneratePattern").prop('checked');
		ruleInfo.ruleType = parseInt(modalContainer.find("#cmdRuleType").val());
		ruleInfo.hostName = modalContainer.find("#txtRuleSource").val();
		ruleInfo.rulePattern = modalContainer.find("#txtRuleMatchPattern").val();
		ruleInfo.ruleRegex = modalContainer.find("#txtRuleUrlRegex").val();
		ruleInfo.ruleExact = modalContainer.find("#txtRuleUrlExact").val();
		ruleInfo.proxy = selectedProxy;
		ruleInfo.proxyServerId = selectedProxyId;
		ruleInfo.enabled = modalContainer.find("#chkRuleEnabled").prop("checked");
		ruleInfo.enableProxyPerOrigin = modalContainer.find("#chkRuleProxyPerOrigin").prop("checked");
		ruleInfo.whiteList = parseInt(modalContainer.find("#cmdRuleAction").val()) != 0;
		if (ruleInfo.ruleType == ProxyRuleType.IpCidrNotation) {
			ruleInfo.ruleSearch = modalContainer.find("#txtRuleCidrIPAddress").val().trim();
			ruleInfo.rulePattern = modalContainer.find("#txtRuleCidrPrefixLength").val();
		}

		let isEditing: boolean = modalContainer.data("editing") != null;
		if (!isEditing) {
			settingsPage.lastNewRuleType = ruleInfo.ruleType;
		}
		// English: For whitelist rules, proxyServerId must be null
		// Russian: Для правил-исключений proxyServerId должен быть null
		if (ruleInfo.whiteList) {
			ruleInfo.proxyServerId = null;
			ruleInfo.proxy = null;
		}
		return ruleInfo;
	}

	private static populateServerSubscriptionsModal(modalContainer: any, subscription?: ProxyServerSubscription) {
		if (subscription) {
			modalContainer.find("#txtName").val(subscription.name);
			modalContainer.find("#txtUrl").val(subscription.url);
			modalContainer.find("#numRefreshRate").val(subscription.refreshRate);
			modalContainer.find("#chkServerSubscriptionEnabled").prop('checked', subscription.enabled);
			modalContainer.find("#cmbServerSubscriptionProtocol").val(subscription.proxyProtocol);
			modalContainer.find("#cmbServerSubscriptionObfuscation").val(subscription.obfuscation);
			modalContainer.find("#cmbServerSubscriptionFormat").val(subscription.format);
			modalContainer.find("#cmbServerSubscriptionApplyProxy").val(subscription.applyProxy ?? SpecialRequestApplyProxyMode.CurrentProxy);
			modalContainer.find("#cmbServerSubscriptionUsername").val(subscription.username);
			if (subscription.password != null)
				modalContainer.find("#cmbServerSubscriptionPassword").val(atob(subscription.password));
			else
				modalContainer.find("#cmbServerSubscriptionPassword").val("");
		} else {
			modalContainer.find("#txtName").val(settingsPage.generateNewSubscriptionName());
			modalContainer.find("#txtUrl").val("");
			modalContainer.find("#numRefreshRate").val(0);
			modalContainer.find("#chkServerSubscriptionEnabled").prop('checked', true);
			modalContainer.find("#cmbServerSubscriptionProtocol")[0].selectedIndex = 0;
			modalContainer.find("#cmbServerSubscriptionObfuscation")[0].selectedIndex = 0;
			modalContainer.find("#cmbServerSubscriptionFormat")[0].selectedIndex = 0;
			modalContainer.find("#cmbServerSubscriptionApplyProxy")[0].selectedIndex = 0;
			modalContainer.find("#cmbServerSubscriptionUsername").val("");
			modalContainer.find("#cmbServerSubscriptionPassword").val("");
		}
	}

	private static readServerSubscriptionModel(modalContainer: any): ProxyServerSubscription {
		let subscription = new ProxyServerSubscription();

		subscription.name = modalContainer.find("#txtName").val();
		subscription.url = modalContainer.find("#txtUrl").val();
		subscription.enabled = modalContainer.find("#chkServerSubscriptionEnabled").prop('checked');
		subscription.proxyProtocol = modalContainer.find("#cmbServerSubscriptionProtocol").val();
		subscription.refreshRate = +(modalContainer.find("#numRefreshRate").val() || 0);
		subscription.obfuscation = modalContainer.find("#cmbServerSubscriptionObfuscation").val();
		subscription.format = +modalContainer.find("#cmbServerSubscriptionFormat").val();
		subscription.applyProxy = +modalContainer.find("#cmbServerSubscriptionApplyProxy").val();
		subscription.username = modalContainer.find("#cmbServerSubscriptionUsername").val();
		subscription.password = btoa(modalContainer.find("#cmbServerSubscriptionPassword").val());
		subscription.totalCount = 0;

		return subscription;
	}

	private static populateRulesSubscriptionsModal(pageProfile: SettingsPageSmartProfile, modalContainer: any, subscription?: ProxyRulesSubscription) {
		if (subscription) {
			modalContainer.find("#txtName").val(subscription.name);
			modalContainer.find("#txtUrl").val(subscription.url);
			modalContainer.find("#numRefreshRate").val(subscription.refreshRate);
			modalContainer.find("#chkRulesSubscriptionEnabled").prop('checked', subscription.enabled);
			modalContainer.find("#cmbRulesSubscriptionObfuscation").val(subscription.obfuscation);
			modalContainer.find("#cmbRulesSubscriptionFormat").val(subscription.format);
			modalContainer.find("#cmbRulesSubscriptionApplyProxy").val(subscription.applyProxy ?? SpecialRequestApplyProxyMode.CurrentProxy);
			modalContainer.find("#cmbRulesSubscriptionUsername").val(subscription.username);
			if (subscription.password != null)
				modalContainer.find("#cmbRulesSubscriptionPassword").val(atob(subscription.password));
			else
				modalContainer.find("#cmbRulesSubscriptionPassword").val("");
		} else {
			modalContainer.find("#txtName").val(settingsPage.generateNewRulesSubscriptionName(pageProfile));
			modalContainer.find("#txtUrl").val("");
			modalContainer.find("#numRefreshRate").val(0);
			modalContainer.find("#chkRulesSubscriptionEnabled").prop('checked', true);
			modalContainer.find("#cmbRulesSubscriptionObfuscation")[0].selectedIndex = -1;
			modalContainer.find("#cmbRulesSubscriptionFormat")[0].selectedIndex = -1;
			modalContainer.find("#cmbRulesSubscriptionApplyProxy")[0].selectedIndex = 0;
			modalContainer.find("#cmbRulesSubscriptionUsername").val("");
			modalContainer.find("#cmbRulesSubscriptionPassword").val("");
		}
	}

	private static readRulesSubscriptionModel(modalContainer: any): ProxyRulesSubscription {
		let subscription = new ProxyRulesSubscription();

		subscription.name = modalContainer.find("#txtName").val();
		subscription.url = modalContainer.find("#txtUrl").val();
		subscription.enabled = modalContainer.find("#chkRulesSubscriptionEnabled").prop('checked');
		subscription.refreshRate = +(modalContainer.find("#numRefreshRate").val() || 0);
		subscription.obfuscation = modalContainer.find("#cmbRulesSubscriptionObfuscation").val();
		subscription.format = +modalContainer.find("#cmbRulesSubscriptionFormat").val();
		subscription.applyProxy = +modalContainer.find("#cmbRulesSubscriptionApplyProxy").val();
		subscription.username = modalContainer.find("#cmbRulesSubscriptionUsername").val();
		subscription.password = btoa(modalContainer.find("#cmbRulesSubscriptionPassword").val());
		subscription.totalCount = 0;
		return subscription;
	}

	private static enableGridMultipleDelete(button: any, enable: boolean) {
		if (enable)
			jq(button).removeAttr("disabled");
		else
			jq(button).attr("disabled", true);
	}

	private static saveUiOptions() {
		if (!settingsPage.currentSettings.uiOptions) {
			settingsPage.currentSettings.uiOptions = new UIOptions();
		}

		PolyFill.runtimeSendMessage(
			{
				command: CommandMessages.SettingsPageSaveUiOption,
				uiOptions: settingsPage.currentSettings.uiOptions
			},
			(response: ResultHolder) => {
				if (!response) return;
				if (response.success) {
				} else {
					if (response.message)
						messageBox.error(response.message);
				}
			},
			(error: Error) => {
				console.error("Failed to save UI options:", error.message);
			});
	}

	private static initializeAboutTab() {
		let placeHolder = jq("#settingAboutPlaceHolder");
		if (placeHolder.data('loaded'))
			return;

		function fetchSettingAbout(useFallback: boolean = false, languageCode?: string) {
			let path = `${languageCode || api.i18n.getMessage('languageCode')}/settings-about.html`;
			let url = PolyFill.extensionGetURL(`_locales/${path}`);

			fetch(url)
				.then((response) => response.text())
				.then((htmlText) => {
					loadSettingAbout(htmlText);
				})
				.catch((error) => {
					if (useFallback) {
						fetchSettingAbout(false, 'en');
					}
					else {
						loadSettingAbout('Failed to load about...!');
					}
					Debug.warn('Failed to load ' + path, error);
				});
		}

		function loadSettingAbout(htmlText) {
			placeHolder.html(htmlText);
			placeHolder.data('loaded', true);

		// ProxyMust: определяем ссылку на магазин в зависимости от браузера
		var storeName = "";
		var storeUrl = "";
		if (environment.name === "Firefox") {
			storeName = "Firefox Add-ons";
			storeUrl = "https://addons.mozilla.org/ru/firefox/addon/proxymust/";
		} else if (environment.name === "Chrome") {
			storeName = "Chrome Web Store";
			// пока ссылка на репозиторий, позже заменим на реальную после публикации в Chrome
			storeUrl = "https://github.com/nana-xakep/ProxyMust";
			// когда получите ID в Chrome, используйте:
			// storeUrl = "https://chrome.google.com/webstore/detail/proxymust/ВАШ_ИДЕНТИФИКАТОР";
		} else {
			storeName = "Extensions";
			storeUrl = "https://github.com/nana-xakep/ProxyMust";
		}
		jq("#linkAddonsMarket")
			.text(storeName)
			.attr("href", storeUrl);
		}

		fetchSettingAbout(true);
	}

	private static loadGeneralOptions(options: GeneralOptions) {
		if (!options)
			return;
		let divGeneral = jq("#tab-general");

		divGeneral.find("#chkProxyPerOrigin").prop("checked", options.proxyPerOrigin || false);
		if (options.activeIncognitoProfileId) {
			this.populateIncognitoProfileDropDown(options.activeIncognitoProfileId);
		}
		divGeneral.find("#cmbGeneralIncognitoProfile").val(options.activeIncognitoProfileId || '');

		divGeneral.find("#chkSyncSettings").prop("checked", options.syncSettings || false);
		divGeneral.find("#chkSyncProxyMode").prop("checked", options.syncActiveProfile || false);
		divGeneral.find("#chkSyncActiveProxy").prop("checked", options.syncActiveProxy || false);

		if (options.syncWebDavServerEnabled) {
			divGeneral.find("#chkSyncToWebDAV").prop("checked", true);
		} else {
			divGeneral.find("#chkSyncToBrowser").prop("checked", true);
		}

		divGeneral.find("#txtWebDavServerUrl").val(options.syncWebDavServerUrl || '');
		divGeneral.find("#txtWebDavBackupFilename").val(options.syncWebDavBackupFilename || 'proxymust_settings.json');
		divGeneral.find("#txtWebDavServerUser").val(options.syncWebDavServerUser || '');
		divGeneral.find("#txtWebDavServerPassword").val(options.syncWebDavServerPassword || '');

		divGeneral.find("#chkDetectRequestFailures").prop("checked", options.detectRequestFailures || false);
		divGeneral.find("#chkDisplayFailedOnBadge").prop("checked", options.displayFailedOnBadge || false);

		divGeneral.find("#chkEnableShortcuts").prop("checked", options.enableShortcuts || false);
		divGeneral.find("#chkEnableRating").prop("checked", options.enableRating);
        console.log(`[ProxyMust] loadGeneralOptions: enableRating = ${options.enableRating}`);
		        const directIpEnabled = options.enableDirectIpDetection === true;
		divGeneral.find("#chkEnableDirectIpDetection").prop("checked", directIpEnabled);
		console.log(`[ProxyMust] loadGeneralOptions: enableDirectIpDetection = ${directIpEnabled}`);

		// English: Protocol auto-detection settings
		// Russian: Настройки автоопределения протокола
		const autoDetectEnabled = options.autoDetectProtocol !== false;
		divGeneral.find("#chkAutoDetectProtocol").prop("checked", autoDetectEnabled);

		const switchMode = options.protocolSwitchMode || 'probable';
		if (switchMode === 'full') {
			divGeneral.find("#rbtnProtocolFull").prop("checked", true);
		} else {
			divGeneral.find("#rbtnProtocolProbable").prop("checked", true);
		}

		// English: Show/hide mode selector based on auto-detect checkbox
		// Russian: Показываем/скрываем переключатель режима в зависимости от чекбокса автоопределения
		settingsPage.toggleProtocolSwitchModeVisibility(autoDetectEnabled);

		jq("#proxyTestControlBlock").toggle(options.enableRating === true);
		divGeneral.find("#chkShortcutNotification").prop("checked", options.shortcutNotification || false);
		divGeneral.find("#chkDisplayAppliedProxyOnBadge").prop("checked", options.displayAppliedProxyOnBadge || false);
		divGeneral.find("#chkDisplayMatchedRuleOnBadge").prop("checked", options.displayMatchedRuleOnBadge || false);
		divGeneral.find("#chkRefreshTabOnConfigChanges").prop("checked", options.refreshTabOnConfigChanges || false);

		divGeneral.find("#rbtnThemesAutoSwitchBySystem").prop("checked", options.themeType == ThemeType.Auto);
		divGeneral.find("#rbtnThemesLight").prop("checked", options.themeType == ThemeType.Light);
		divGeneral.find("#rbtnThemesDark").prop("checked", options.themeType == ThemeType.Dark);
		divGeneral.find("#cmbThemesLight").val(options.themesLight);
		divGeneral.find("#txtThemesLightCustomUrl").val(options.themesLightCustomUrl);
		divGeneral.find("#cmbThemesDark").val(options.themesDark);
		divGeneral.find("#txtThemesDarkCustomUrl").val(options.themesDarkCustomUrl);

		settingsPage.uiEvents.onSyncSettingsChanged();
		settingsPage.uiEvents.onSyncDestinationChanged();
		settingsPage.uiEvents.onChangeThemesLight();
		settingsPage.uiEvents.onChangeThemesDark();

		if (environment.chrome) {
			divGeneral.find("#chkProxyPerOrigin").attr("disabled", "disabled")
				.parents("label").attr("disabled", "disabled");
			divGeneral.find("#cmbGeneralIncognitoProfile").attr("disabled", "disabled")
				.parents("label").attr("disabled", "disabled");
		}
		const enableTest = options.enableProxyTest ?? false;
		jq("#chkEnableProxyTest").prop("checked", enableTest);
		settingsPage.toggleProxyTestPanel(enableTest);
		settingsPage.renderTestUrlFields(options.testUrls || []);
	}

	private static toggleProxyTestPanel(enabled: boolean): void {
		jq("#testUrlsContainer").toggle(enabled);
	}

	private static renderTestUrlFields(urls: string[] = []): void {
		const container = jq("#testUrlsList");
		container.empty();

		for (let i = 0; i < 5; i++) {
			const value = urls[i] || "";

			const $row = jq('<div class="test-url-row" style="margin-bottom: 10px;"></div>');
			const $input = jq('<input type="text" class="test-url-input form-control" placeholder="youtube.com">')
				.attr('data-index', i)
				.val(value);

			$row.append($input);
			container.append($row);
		}
	}

	private static readTestUrls(): string[] {
		const urls: string[] = [];
		jq(".test-url-input").each(function (this: HTMLInputElement) {
			urls.push(this.value?.trim() || "");
		});
		return urls;
	}

	private static hasTestUrls(): boolean {
		return jq(".test-url-input").toArray().some((input: HTMLElement) => 
			(input as HTMLInputElement).value?.trim() !== ""
		);
	}

    private static readGeneralOptions(generalOptions?: GeneralOptions): GeneralOptions {
        // English: Start with a copy of current settings or a new instance
        // Russian: Начинаем с копии текущих настроек или нового экземпляра
        if (!generalOptions) {
            generalOptions = new GeneralOptions();
            // Copy from current options if available
            if (settingsPage.currentSettings?.options) {
                generalOptions.CopyFrom(settingsPage.currentSettings.options);
            }
        }

        const divGeneral = jq("#tab-general");

        // English: Read all values from DOM with fallback to current values if element not found
        // Russian: Читаем все значения из DOM с запасным вариантом, если элемент не найден
        const getChecked = (selector: string, fallback: boolean): boolean => {
            const el = divGeneral.find(selector);
            if (el.length) {
                return el.prop("checked") === true;
            }
            return fallback;
        };

        const getVal = (selector: string, fallback: any): any => {
            const el = divGeneral.find(selector);
            if (el.length) {
                return el.val();
            }
            return fallback;
        };

        generalOptions.proxyPerOrigin = getChecked("#chkProxyPerOrigin", generalOptions.proxyPerOrigin);
        generalOptions.activeIncognitoProfileId = getVal("#cmbGeneralIncognitoProfile", generalOptions.activeIncognitoProfileId);

        generalOptions.syncSettings = getChecked("#chkSyncSettings", generalOptions.syncSettings);
        generalOptions.syncActiveProfile = getChecked("#chkSyncProxyMode", generalOptions.syncActiveProfile);
        generalOptions.syncActiveProxy = getChecked("#chkSyncActiveProxy", generalOptions.syncActiveProxy);

        generalOptions.syncWebDavServerEnabled = getChecked("#chkSyncToWebDAV", generalOptions.syncWebDavServerEnabled);
        generalOptions.syncWebDavServerUrl = getVal("#txtWebDavServerUrl", generalOptions.syncWebDavServerUrl);
        generalOptions.syncWebDavBackupFilename = getVal("#txtWebDavBackupFilename", generalOptions.syncWebDavBackupFilename);
        generalOptions.syncWebDavServerUser = getVal("#txtWebDavServerUser", generalOptions.syncWebDavServerUser);
        generalOptions.syncWebDavServerPassword = getVal("#txtWebDavServerPassword", generalOptions.syncWebDavServerPassword);

        generalOptions.detectRequestFailures = getChecked("#chkDetectRequestFailures", generalOptions.detectRequestFailures);
        generalOptions.displayFailedOnBadge = getChecked("#chkDisplayFailedOnBadge", generalOptions.displayFailedOnBadge);

        generalOptions.enableShortcuts = getChecked("#chkEnableShortcuts", generalOptions.enableShortcuts);
        generalOptions.enableRating = getChecked("#chkEnableRating", generalOptions.enableRating);
		generalOptions.enableDirectIpDetection = getChecked("#chkEnableDirectIpDetection", generalOptions.enableDirectIpDetection);

		// English: Protocol auto-detection settings
		// Russian: Настройки автоопределения протокола
		generalOptions.autoDetectProtocol = getChecked("#chkAutoDetectProtocol", generalOptions.autoDetectProtocol);

		const switchModeRadio = divGeneral.find('input[name="protocolSwitchMode"]:checked');
		if (switchModeRadio.length) {
			generalOptions.protocolSwitchMode = switchModeRadio.val() as 'probable' | 'full';
		} else {
			generalOptions.protocolSwitchMode = 'probable';
		}

		generalOptions.shortcutNotification = getChecked("#chkShortcutNotification", generalOptions.shortcutNotification);
        generalOptions.displayAppliedProxyOnBadge = getChecked("#chkDisplayAppliedProxyOnBadge", generalOptions.displayAppliedProxyOnBadge);
        generalOptions.displayMatchedRuleOnBadge = getChecked("#chkDisplayMatchedRuleOnBadge", generalOptions.displayMatchedRuleOnBadge);
        generalOptions.refreshTabOnConfigChanges = getChecked("#chkRefreshTabOnConfigChanges", generalOptions.refreshTabOnConfigChanges);

        // Theme
        if (divGeneral.find("#rbtnThemesLight").prop("checked")) {
            generalOptions.themeType = ThemeType.Light;
        } else if (divGeneral.find("#rbtnThemesDark").prop("checked")) {
            generalOptions.themeType = ThemeType.Dark;
        } else {
            generalOptions.themeType = ThemeType.Auto;
        }
        generalOptions.themesLight = getVal("#cmbThemesLight", generalOptions.themesLight);
        generalOptions.themesLightCustomUrl = getVal("#txtThemesLightCustomUrl", generalOptions.themesLightCustomUrl);
        generalOptions.themesDark = getVal("#cmbThemesDark", generalOptions.themesDark);
        generalOptions.themesDarkCustomUrl = getVal("#txtThemesDarkCustomUrl", generalOptions.themesDarkCustomUrl);

        console.log(`[ProxyMust] readGeneralOptions: enableRating = ${generalOptions.enableRating}, enableDirectIpDetection = ${generalOptions.enableDirectIpDetection}`);

        return generalOptions;
    }

	private static populateIncognitoProfileDropDown(selectedId?: string) {
		const cmbGeneralIncognitoProfile = jq("#cmbGeneralIncognitoProfile");
		const selectedValue = selectedId || cmbGeneralIncognitoProfile.val();
		cmbGeneralIncognitoProfile.empty();

		jq("<option>").attr("value", "")
			.text(api.i18n.getMessage("settingsGeneralIncognitoProfileDisabled"))
			.appendTo(cmbGeneralIncognitoProfile);

		for (const pgProfile of settingsPage.pageSmartProfiles) {
			const smartProfile = pgProfile.smartProfile;

			jq("<option>").attr("value", smartProfile.profileId)
				.text(smartProfile.profileName)
				.appendTo(cmbGeneralIncognitoProfile);
		}
		cmbGeneralIncognitoProfile.val(selectedValue);
	}

private static loadServersGrid(servers: any[]) {
		   //    console.log("[DEBUG] loadServersGrid вызван, получено серверов:", servers.length);
		   if (!this.grdServers) {
		   //        console.log("[DEBUG] grdServers равен null, выход");
        return;
    }

    for (const proxy of servers) {
        if (!proxy.countryCode && proxy.host) {
            proxy.countryCode = CountryCode.getCountryCode(proxy.host);
        }
    }

    this.grdServers.clear();
    this.grdServers.rows.add(servers).draw('full-hold');

    const savedPageLength = settingsPage.currentSettings?.uiOptions?.proxyServersGridRows;
    if (savedPageLength && savedPageLength !== this.grdServers.page.len()) {
        this.grdServers.page.len(savedPageLength).draw();
    }

    this.refreshServersGridAllRows();

    if (this.currentSettings?.options) {
        const enableRating = this.currentSettings.options.enableRating !== false;
        this.grdServers.column(6).visible(enableRating);
    }
	    settingsPage.updateExportButtonsState();
}
	private static loadDefaultProxyServer(proxyServers?: ProxyServer[], serverSubscriptions?: any[]) {
		let defaultProxyServerId = this.currentSettings.defaultProxyServerId;
		let cmbActiveProxyServer = jq("#cmbActiveProxyServer");

		cmbActiveProxyServer.children().remove();

		CountryCode.ensureInitialized(() => {
			this.populateProxyServersToComboBox(cmbActiveProxyServer, defaultProxyServerId, proxyServers, serverSubscriptions);

			let selectedValue = cmbActiveProxyServer.val();
			if (selectedValue && selectedValue !== defaultProxyServerId) {
				let newDefaultId = selectedValue || null;
				if (this.currentSettings.defaultProxyServerId !== newDefaultId) {
					this.currentSettings.defaultProxyServerId = newDefaultId;
					this.changeTracking.activeProxy = true;
				}
			} else if (!selectedValue && defaultProxyServerId) {
				this.currentSettings.defaultProxyServerId = null;
				this.changeTracking.activeProxy = true;
			}
		});
	}

	private static readServers(): ProxyServer[] {
		let servers: ProxyServer[] = [];
		let rows = this.grdServers.rows({ order: 'current' }).nodes();

		for (let i = 0; i < rows.length; i++) {
			let rowData = this.grdServers.row(rows[i]).data() as ProxyServer;
			if (rowData) {
				rowData.order = i;
				servers.push(rowData);
			}
		}
		return servers;
	}

	private static readSelectedServer(e?: any): any {
		let dataItem;

		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child')) {
				this.grdServers.rows().deselect();
				dataItem = this.grdServers.row(rowElement.prev('tr.parent')).select().data();
			}
			else
				dataItem = this.grdServers.row(rowElement).data();
		}
		else
			dataItem = this.grdServers.row({ selected: true }).data();

		return dataItem;
	}

	private static readSelectedServerRow(e: any): any {
		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child'))
				return this.grdServers.row({ selected: true });
			else
				return this.grdServers.row(rowElement);
		}

		return null;
	}

	private static refreshServersGrid() {
		let currentRow = this.grdServers.row(".selected");
		if (currentRow && currentRow.data())
			settingsPage.refreshServersGridRow(currentRow, true);
		else {
			this.grdServers.rows().invalidate();
			settingsPage.refreshServersGridAllRows();
		}

		this.grdServers.draw('full-hold');
	}

	private static refreshServersGridRow(row: any, invalidate?: boolean) {
		if (!row)
			return;
		if (invalidate)
			row.invalidate();

		let rowElement = jq(row.node());

		rowElement.find("#btnServersRemove").on("click", settingsPage.uiEvents.onServersRemoveClick);
		rowElement.find("#btnServersEdit").on("click", settingsPage.uiEvents.onServersEditClick);
	}

    /**
     * English: Updates a single proxy row by ID without rebuilding the entire table
     * Russian: Обновляет одну строку прокси по ID без полной перестройки таблицы
     */
    private static updateProxyRowById(proxyId: string): void {
        if (!settingsPage.grdServers) return;
        
        // Find row by proxy ID
        let targetRow: any = null;
        const rows = settingsPage.grdServers.rows();
        const data = rows.data();
        
        for (let i = 0; i < data.length; i++) {
            if (data[i] && data[i].id === proxyId) {
                targetRow = rows.row(i);
                break;
            }
        }
        
        if (targetRow) {
            // Re-render only this row
            settingsPage.refreshServersGridRow(targetRow, true);
            targetRow.draw(false); // false = keep page position
        }
    }
	
	private static refreshServersGridAllRows() {
		var nodes = this.grdServers.rows().nodes();
		for (let index = 0; index < nodes.length; index++) {
			const rowElement = jq(nodes[index]);

			rowElement.find("#btnServersRemove").on("click", settingsPage.uiEvents.onServersRemoveClick);
			rowElement.find("#btnServersEdit").on("click", settingsPage.uiEvents.onServersEditClick);
		}
	}

	private static insertNewServerInGrid(newServer: ProxyServer) {
		try {
			let row = this.grdServers.row
				.add(newServer)
				.draw('full-hold');

			settingsPage.refreshServersGridRow(row);
		} catch (error) {
			PolyFill.runtimeSendMessage("insertNewServerInGrid failed! > " + error);
			throw error;
		}
	}

	private static findProxyServerById(proxyServerId: string): ProxyServer | null {
		let proxyServers = settingsPage.readServers();

		let proxy = proxyServers.find(item => item.id === proxyServerId);
		if (proxy !== undefined)
			return proxy;

		let serverSubscriptions = settingsPage.readServerSubscriptions();
		for (let subscription of serverSubscriptions) {
			proxy = subscription.proxies.find(item => item.id === proxyServerId);
			if (proxy !== undefined)
				return proxy;
		}
		return null;
	}

	private static exportServersListFormatted(): string {
		let proxyList = settingsPage.readServers();
		let result = `[ProxyMust Servers]\r\n`;

		for (let proxy of proxyList) {
			let proxyExport = `${proxy.host}:${proxy.port} [${proxy.protocol}]`;

			if (proxy.username) {
				proxyExport += ` [${proxy.name}] [${proxy.username}] [${proxy.password}]`;
			}
			else if (proxy.name != `${proxy.host}:${proxy.port}`) {
				proxyExport += ` [${proxy.name}]`;
			}

			result += proxyExport + "\r\n";
		}
		return result;
	}

	private static readSmartProfile(pageProfile: SettingsPageSmartProfile): SmartProfile {
		let previousProfile = pageProfile.smartProfile;
		let tabContainer = pageProfile.htmlProfileTab;

		let smartProfile = new SmartProfile();
		ProfileOperations.copySmartProfileBase(previousProfile, smartProfile);

		smartProfile.profileName = tabContainer.find("#txtSmartProfileName").val();
		smartProfile.profileProxyServerId = tabContainer.find("#cmbProfileProxyServer").val();
		smartProfile.proxyRules = this.readRules(pageProfile);
		smartProfile.rulesSubscriptions = this.readRulesSubscriptions(pageProfile);
		let chkSmartProfileEnabled = tabContainer.find("#chkSmartProfileEnabled");
		if (chkSmartProfileEnabled.length)
			smartProfile.enabled = chkSmartProfileEnabled.prop('checked');

		// Read AutoProxy settings
		const autoProxyDiv = tabContainer.find("#divAutoProxySettings");
		if (autoProxyDiv.length) {
			const maxAttempts = parseInt(autoProxyDiv.find("#numMaxFailoverAttempts").val() as string) || 3;
			if (!smartProfile.autoProxySettings) {
				smartProfile.autoProxySettings = {};
			}
			smartProfile.autoProxySettings.maxFailoverAttempts = maxAttempts;
			const showAutoDialog = autoProxyDiv.find("#chkShowAutoDialog").prop("checked");
			smartProfile.showAutoDialog = showAutoDialog;
			smartProfile.autoPinSuccess = autoProxyDiv.find("#chkAutoPinSuccess").prop("checked");
			smartProfile.autoAddUnreachableSites = autoProxyDiv.find("#chkAutoAddUnreachableSites").prop("checked");
			// English: If user enables the global auto-dialog, clear all suppressed sites for this profile
			// Russian: Если пользователь включает глобальный показ диалогов, очищаем все подавленные сайты для этого профиля
			if (showAutoDialog) {
				if (smartProfile.suppressPinDialogForSites) {
					smartProfile.suppressPinDialogForSites = [];
				}
				if (smartProfile.suppressChangeDialogForSites) {
					smartProfile.suppressChangeDialogForSites = [];
				}
			}
		}

		return smartProfile;
	}

	private static loadSmartProfiles(profiles: SmartProfile[]) {
		jq(".menu-smart-profile").hide();
		let profileTabTemplate = jq("#tab-smart-profile").hide();
		let btnAddNewSmartProfile = jq(".menu-add-smart-profile");

		let lastTab = profileTabTemplate;

		for (const profile of profiles) {
			if (!profile.profileTypeConfig.editable)
				continue;

			profile.rulesSubscriptions = profile.rulesSubscriptions || [];
			profile.proxyRules = profile.proxyRules || [];

			let pageSmartProfile = this.createProfileContainer(profile, false, true);
			let profileMenu = pageSmartProfile.htmlProfileMenu;
			let profileTab = pageSmartProfile.htmlProfileTab;

			// Load AutoProxy settings
			const autoProxyDiv = profileTab.find("#divAutoProxySettings");
			if (autoProxyDiv.length) {
				const maxAttempts = profile.autoProxySettings?.maxFailoverAttempts ?? 3;
				autoProxyDiv.find("#numMaxFailoverAttempts").val(maxAttempts);
				autoProxyDiv.find("#chkShowAutoDialog").prop("checked", profile.showAutoDialog !== false);
				autoProxyDiv.find("#chkAutoPinSuccess").prop("checked", profile.autoPinSuccess === true);
				autoProxyDiv.find("#chkAutoAddUnreachableSites").prop("checked", profile.autoAddUnreachableSites !== false);
			}

			let newProfileMenuList = profileMenu.insertBefore(btnAddNewSmartProfile);
			pageSmartProfile.htmlProfileMenu = newProfileMenuList;

			lastTab.after(profileTab);
			lastTab = profileTab;

			this.pageSmartProfiles.push(pageSmartProfile);
		}
	}

	private static removePageSmartProfile(removedPageSmartProfile: SettingsPageSmartProfile) {
		removedPageSmartProfile.modalAddMultipleRules.remove();
		removedPageSmartProfile.modalAddMultipleRules = null;
		removedPageSmartProfile.modalImportRules.remove();
		removedPageSmartProfile.modalImportRules = null;
		removedPageSmartProfile.modalModifyRule.remove();
		removedPageSmartProfile.modalModifyRule = null;
		removedPageSmartProfile.modalRulesSubscription.remove();
		removedPageSmartProfile.modalRulesSubscription = null;

		removedPageSmartProfile.htmlProfileMenu.remove();
		removedPageSmartProfile.htmlProfileMenu = null;
		removedPageSmartProfile.htmlProfileTab.remove();
		removedPageSmartProfile.htmlProfileTab = null;
		removedPageSmartProfile.grdRules = null;
		removedPageSmartProfile.grdRulesSubscriptions = null;
	}

	private static removePageProfileAndReset(pageSmartProfile: SettingsPageSmartProfile) {
		let prevProfileMenu = pageSmartProfile.htmlProfileMenu.prev();

		this.removePageSmartProfile(pageSmartProfile);

		prevProfileMenu.tab('show');
	}

	private static removeUnsavedProfileAndReload(unsavedPageSmartProfile: SettingsPageSmartProfile, savedProfile: SmartProfile) {
		this.removePageSmartProfile(unsavedPageSmartProfile);
		settingsPage.changeTracking.newSmartProfile = false;

		let pageSmartProfile = this.createProfileContainer(savedProfile, false, true);
		this.pageSmartProfiles.push(pageSmartProfile);

		let profileMenu = pageSmartProfile.htmlProfileMenu;
		let profileTab = pageSmartProfile.htmlProfileTab;

		let profileTabTemplate = jq("#tab-smart-profile");
		let btnAddNewSmartProfile = jq(".menu-add-smart-profile");
		profileTabTemplate.after(profileTab);
		btnAddNewSmartProfile.before(profileMenu);

		profileMenu.tab('show');

		settingsPage.loadProfileProxyServer(pageSmartProfile);
	}

	private static createNewUnsavedProfile(profileType: SmartProfileType): SettingsPageSmartProfile {
		let newProfile = new SmartProfile();
		newProfile.profileType = profileType;
		newProfile.profileTypeConfig = getUserSmartProfileTypeConfig(profileType);
		newProfile.profileName = '';

		return this.createProfileContainerAttached(newProfile, true, false);
	}

	private static createProfileContainerAttached(profile: SmartProfile, isNewProfile: boolean = false, displayInMenu: boolean = true): SettingsPageSmartProfile {
		let pageSmartProfile = this.createProfileContainer(profile, isNewProfile, displayInMenu);
		let profileMenu = pageSmartProfile.htmlProfileMenu;
		let profileTab = pageSmartProfile.htmlProfileTab;

		let profileTabTemplate = jq("#tab-smart-profile");
		let btnAddNewSmartProfile = jq(".menu-add-smart-profile");
		profileTabTemplate.after(profileTab);
		btnAddNewSmartProfile.before(profileMenu);

		settingsPage.updateProfileGridsLayout(pageSmartProfile);

		return pageSmartProfile;
	}

	private static createProfileContainer(profile: SmartProfile, isNewProfile: boolean = false, displayInMenu: boolean = true): SettingsPageSmartProfile {
		let pageSmartProfile = new SettingsPageSmartProfile();
		pageSmartProfile.smartProfile = profile;

		let newProfileTab = this.createProfileTab(profile, isNewProfile);
		let tabId = newProfileTab.tabId;
		let profileTab = newProfileTab.profileTab;

		pageSmartProfile.modalModifyRule = profileTab.find("#modalModifyRule").hide();
		pageSmartProfile.modalAddMultipleRules = profileTab.find("#modalAddMultipleRules").hide();
		pageSmartProfile.modalRulesSubscription = profileTab.find("#modalRulesSubscription").hide();
		pageSmartProfile.modalImportRules = profileTab.find("#modalImportRules").hide();

		pageSmartProfile.htmlProfileTab = profileTab;

		let profileMenu = this.createProfileMenu(profile, tabId, isNewProfile);

		pageSmartProfile.htmlProfileMenu = profileMenu;

		this.initializeSmartProfileGrids(pageSmartProfile);
		this.bindSmartProfileEvents(pageSmartProfile);
		this.initializeSmartProfileUi(pageSmartProfile);

		this.loadRulesSubscriptions(pageSmartProfile, profile.rulesSubscriptions);
		this.loadRules(pageSmartProfile, profile.proxyRules);

		if (isNewProfile)
			this.loadProfileProxyServer(pageSmartProfile);
		else
			this.loadProfileProxyServer(pageSmartProfile, [], []);

		if (displayInMenu)
			profileMenu.show().removeClass('d-none');
		profileTab.css('display', '');

		return pageSmartProfile;
	}

	private static createProfileMenu(profile: SmartProfile, tabId: string, isNewProfile: boolean = false) {
		let profileMenuTemplate = jq(".menu-smart-profile");

		let newId = 'smart-profile-' + Utils.getNewUniqueIdNumber();
		let menuId = 'menu-' + newId;
		if (isNewProfile)
			menuId += '-new';
		let profileMenu = profileMenuTemplate.first().clone();

		profileMenu.find("#menu-smart-profile-name").text(profile.profileName);
		profileMenu.find(".icon").addClass(getSmartProfileTypeIcon(profile.profileType));
		profileMenu.attr("id", menuId);
		profileMenu.attr("href", '#' + tabId);
		profileMenu.addClass('nav-smart-profile-item');
		profileMenu.click(() => {
			settingsPage.hideMenuOffCanvas();
			settingsPage.windowScrollToTop(true);
		});

		return profileMenu;
	}

	private static createProfileTab(profile: SmartProfile, isNewProfile: boolean = false): any {
		let profileTabTemplate = jq("#tab-smart-profile");
		let newId = 'smart-profile-' + Utils.getNewUniqueIdNumber();
		let tabId = 'tab-' + newId;
		if (isNewProfile)
			tabId += '-new';
		let profileTab = profileTabTemplate.clone();

		profileTab.attr("id", tabId);
		profileTab.addClass('tab-smart-profile-item');
		if (isNewProfile)
			profileTab.addClass('tab-new-unsaved-smart-profile-item');
		profileTab.find("#lblProfileName").html(profile.profileName + ` <i class="fas fa-pencil-alt fa-xs"></i>`);
		profileTab.find("#txtSmartProfileName").val(profile.profileName);
		profileTab.find("#lblProfileType").text(getSmartProfileTypeName(profile.profileType));
		profileTab.find("#lblProfileTypeIcon").addClass(getSmartProfileTypeIcon(profile.profileType));
		profileTab.find(".label-profile-type-description").hide();
		profileTab.find(`.label-profile-type-description-for-${SmartProfileType[profile.profileType]}`).show();
					profileTab.find("#chkSmartProfileEnabled").prop("checked", profile.enabled);

			// AutoProxy settings: show only for SmartRules profiles
			const autoProxyDiv = profileTab.find("#divAutoProxySettings");
			if (profile.profileType === SmartProfileType.SmartRules) {
				autoProxyDiv.show();
			} else {
				autoProxyDiv.hide();
			}

		if (isNewProfile) {
			this.showProfileNameEdit(profileTab);
		}

		if (isNewProfile ||
			profile.profileTypeConfig.builtin) {
			profileTab.find("#btnDeleteSmartProfile").remove();
		}
		if (!profile.profileTypeConfig.canBeDisabled) {
			profileTab.find("#divSmartProfileEnabled").remove();
		}
		if (!profile.profileTypeConfig.supportsProfileProxy) {
			profileTab.find("#divProfileProxyServer").remove();
		}
		if (!profile.profileTypeConfig.supportsSubscriptions) {
			profileTab.find("#divSmartProfileSubscription").remove();
		}
		if (!profile.profileTypeConfig.customProxyPerRule) {
			profileTab.find("#divRuleProxyServer").remove();
		}

		return {
			profileTab,
			tabId
		};
	}

	private static updateProfileGridsLayout(pageProfile: SettingsPageSmartProfile) {
		pageProfile.grdRules.columns.adjust().draw();
		pageProfile.grdRulesSubscriptions.columns.adjust().draw();
	}

	private static showProfileTab(pageProfile: SettingsPageSmartProfile) {
		let profileTab = pageProfile.htmlProfileTab;
		let profileMenu = pageProfile.htmlProfileMenu;

		jq("#tabSettingsContent").find('.tab-pane').removeClass('active show')
		profileTab.css('display', '');
		profileMenu.tab('show');
	}

	private static showProfileNameEdit(htmlProfileTab: any) {
		htmlProfileTab.find("#lblProfileName").hide();
		htmlProfileTab.find("#txtSmartProfileName").addClass("d-inline").removeClass("d-none")
			.focus()
			.select();
	}

	private static selectAddNewProfileMenu() {
		jq('.menu-add-smart-profile').first().tab('show');
	}

	private static updateProfileMenuName(pageProfile: SettingsPageSmartProfile) {
		pageProfile.htmlProfileMenu.find("#menu-smart-profile-name")
			.text(pageProfile.smartProfile.profileName);
	}

	private static loadProfileProxyServer(pageProfile: SettingsPageSmartProfile, proxyServers?: ProxyServer[], serverSubscriptions?: any[]) {
		let profileProxyServerId = pageProfile.smartProfile.profileProxyServerId;
		let tabContainer = pageProfile.htmlProfileTab;
		let cmbProfileProxyServer = tabContainer.find("#cmbProfileProxyServer");

		if (cmbProfileProxyServer.length) {
			cmbProfileProxyServer.children().remove();
			jq("<option>")
				.attr("value", "")
				.text(api.i18n.getMessage("settingsProfilesProxyServer"))
				.appendTo(cmbProfileProxyServer);
			
			CountryCode.ensureInitialized(() => {
				this.populateProxyServersToComboBox(cmbProfileProxyServer, profileProxyServerId, proxyServers, serverSubscriptions);
			});
		}
	}

	private static loadAllProfilesProxyServers() {
		for (const pageProfile of settingsPage.pageSmartProfiles) {
			settingsPage.loadProfileProxyServer(pageProfile);
		}
	}

	private static initializeSmartProfileGrids(pageProfile: SettingsPageSmartProfile) {
		let dataTableCustomDom = '<t><"row"<"col-sm-12 col-md-5"<"text-left float-left"f>><"col-sm-12 col-md-7"<"text-right"l>>><"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
		
        // English: Register custom sorting for proxy column in rules table
        // Russian: Регистрируем кастомную сортировку для колонки прокси в таблице правил
        settingsPage.initCustomRuleProxySorting(pageProfile);
		
		let tabContainer = pageProfile.htmlProfileTab;

		let grdRulesColumns = [
			{
				name: "ruleType",
				data: "ruleTypeName",
				title: api.i18n.getMessage("settingsRulesGridColRuleType"),
				responsivePriority: 3,
				render: (data, type, row: ProxyRule) => {
					return `<i class="fas fa-bars fa-xs px-2 cursor-move"></i>  ` + (data || '')
				},
			},
			{
				name: "hostName",
				data: "hostName",
				title: api.i18n.getMessage("settingsRulesGridColSource"),
				responsivePriority: 1
			},
			{
				name: "rule",
				data: "rule",
				title: api.i18n.getMessage("settingsRulesGridColRule"),
				render: (data, type, row: ProxyRule) => {
					return data || '';
				},
			},
			{
				name: "enabled",
				data: "enabled",
				title: api.i18n.getMessage("settingsRulesGridColEnabled"),
				render: function (data, type, row: ProxyRule) {
					const uniqueId = `ruleToggle_${row.ruleId}_${Utils.getNewUniqueIdString()}`;
					const checkedAttr = data ? 'checked' : '';
					const whiteListIcon = row && row.whiteList
						? ` <i class="far fa-hand-paper ms-2" title="${api.i18n.getMessage("settingsRuleActionWhitelist")}"></i>`
						: '';

					return `
						<div class="form-check form-switch d-inline-flex align-items-center">
							<input class="form-check-input rule-enabled-toggle" type="checkbox" id="${uniqueId}" ${checkedAttr}>
							<label class="form-check-label" for="${uniqueId}"></label>
						</div>${whiteListIcon}`;
				},
			},
			// English: New column for rule mode (Auto/Manual)
			// Russian: Новая колонка для режима правила (Auto/Manual)
			{
				name: "mode",
				data: "mode",
				title: api.i18n.getMessage("settingsRulesGridColMode"),
				render: function(data, type, row: ProxyRule) {
					// English: For whitelist rules, mode is disabled (no proxy applies)
					// Russian: Для правил-исключений режим отключён (прокси не применяется)
					if (row.whiteList) {
						return `<span class="text-muted small">—</span>`;
					}
					const mode = data || 'auto';
					return `<select class="form-select form-select-sm rule-mode-select" data-rule-id="${row.ruleId}">
								<option value="auto" ${mode === 'auto' ? 'selected' : ''}>Auto</option>
								<option value="manual" ${mode === 'manual' ? 'selected' : ''}>Manual</option>
							</select>`;
				},
				responsivePriority: 4
			},
            {
                name: "proxy",
                data: "proxyName",
                title: api.i18n.getMessage("settingsRulesGridColProxy"),
                orderDataType: 'rule-proxy-priority',
                orderable: true,
                render: function(data, type, row: ProxyRule) {
					// English: For whitelist rules, show "Exclusion" and no proxy selection
					// Russian: Для правил-исключений показываем "Исключение" и не даём выбирать прокси
					if (row.whiteList) {
						return `<span class="text-muted">${api.i18n.getMessage("settingsRuleActionWhitelist") || "Exclusion"}</span>`;
					}
					
					try {
						const site = row.hostName;
						// English: Get sorted proxies for this site using the same logic as popup
						// Russian: Получаем отсортированные прокси для этого сайта, используя ту же логику, что и в попапе
						const sortedProxies = ProxySelector.getSortedProxiesForSite(site, true);
						
						let currentProxyId = row.proxyServerId;
						if (!currentProxyId && row.proxy) {
							currentProxyId = row.proxy.id;
						}
						
						let optionsHtml = '<option value="">' + api.i18n.getMessage("settingsRulesProxyDefault") + '</option>';
						// English: Add "Whitelist (no proxy)" option
						// Russian: Добавляем опцию "Whitelist (no proxy)"
						optionsHtml += `<option value="whitelist">${api.i18n.getMessage("settingsRuleActionWhitelist") || "Whitelist (no proxy)"}</option>`;
						
						// English: Add options for each sorted proxy
						// Russian: Добавляем опции для каждого отсортированного прокси
						let foundCurrentProxy = false;
						for (const p of sortedProxies) {
							const flag = CountryCode.getCountryFlagEmoji(p.countryCode || CountryCode.getCountryCode(p.host));
							const rating = p.rating ?? 0;
							const ratingText = rating === 0 ? "" : (rating > 0 ? `(+${rating})` : `(${rating})`);
							const staleHours = settingsPage.currentSettings?.userPrefs?.staleHours ?? 6;
							const autoStatus = settingsPage.currentSettings?.autoStatus || {};
							const statusInfo = getProxyStatus(p.id, site, autoStatus, staleHours);
							const symbol = statusInfo.symbol;
							
							const selected = (p.id === currentProxyId) ? 'selected' : '';
							if (selected) foundCurrentProxy = true;
							const label = `${flag} ${p.host}:${p.port} (${p.protocol}) ${ratingText} ${symbol}`;
							optionsHtml += `<option value="${p.id}" ${selected}>${label}</option>`;
						}

						// English: If the current proxy is not in the sorted list (e.g., because it's disabled or fail), add it manually
						// Russian: Если текущий прокси отсутствует в отсортированном списке (например, отключён или fail), добавляем его вручную
						if (!foundCurrentProxy && currentProxyId) {
							const currentProxy = SettingsOperation.findProxyServerById(currentProxyId);
							if (currentProxy) {
								const flag = CountryCode.getCountryFlagEmoji(currentProxy.countryCode || CountryCode.getCountryCode(currentProxy.host));
								const rating = currentProxy.rating ?? 0;
								const ratingText = rating === 0 ? "" : (rating > 0 ? `(+${rating})` : `(${rating})`);
								const staleHours = settingsPage.currentSettings?.userPrefs?.staleHours ?? 6;
								const autoStatus = settingsPage.currentSettings?.autoStatus || {};
								const statusInfo = getProxyStatus(currentProxy.id, site, autoStatus, staleHours);
								const symbol = statusInfo.symbol;
								const label = `${flag} ${currentProxy.host}:${currentProxy.port} (${currentProxy.protocol}) ${ratingText} ${symbol}`;
								optionsHtml += `<option value="${currentProxy.id}" selected>${label}</option>`;
							}
						}
						
						return `<div class="proxy-cell" style="display:flex; align-items:center; gap:4px;">
									<select class="form-select form-select-sm has-country-flags proxy-select-for-rule" data-rule-id="${row.ruleId}" style="width:100%; font-size:0.8rem;">
										${optionsHtml}
									</select>
								</div>`;
					} catch (err) {
						console.error('[Proxy column] Error rendering proxy select:', err);
						// English: Fallback: show a simple select with default option
						// Russian: Fallback: показываем простой select с опцией по умолчанию
						return `<div class="proxy-cell" style="display:flex; align-items:center; gap:4px;">
									<select class="form-select form-select-sm has-country-flags proxy-select-for-rule" data-rule-id="${row.ruleId}" style="width:100%; font-size:0.8rem;">
										<option value="">${api.i18n.getMessage("settingsRulesProxyDefault")}</option>
										<option value="whitelist">${api.i18n.getMessage("settingsRuleActionWhitelist") || "Whitelist (no proxy)"}</option>
									</select>
								</div>`;
					}
				},
				defaultContent: api.i18n.getMessage("settingsRulesProxyDefault")
			},
			{
				"width": "60px",
				"data": null,
				"className": "text-nowrap",
				"defaultContent": `<button class='btn btn-sm btn-success' id='btnRulesEdit'>${api.i18n.getMessage("settingsEditButton")}</button> <button class='btn btn-sm btn-danger' id='btnRulesRemove'><i class='fas fa-times'></button>`,
				responsivePriority: 2
			}
		];
		if (!pageProfile.smartProfile.profileTypeConfig.customProxyPerRule) {
			let index = grdRulesColumns.findIndex(x => x.name == "proxy");
			grdRulesColumns.splice(index, 1);
		}

		let grdRules = tabContainer.find("#grdRules").DataTable({
			"dom": dataTableCustomDom,
			paging: true,
			pageLength: settingsPage.currentSettings?.uiOptions?.smartRulesGridRows || 10,
			select: { style: "os" },
			scrollY: 460,
			scrollCollapse: true,
			responsive: true,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, api.i18n.getMessage("datatablesAll")]],
			ordering: false,
			columns: grdRulesColumns,
			language: {
				search: api.i18n.getMessage("datatablesSearch"),
				lengthMenu: api.i18n.getMessage("datatablesShow") + " _MENU_ " + api.i18n.getMessage("datatablesEntries"),
				info: api.i18n.getMessage("datatablesInfo"),
				paginate: {
					previous: api.i18n.getMessage("datatablesPrevious"),
					next: api.i18n.getMessage("datatablesNext")
				}
			}
		});
		grdRules.on('responsive-display',
			function (e, dataTable, row, showHide, update) {
				let rowChild = row.child();

				if (showHide && rowChild && rowChild.length)
					settingsPage.refreshRulesGridRowElement(pageProfile, rowChild[0]);
			}
		);
		grdRules.on("select deselect", () => {
			this.uiEvents.onRowSelectionChanged(pageProfile.grdRules, tabContainer.find("#btnRemoveMultipleProxyRule"));
		});
		grdRules.on('length.dt', function (e, settings, len) {
			settingsPage.currentSettings.uiOptions.smartRulesGridRows = len || 10;
			settingsPage.saveUiOptions();
		});
		grdRules.draw();
		new jq.fn.dataTable.Responsive(grdRules);
		jq.fn.dataTable.select.init(grdRules);
		new jq.fn.dataTable.RowReorder(grdRules, {
			dataSrc: 'order',
			selector: 'tr>td:first-child>i',
			snapX: true
		});
		grdRules.on('row-reordered', function (e, diff, edit) {
			let rowsData = pageProfile.grdRules.data();

			let rowsDataOld = rowsData.toArray();

			diff.forEach(change => {
				rowsData[change.newPosition] = rowsDataOld[change.oldPosition];
			});

			pageProfile.grdRules.clear();
			pageProfile.grdRules.rows.add(rowsData).draw('full-hold');
			settingsPage.refreshRulesGridAllRows(pageProfile);
		});

		let grdRulesSubscriptions = tabContainer.find("#grdRulesSubscriptions").DataTable({
			"dom": dataTableCustomDom,
			paging: true,
			pageLength: settingsPage.currentSettings?.uiOptions?.rulesSubscriptionsGridRows || 10,
			select: { style: "os" },
			scrollY: 460,
			scrollCollapse: true,
			responsive: true,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, api.i18n.getMessage("datatablesAll")]],
			ordering: false,
			columns: [
				{
					name: "name", data: "name", title: api.i18n.getMessage("settingsRulesSubscriptionsGridColName"),
					responsivePriority: 1
				},
				{
					name: "url", data: "url", className: "text-break-word", title: api.i18n.getMessage("settingsRulesSubscriptionsGridColUrl"),
					responsivePriority: 3,
					render: (data, type, row: ProxyRulesSubscription) => {
						let render = row.url;
						let stats = row.stats;
						if (stats) {
							let status = SubscriptionStats.ToString(stats);

							if (row.stats.lastStatus) {
								render += ` <div id='btnRuleSubscriptionsViewStats' title='${status}' class='cursor-pointer float-end'><i class="fas fa-check-circle text-success"></i></div> `;
							}
							else {
								render += ` <div id='btnRuleSubscriptionsViewStats' title='${status}' class='cursor-pointer float-end'><i class="fas fa-exclamation-triangle text-danger"></i></div> `;
							}
						}
						return render;
					},
				},
				{
					name: "totalCount", data: "totalCount", type: "num", title: api.i18n.getMessage("settingsRulesSubscriptionsGridColCount")
				},
				{
					name: "enabled", data: "enabled", title: api.i18n.getMessage("settingsRulesSubscriptionsGridColEnabled"),
				},
				{
					"width": "100px",
					"data": null,
					"className": "text-nowrap",
					"defaultContent": `<button class='btn btn-sm btn-success' id='btnRuleSubscriptionsEdit'>${api.i18n.getMessage("settingsEditButton")}</button> <button class='btn btn-sm btn-info' id='btnRuleSubscriptionsRefresh'><i class='fas fa-sync'></i></button> <button class='btn btn-sm btn-danger' id='btnRuleSubscriptionsRemove'><i class='fas fa-times'></button>`,
					responsivePriority: 2
				}
			],
			language: {
				search: api.i18n.getMessage("datatablesSearch"),
				lengthMenu: api.i18n.getMessage("datatablesShow") + " _MENU_ " + api.i18n.getMessage("datatablesEntries"),
				info: api.i18n.getMessage("datatablesInfo"),
				paginate: {
					previous: api.i18n.getMessage("datatablesPrevious"),
					next: api.i18n.getMessage("datatablesNext")
				}
			}
		});
		grdRulesSubscriptions.on('responsive-display',
			function (e, dataTable, row, showHide, update) {
				let rowChild = row.child();
				if (showHide && rowChild && rowChild.length)
					settingsPage.refreshRulesSubscriptionsGridRowElement(pageProfile, rowChild[0]);
			}
		);
		grdRulesSubscriptions.on("select deselect", () => {
			this.uiEvents.onRowSelectionChanged(pageProfile.grdRulesSubscriptions, tabContainer.find("#btnRemoveMultipleRulesSubscription"));
		});
		grdRulesSubscriptions.on('length.dt', function (e, settings, len) {
			settingsPage.currentSettings.uiOptions.rulesSubscriptionsGridRows = len || 10;
			settingsPage.saveUiOptions();
		});
		grdRulesSubscriptions.draw();
		if (tabContainer.find("#grdRulesSubscriptions").length) {
			jq.fn.dataTable.select.init(grdRulesSubscriptions);
		}

		pageProfile.grdRules = grdRules;
		pageProfile.grdRulesSubscriptions = grdRulesSubscriptions;
	}

	private static initializeSmartProfileUi(pageProfile: SettingsPageSmartProfile) {
		let tabContainer = pageProfile.htmlProfileTab;
		if (environment.chrome) {
			tabContainer.find("#divAlertChrome").show().removeClass('d-none');
			tabContainer.find(".firefox-only").hide();
			tabContainer.find(".chrome-only").show().removeClass('d-none');
			if (environment.manifestV3) {
				tabContainer.find(".chrome-mv3-only").show().removeClass('d-none');
			}
		} else {
			tabContainer.find("#divAlertFirefox").show().removeClass('d-none');
			tabContainer.find(".firefox-only").show().removeClass('d-none');
			tabContainer.find(".chrome-only").hide();
		}

		let cmbRulesSubscriptionObfuscation = tabContainer.find("#cmbRulesSubscriptionObfuscation");

		proxyServerSubscriptionObfuscate.forEach(item => {
			jq("<option>").attr("value", item)
				.text(item)
				.appendTo(cmbRulesSubscriptionObfuscation);
		});

		let cmbRulesSubscriptionApplyProxy = tabContainer.find("#cmbRulesSubscriptionApplyProxy");
		specialRequestApplyProxyModeKeys.forEach((item, index) => {
			jq("<option>").attr("value", index)
				.text(api.i18n.getMessage("settingsServerSubscriptionApplyProxy_" + item))
				.appendTo(cmbRulesSubscriptionApplyProxy);
		});
		if (environment.chrome)
						cmbRulesSubscriptionApplyProxy.attr("disabled", "disabled");
	}

	private static bindSmartProfileEvents(pageProfile: SettingsPageSmartProfile) {
		let profileMenu = pageProfile.htmlProfileMenu;
		let tabContainer = pageProfile.htmlProfileTab;

		tabContainer.find("#lblProfileName").click(() => settingsPage.uiEvents.onProfileNameClick(pageProfile));

		tabContainer.find("#cmdRuleType").change(() => settingsPage.uiEvents.onChangeRuleType(pageProfile));

		tabContainer.find("#cmdRuleAction").change(() => settingsPage.uiEvents.onChangeRuleAction(pageProfile));

		tabContainer.find("#chkRuleGeneratePattern").change(() => settingsPage.uiEvents.onChangeRuleGeneratePattern(pageProfile));

		tabContainer.find("#btnSubmitRule").click(() => settingsPage.uiEvents.onClickSubmitProxyRule(pageProfile));

		tabContainer.find("#btnAddProxyRule").click(() => settingsPage.uiEvents.onClickAddProxyRule(pageProfile));

		tabContainer.find("#btnImportRulesOpen").click(() => settingsPage.uiEvents.onClickImportRulesOpenDialog(pageProfile));

		tabContainer.find("#btnImportRules").click(() => settingsPage.uiEvents.onClickImportRules(pageProfile));

		tabContainer.find("#btnAddMultipleProxyRule").click(() => settingsPage.uiEvents.onClickAddMultipleProxyRule(pageProfile));

		tabContainer.find("#btnRemoveMultipleProxyRule").click(() => settingsPage.uiEvents.onClickRemoveMultipleProxyRule(pageProfile));

		tabContainer.find("#btnSubmitMultipleRule").click(() => settingsPage.uiEvents.onClickSubmitMultipleRule(pageProfile));

		tabContainer.find("#btnClearProxyRules").click(() => settingsPage.uiEvents.onClickClearProxyRules(pageProfile));

		tabContainer.find("#btnAddRulesSubscription").click(() => settingsPage.uiEvents.onClickAddRulesSubscription(pageProfile));

		tabContainer.find("#btnRemoveMultipleRulesSubscription").click(() => settingsPage.uiEvents.onClickRemoveMultipleRulesSubscription(pageProfile));

		tabContainer.find("#btnSaveRulesSubscriptions").click(() => settingsPage.uiEvents.onClickSaveRulesSubscription(pageProfile));

		tabContainer.find("#btnTestRulesSubscriptions").click(() => settingsPage.uiEvents.onClickTestRulesSubscription(pageProfile));

		tabContainer.find("#btnClearRulesSubscriptions").click(() => settingsPage.uiEvents.onClickClearRulesSubscriptions(pageProfile));

		tabContainer.find("#btnSaveSmartProfile").click(() => settingsPage.uiEvents.onClickSaveSmartProfile(pageProfile));

		tabContainer.find("#btnRejectSmartProfile").click(() => settingsPage.uiEvents.onClickRejectSmartProfile(pageProfile));

		tabContainer.find("#btnDeleteSmartProfile").click(() => settingsPage.uiEvents.onClickDeleteSmartProfile(pageProfile));

		pageProfile.grdRules.columns.adjust().draw();
		pageProfile.grdRulesSubscriptions.columns.adjust().draw();

		profileMenu.on('shown.bs.tab', (e: any) => {
			settingsPage.updateProfileGridsLayout(pageProfile);
		});

		tabContainer.find("#txtSmartProfileName").on("input", () => {
			settingsPage.changeTracking.smartProfiles = true;
		});
		tabContainer.find("#chkSmartProfileEnabled").on("change", () => {
			settingsPage.changeTracking.smartProfiles = true;
		});

		tabContainer.find("#cmbProfileProxyServer").on("change", (event) => {
			if (event.originalEvent && event.originalEvent.isTrusted) {
				settingsPage.changeTracking.smartProfiles = true;
			}
		});

		// AutoProxy settings change tracking
		const autoProxyDiv = tabContainer.find("#divAutoProxySettings");
		if (autoProxyDiv.length) {
			autoProxyDiv.find("#numMaxFailoverAttempts, #chkShowAutoDialog, #chkAutoPinSuccess").on("change input", () => {
				settingsPage.changeTracking.smartProfiles = true;
			});
		}
	}

    private static loadRules(pageProfile: SettingsPageSmartProfile, rules: ProxyRule[]) {
        console.log(`[loadRules] profile ${pageProfile.smartProfile.profileName}, rules count: ${rules.length}, isAuto count: ${rules.filter(r => r.isAuto).length}`);		
        if (!pageProfile.grdRules)
            return;
        pageProfile.grdRules.clear();

        let fixedRules = ProxyRule.assignArray(rules);
        pageProfile.grdRules.rows.add(fixedRules).draw('full-hold');

        // English: Set default sorting by proxy column (status + rating)
        // Russian: Устанавливаем сортировку по умолчанию по колонке прокси (статус + рейтинг)
        pageProfile.grdRules.order([ ['proxy', 'asc'] ]).draw();

        this.refreshRulesGridAllRows(pageProfile);
    }

	private static readRules(pageProfile: SettingsPageSmartProfile): ProxyRule[] {
		return pageProfile.grdRules.data().toArray();
	}

	private static readSelectedRule(pageProfile: SettingsPageSmartProfile, e?: any): ProxyRule {
		let dataItem;

		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child')) {
				pageProfile.grdRules.rows().deselect();
				dataItem = pageProfile.grdRules.row(rowElement.prev('tr.parent')).select().data();
			}
			else
				dataItem = pageProfile.grdRules.row(rowElement).data();
		}
		else
			dataItem = pageProfile.grdRules.row({ selected: true }).data();

		return dataItem;
	}

	private static readSelectedRuleRow(pageProfile: SettingsPageSmartProfile, e: any): any {
		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child'))
				return pageProfile.grdRules.row({ selected: true });
			else
				return pageProfile.grdRules.row(rowElement);
		}

		return null;
	}

	private static refreshRulesGrid(pageProfile: SettingsPageSmartProfile) {
		let currentRow = pageProfile.grdRules.row('.selected');
		if (currentRow && currentRow.data())
			settingsPage.refreshRulesGridRow(pageProfile, currentRow, true);
		else {
			pageProfile.grdRules.rows().invalidate();
			settingsPage.refreshRulesGridAllRows(pageProfile);
		}

		pageProfile.grdRules.draw('full-hold');
	}

	private static refreshRulesGridRow(pageProfile: SettingsPageSmartProfile, row: any, invalidate?: any) {
		if (!row)
			return;
		if (invalidate)
			row.invalidate();

		let rowElement = jq(row.node());

		rowElement.find("#btnRulesRemove").on("click", (e: any) => settingsPage.uiEvents.onRulesRemoveClick(pageProfile, e));
		rowElement.find("#btnRulesEdit").on("click", (e: any) => settingsPage.uiEvents.onRulesEditClick(pageProfile, e));
	}

	private static refreshRulesGridRowElement(pageProfile: SettingsPageSmartProfile, rowElement: any) {
		if (!rowElement)
			return;

		rowElement = jq(rowElement);

		rowElement.find("#btnRulesRemove").on("click", (e: any) => settingsPage.uiEvents.onRulesRemoveClick(pageProfile, e));
		rowElement.find("#btnRulesEdit").on("click", (e: any) => settingsPage.uiEvents.onRulesEditClick(pageProfile, e));
		rowElement.find(".rule-enabled-toggle").on("change", (e: any) => settingsPage.uiEvents.onRuleEnabledToggleChange(pageProfile, e));
	}

	private static refreshRulesGridAllRows(pageProfile: SettingsPageSmartProfile) {
		console.log(`[refreshRulesGridAllRows] profile ${pageProfile.smartProfile.profileName}, rows count: ${pageProfile.grdRules.rows().count()}`);		
		var nodes = pageProfile.grdRules.rows().nodes();
		for (let index = 0; index < nodes.length; index++) {
			const rowElement = jq(nodes[index]);

			rowElement.find("#btnRulesRemove").on("click", (e: any) => settingsPage.uiEvents.onRulesRemoveClick(pageProfile, e));
			rowElement.find("#btnRulesEdit").on("click", (e: any) => settingsPage.uiEvents.onRulesEditClick(pageProfile, e));
			rowElement.find(".rule-enabled-toggle").on("change", (e: any) => settingsPage.uiEvents.onRuleEnabledToggleChange(pageProfile, e));
			
			// English: Handler for mode change
			// Russian: Обработчик изменения режима
			rowElement.find(".rule-mode-select").off("change").on("change", function(this: HTMLSelectElement) {
				// const ruleId = parseInt(this.dataset.ruleId); // not needed;
				const newMode = this.value as 'auto' | 'manual';
				const rowData = pageProfile.grdRules.row(jq(this).closest('tr')).data();
				if (rowData) {
					rowData.mode = newMode;
					settingsPage.changeTracking.smartProfiles = true;
				}
			});
			
			// English: Handler for proxy selection (manual override)
			// Russian: Обработчик выбора прокси (ручное переопределение)
			rowElement.find(".proxy-select-for-rule").off("change").on("change", function(this: HTMLSelectElement) {
				const newValue = this.value;
				const rowData = pageProfile.grdRules.row(jq(this).closest('tr')).data();
				if (!rowData) return;
				
				if (newValue === "whitelist") {
					// English: Switch to whitelist (no proxy)
					// Russian: Переключаем в белый список (без прокси)
					PolyFill.runtimeSendMessage({
						command: "PopupSetRuleWhitelist",
						ruleId: rowData.ruleId,
						whiteList: true
					}, (response) => {
						if (response && response.success) {
							rowData.whiteList = true;
							rowData.proxyServerId = null;
							rowData.proxy = null;
							settingsPage.changeTracking.smartProfiles = true;
							settingsPage.refreshRulesGridRow(pageProfile, pageProfile.grdRules.row(jq(this).closest('tr')));
						} else {
							console.warn("[Settings] Failed to set whitelist for rule:", rowData.ruleId);
							// Revert selection
							jq(this).val(rowData.proxyServerId || '');
						}
					});
				} else if (newValue === "") {
					// English: Use active proxy
					// Russian: Использовать активный прокси
					rowData.proxyServerId = null;
					if (rowData.whiteList) {
						// If currently whitelist, switch to normal rule
						rowData.whiteList = false;
					}
					settingsPage.changeTracking.smartProfiles = true;
					PolyFill.runtimeSendMessage({
						command: CommandMessages.PopupChangeProxyForRule,
						ruleId: rowData.ruleId,
						proxyServerId: null
					}, () => {
						settingsPage.refreshRulesGridRow(pageProfile, pageProfile.grdRules.row(jq(this).closest('tr')));
					});
				} else {
					// English: Select a specific proxy
					// Russian: Выбор конкретного прокси
					const newProxyId = newValue;
					rowData.proxyServerId = newProxyId;
					if (rowData.whiteList) {
						rowData.whiteList = false;
					}
					settingsPage.changeTracking.smartProfiles = true;
					PolyFill.runtimeSendMessage({
						command: CommandMessages.PopupChangeProxyForRule,
						ruleId: rowData.ruleId,
						proxyServerId: newProxyId
					}, () => {
						settingsPage.refreshRulesGridRow(pageProfile, pageProfile.grdRules.row(jq(this).closest('tr')));
					});
				}
			});
		}
	}

	private static insertNewRuleInGrid(pageProfile: SettingsPageSmartProfile, newRule: ProxyRule) {
		try {
			let row = pageProfile.grdRules.row
				.add(newRule)
				.draw('full-hold');

			settingsPage.refreshRulesGridRow(pageProfile, row);
		} catch (error) {
			PolyFill.runtimeSendMessage("insertNewRuleInGrid failed! > " + error);
			throw error;
		}
	}

	private static insertNewRuleListInGrid(pageProfile: SettingsPageSmartProfile, newRuleList: ProxyRule[]) {
		try {
			let lastRow;
			for (const rule of newRuleList) {
				lastRow = pageProfile.grdRules.row
					.add(rule);
			}
			if (lastRow) {
				lastRow.draw('full-hold');
				settingsPage.refreshRulesGridAllRows(pageProfile);
			}
		} catch (error) {
			PolyFill.runtimeSendMessage("insertNewRuleInGrid failed! > " + error);
			throw error;
		}
	}

	private static loadServerSubscriptionsGrid(subscriptions: any[]) {
		if (!this.grdServerSubscriptions)
			return;
		this.grdServerSubscriptions.clear();
		this.grdServerSubscriptions.rows.add(subscriptions).draw('full-hold');

		const savedPageLength = settingsPage.currentSettings?.uiOptions?.serverSubscriptionsGridRows;
		if (savedPageLength && savedPageLength !== this.grdServerSubscriptions.page.len()) {
			this.grdServerSubscriptions.page.len(savedPageLength).draw();
		}

		this.refreshServerSubscriptionsGridAllRows();
	}

	private static readServerSubscriptions(): ProxyServerSubscription[] {
		return this.grdServerSubscriptions.data().toArray();
	}

	private static readSelectedServerSubscription(e?: any): ProxyServerSubscription {
		let dataItem;

		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child')) {
				this.grdServerSubscriptions.rows().deselect();
				dataItem = this.grdServerSubscriptions.row(rowElement.prev('tr.parent')).select().data();
			}
			else
				dataItem = this.grdServerSubscriptions.row(rowElement).data();
		}
		else
			dataItem = this.grdServerSubscriptions.row({ selected: true }).data();

		return dataItem;
	}

	private static readSelectedServerSubscriptionRow(e: any): any {
		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child'))
				return this.grdServerSubscriptions.row({ selected: true });
			else
				return this.grdServerSubscriptions.row(rowElement);
		}

		return null;
	}

	private static refreshServerSubscriptionsGrid() {
		let currentRow = this.grdServerSubscriptions.row('.selected');
		if (currentRow && currentRow.data())
			settingsPage.refreshServerSubscriptionsGridRow(currentRow, true);
		else {
			this.grdServerSubscriptions.rows().invalidate();
			settingsPage.refreshServerSubscriptionsGridAllRows();
		}

		this.grdServerSubscriptions.draw('full-hold');
	}

	private static refreshServerSubscriptionsGridRow(row: any, invalidate?: any) {
		if (!row)
			return;
		if (invalidate)
			row.invalidate();

		let rowElement = jq(row.node());

		rowElement.find("#btnSubscriptionsRemove").on("click", settingsPage.uiEvents.onServerSubscriptionRemoveClick);
		rowElement.find("#btnSubscriptionsEdit").on("click", settingsPage.uiEvents.onServerSubscriptionEditClick);
		rowElement.find("#btnServerSubscriptionsViewStats").on("click", settingsPage.uiEvents.onServerSubscriptionViewStatsClick);
	}

	private static refreshServerSubscriptionsGridRowElement(rowElement: any, invalidate?: any) {
		if (!rowElement)
			return;

		rowElement = jq(rowElement);

		rowElement.find("#btnSubscriptionsRemove").on("click", settingsPage.uiEvents.onServerSubscriptionRemoveClick);
		rowElement.find("#btnSubscriptionsEdit").on("click", settingsPage.uiEvents.onServerSubscriptionEditClick);
		rowElement.find("#btnServerSubscriptionsViewStats").on("click", settingsPage.uiEvents.onServerSubscriptionViewStatsClick);
	}

	private static refreshServerSubscriptionsGridAllRows() {
		var nodes = this.grdServerSubscriptions.rows().nodes();
		for (let index = 0; index < nodes.length; index++) {
			const rowElement = jq(nodes[index]);

			rowElement.find("#btnSubscriptionsRemove").on("click", settingsPage.uiEvents.onServerSubscriptionRemoveClick);
			rowElement.find("#btnSubscriptionsEdit").on("click", settingsPage.uiEvents.onServerSubscriptionEditClick);
			rowElement.find("#btnServerSubscriptionsViewStats").on("click", settingsPage.uiEvents.onServerSubscriptionViewStatsClick);
		}
	}

	private static insertNewServerSubscriptionInGrid(newSubscription: ProxyServerSubscription) {
		try {
			let row = this.grdServerSubscriptions.row
				.add(newSubscription)
				.draw('full-hold');

			settingsPage.refreshServerSubscriptionsGridRow(row);
		} catch (error) {
			PolyFill.runtimeSendMessage("insertNewServerSubscriptionInGrid failed! > " + error);
			throw error;
		}
	}

	private static loadRulesSubscriptions(pageProfile: SettingsPageSmartProfile, subscriptions: any[]) {
		if (!pageProfile.grdRulesSubscriptions)
			return;

		pageProfile.grdRulesSubscriptions.clear();
		pageProfile.grdRulesSubscriptions.rows.add(subscriptions).draw('full-hold');

		this.refreshRulesSubscriptionsGridAllRows(pageProfile);
	}

	private static readRulesSubscriptions(pageProfile: SettingsPageSmartProfile): ProxyRulesSubscription[] {
		return pageProfile.grdRulesSubscriptions.data().toArray();
	}

	private static readSelectedRulesSubscription(pageProfile: SettingsPageSmartProfile, e?: any): ProxyRulesSubscription {
		let dataItem;

		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child')) {
				pageProfile.grdRulesSubscriptions.rows().deselect();
				dataItem = pageProfile.grdRulesSubscriptions.row(rowElement.prev('tr.parent')).select().data();
			}
			else
				dataItem = pageProfile.grdRulesSubscriptions.row(rowElement).data();
		}
		else
			dataItem = pageProfile.grdRulesSubscriptions.row({ selected: true }).data();

		return dataItem;
	}

	private static readSelectedRulesSubscriptionRow(pageProfile: SettingsPageSmartProfile, e: any): any {
		if (e && e.target) {
			let rowElement = jq(e.target).parents('tr');
			if (rowElement.hasClass('child'))
				return pageProfile.grdRulesSubscriptions.row({ selected: true });
			else
				return pageProfile.grdRulesSubscriptions.row(rowElement);
		}

		return null;
	}

	private static refreshRulesSubscriptionsGrid(pageProfile: SettingsPageSmartProfile) {
		let currentRow = pageProfile.grdRulesSubscriptions.row('.selected');
		if (currentRow && currentRow.data())
			settingsPage.refreshRulesSubscriptionsGridRow(pageProfile, currentRow, true);
		else {
			pageProfile.grdRulesSubscriptions.rows().invalidate();
			settingsPage.refreshRulesSubscriptionsGridAllRows(pageProfile);
		}

		pageProfile.grdRulesSubscriptions.draw('full-hold');
	}

	private static rulesSubscriptionsGridRowBindEvents(pageProfile: SettingsPageSmartProfile, rowElement: any) {
		rowElement.find("#btnRuleSubscriptionsRemove").on("click", (e: any) => settingsPage.uiEvents.onRulesSubscriptionRemoveClick(pageProfile, e));
		rowElement.find("#btnRuleSubscriptionsEdit").on("click", (e: any) => settingsPage.uiEvents.onRulesSubscriptionEditClick(pageProfile, e));
		rowElement.find("#btnRuleSubscriptionsRefresh").on("click", (e: any) => settingsPage.uiEvents.onRulesSubscriptionRefreshClick(pageProfile, e));
		rowElement.find("#btnRuleSubscriptionsViewStats").on("click", (e: any) => settingsPage.uiEvents.onRulesSubscriptionViewStatsClick(pageProfile, e));
	}

	private static refreshRulesSubscriptionsGridRow(pageProfile: SettingsPageSmartProfile, row: any, invalidate: boolean = false) {
		if (!row)
			return;
		if (invalidate)
			row.invalidate();

		let rowElement = jq(row.node());

		settingsPage.rulesSubscriptionsGridRowBindEvents(pageProfile, rowElement);
	}

	private static refreshRulesSubscriptionsGridRowElement(pageProfile: SettingsPageSmartProfile, rowElement: any, invalidate?: any) {
		if (!rowElement)
			return;

		rowElement = jq(rowElement);

		settingsPage.rulesSubscriptionsGridRowBindEvents(pageProfile, rowElement);
	}

	private static refreshRulesSubscriptionsGridAllRows(pageProfile: SettingsPageSmartProfile) {
		var nodes = pageProfile.grdRulesSubscriptions.rows().nodes();
		for (let index = 0; index < nodes.length; index++) {
			const rowElement = jq(nodes[index]);

			settingsPage.rulesSubscriptionsGridRowBindEvents(pageProfile, rowElement);
		}
	}

	private static insertNewRulesSubscriptionInGrid(pageProfile: SettingsPageSmartProfile, newSubscription: ProxyRulesSubscription) {
		try {
			let row = pageProfile.grdRulesSubscriptions.row
				.add(newSubscription)
				.draw('full-hold');

			settingsPage.refreshRulesSubscriptionsGridRow(pageProfile, row);
		} catch (error) {
			PolyFill.runtimeSendMessage("insertNewRulesSubscriptionInGrid failed! > " + error);
			throw error;
		}
	}

private static uiEvents = {
    onClickMenuOffCanvas() {
        settingsPage.hideMenuOffCanvas();
        settingsPage.windowScrollToTop(true);
    },
    onClickSkipWelcome() {
        PolyFill.runtimeSendMessage({
            command: CommandMessages.SettingsPageSkipWelcome
        });
    },
    onGeneralIncognitoProfileFocus() {
        settingsPage.populateIncognitoProfileDropDown();
    },
    onClickSaveGeneralOptions() {
        let generalOptions = settingsPage.readGeneralOptions();
        console.log(`[ProxyMust] onClickSaveGeneralOptions: enableDirectIpDetection = ${generalOptions.enableDirectIpDetection}`);
        const staleHoursInput = jq("#staleHoursInput").val();
        let newStaleHours = parseInt(staleHoursInput as string) || 6;
        if (newStaleHours < 1) newStaleHours = 1;
        if (newStaleHours > 168) newStaleHours = 168;
        if (!settingsPage.currentSettings.userPrefs) {
            settingsPage.currentSettings.userPrefs = { staleHours: newStaleHours, manualSites: [] };
        } else {
            settingsPage.currentSettings.userPrefs.staleHours = newStaleHours;
        }
        if (settingsPage.currentSettings.userPrefs) {
            api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                console.error("[ProxyMust] Failed to save userPrefs in onClickSaveGeneralOptions:", err);
            });
        }
        if (generalOptions.syncWebDavServerEnabled) {
            if (!Utils.isValidUrl(generalOptions.syncWebDavServerUrl)) {
                messageBox.error(api.i18n.getMessage("settingsGeneralWebDav_ErrorValidUrl"));
                return;
            }
            if (generalOptions.syncWebDavBackupFilename.trim() == "") {
                messageBox.error(api.i18n.getMessage("settingsGeneralWebDav_ErrorEmptyFilename"));
                return;
            }
        }

        if (generalOptions.themesLight == themesCustomType) {
            if (!Utils.isValidUrl(generalOptions.themesLightCustomUrl)) {
                messageBox.error(api.i18n.getMessage("settingsGeneralThemesLight_ErrorValidUrl"));
                return;
            }
            if (!Utils.isUrlHttps(generalOptions.themesLightCustomUrl)) {
                messageBox.error(api.i18n.getMessage("settingsGeneralThemesLight_ErrorValidUrl"));
                return;
            }
        }
        if (generalOptions.themesDark == themesCustomType) {
            if (!Utils.isValidUrl(generalOptions.themesDarkCustomUrl)) {
                messageBox.error(api.i18n.getMessage("settingsGeneralThemesDark_ErrorValidUrl"));
                return;
            }
            if (!Utils.isUrlHttps(generalOptions.themesDarkCustomUrl)) {
                messageBox.error(api.i18n.getMessage("settingsGeneralThemesDark_ErrorValidUrl"));
                return;
            }
        }

        PolyFill.runtimeSendMessage(
            {
                command: CommandMessages.SettingsPageSaveOptions,
                options: generalOptions
            },
            (response: ResultHolder) => {
                if (!response) return;
                if (response.success) {
                    if (response.message)
                        messageBox.success(response.message);

                    settingsPage.currentSettings.options = generalOptions;
                    settingsPage.changeTracking.options = false;
                    settingsPage.changeTracking.servers = false;
                    settingsPage.changeTracking.activeProxy = false;
                    settingsPage.changeTracking.smartProfiles = false;
                    settingsPage.changeTracking.newSmartProfile = false;
                    settingsPage.changeTracking.rulesSubscriptions = false;
                    settingsPage.changeTracking.serverSubscriptions = false;
                    if (settingsPage.grdServers) {
                        const enableRating = settingsPage.currentSettings.options.enableRating;
                        settingsPage.grdServers.column(6).visible(enableRating);
                    }
                } else {
                    if (response.message)
                        messageBox.error(response.message);
                }
            },
            (error: Error) => {
                messageBox.error(api.i18n.getMessage("settingsErrorFailedToSaveGeneral") + " " + error.message);
            });
    },
    onClickRejectGeneralOptions() {
        settingsPage.currentSettings.options = jQuery.extend({}, settingsPage.originalSettings.options);
        settingsPage.loadGeneralOptions(settingsPage.currentSettings.options);

        settingsPage.changeTracking.options = false;

        messageBox.info(api.i18n.getMessage("settingsChangesReverted"));
    },
    onSyncSettingsChanged() {
        var checked = jq("#chkSyncSettings").prop("checked")
        if (checked) {
            jq("#chkSyncProxyMode").removeAttr("disabled");
            jq("#chkSyncActiveProxy").removeAttr("disabled");
            jq("#chkSyncToBrowser").removeAttr("disabled");
            jq("#chkSyncToWebDAV").removeAttr("disabled");
            jq("#webDAVFields input,#webDAVFields button").removeAttr("disabled");
        }
        else {
            jq("#chkSyncProxyMode").attr("disabled", "disabled");
            jq("#chkSyncActiveProxy").attr("disabled", "disabled");
            jq("#chkSyncToBrowser").attr("disabled", "disabled");
            jq("#chkSyncToWebDAV").attr("disabled", "disabled");
            jq("#webDAVFields input,#webDAVFields button").attr("disabled", "disabled");
        }
    },
    onSyncDestinationChanged() {
        let isWebDavSelected = jq("#chkSyncToWebDAV").prop("checked");
        if (isWebDavSelected) {
            const webDavDiv = jq("#webDAVFields");
            webDavDiv.hide();
            webDavDiv.removeClass("d-none");
            webDavDiv.slideDown();
        } else {
            jq("#webDAVFields").addClass("d-none");
        }
    },
    onClickWebDavBackupNow() {
        let serverUrl = jq("#txtWebDavServerUrl").val();
        let username = jq("#txtWebDavServerUser").val();
        let password = jq("#txtWebDavServerPassword").val();
        let backupFilename = jq("#txtWebDavBackupFilename").val();

        if (!serverUrl || !username || !password) {
            messageBox.error(api.i18n.getMessage("settingsGeneralWebDav_ErrorRequiredFields"));
            return;
        }

        PolyFill.runtimeSendMessage(
            {
                command: CommandMessages.SettingsPageWebDavBackupNow,
                serverUrl: serverUrl,
                username: username,
                password: password,
                backupFilename: backupFilename,
            },
            (response) => {
                if (response.success) {
                    messageBox.success(api.i18n.getMessage("settingsGeneralWebDavBackupNowSuccess"));
                } else if (!response.success) {
                    messageBox.error(api.i18n.getMessage("settingsGeneralWebDavBackupNowFailed") + " " + response.message);
                }
            }
        );
    },
    onClickWebDavRestoreNow() {
        let serverUrl = jq("#txtWebDavServerUrl").val();
        let username = jq("#txtWebDavServerUser").val();
        let password = jq("#txtWebDavServerPassword").val();
        let backupFilename = jq("#txtWebDavBackupFilename").val();

        if (!serverUrl || !username || !password) {
            messageBox.error(api.i18n.getMessage("settingsGeneralWebDav_ErrorRequiredFields"));
            return;
        }

        messageBox.confirm(api.i18n.getMessage("settingsGeneralWebDavRestoreNowConfirm"),
            () => {
                PolyFill.runtimeSendMessage(
                    {
                        command: CommandMessages.SettingsPageWebDavRestoreNow,
                        serverUrl: serverUrl,
                        username: username,
                        password: password,
                        backupFilename: backupFilename,
                    },
                    (response) => {
                        if (response.success) {
                            messageBox.success(api.i18n.getMessage("settingsGeneralWebDavRestoreNowSuccess"));
                            setTimeout(() => window.location.reload(), 1000);
                        } else if (!response.success) {
                            messageBox.error(api.i18n.getMessage("settingsGeneralWebDavRestoreNowFailed") + " " + response.message);
                        }
                    }
                );
            });
    },
    onClickIgnoreRequestFailuresForDomains() {
        let settings = settingsPage.currentSettings;

        let pageSmartProfile = settingsPage.pageSmartProfiles.find(x => x.smartProfile.profileType == SmartProfileType.IgnoreFailureRules);
        if (pageSmartProfile) {
            settingsPage.showProfileTab(pageSmartProfile);
        }
        else {
            let ignoreProfile = settings.proxyProfiles.find(x => x.profileType == SmartProfileType.IgnoreFailureRules);
            if (ignoreProfile) {
                pageSmartProfile = settingsPage.createProfileContainerAttached(ignoreProfile, false, false);
                settingsPage.pageSmartProfiles.push(pageSmartProfile);

                settingsPage.showProfileTab(pageSmartProfile);
            }
            else {
                ignoreProfile = new SmartProfile();
                ignoreProfile.profileType = SmartProfileType.IgnoreFailureRules;
                ignoreProfile.profileTypeConfig = getSmartProfileTypeConfig(SmartProfileType.IgnoreFailureRules);
                ignoreProfile.profileName = 'Ignore Failure Rules';
                settings.proxyProfiles.push(ignoreProfile);
                ProfileOperations.addUpdateProfile(ignoreProfile);

                pageSmartProfile = settingsPage.createProfileContainerAttached(ignoreProfile, false, false);
                settingsPage.pageSmartProfiles.push(pageSmartProfile);

                settingsPage.showProfileTab(pageSmartProfile);
            }
        }
    },
    onClickViewShortcuts(): boolean {
        if (environment.notSupported.keyboardShortcuts) {
            messageBox.info("Keyboard shortcuts are not supported on mobile devices.");
            return;
        }

        let modal = jq("#modalShortcuts");

        PolyFill.browserCommandsGetAll((commands: any[]) => {
            let content = `<dl>`;
            for (const cmd of commands) {
                content += `<dt>${cmd.description}</dt><dd>${api.i18n.getMessage("settingsGeneralViewShortcutKeys")} : <span class='text-primary'>${cmd.shortcut}</span></dd>`;
            }
            content += `</dl>`;
            modal.find('.modal-body').html(content);

            modal.modal("show");
        });
        return false;
    },
    onClickConfigureShortcuts() {
        PolyFill.openShortcutSettings();
        return false;
    },
    onChangeThemesLight() {
        var value = jq("#cmbThemesLight").val();
        if (value == themesCustomType) {
            jq("#divThemesLightCustom").removeClass('d-none');
        }
        else {
            jq("#divThemesLightCustom").addClass('d-none');
        }
    },
    onChangeThemesDark() {
        var value = jq("#cmbThemesDark").val();
        if (value == themesCustomType) {
            jq("#divThemesDarkCustom").removeClass('d-none');
        }
        else {
            jq("#divThemesDarkCustom").addClass('d-none');
        }
    },
    onRowSelectionChanged(datatable: any, button: any) {
        let len = datatable.rows({ selected: true }).data().length;
        let enable = len > 1;

        settingsPage.enableGridMultipleDelete(button, enable);
    },
    onClickAddNewSmartProfile() {
        let modal = jq("#modalAddNewSmartProfile");
        modal.find("#rbtnNewSmartProfile_SmartRules").prop("checked", true);
    },
    onClickSubmitContinueAddingProfile() {
        let modal = jq("#modalAddNewSmartProfile");
        let profileTypeIsSmartRule = modal.find("#rbtnNewSmartProfile_SmartRules").prop("checked");
        let profileTypeIsAlwaysEnabled = modal.find("#rbtnNewSmartProfile_AlwaysEnabled").prop("checked");

        let profileType: SmartProfileType;

        if (profileTypeIsSmartRule) {
            profileType = SmartProfileType.SmartRules;
        }
        else if (profileTypeIsAlwaysEnabled) {
            profileType = SmartProfileType.AlwaysEnabledBypassRules;
        }
        else {
            messageBox.error(api.i18n.getMessage("settingsProfilesAddErrorTypeRequired"));
            return;
        }

        let pageSmartProfile = settingsPage.createNewUnsavedProfile(profileType);

        settingsPage.showProfileTab(pageSmartProfile);
        settingsPage.updateProfileGridsLayout(pageSmartProfile);
        settingsPage.selectAddNewProfileMenu();

        settingsPage.changeTracking.newSmartProfile = true;
        pageSmartProfile.htmlProfileMenu.one("hidden.bs.tab", () => {
            settingsPage.changeTracking.newSmartProfile = false;
        });
        modal.modal("hide");
    },
    onChangeActiveProxyServer() {
        let proxyServerId = jq("#cmbActiveProxyServer").val();

        let server = settingsPage.findProxyServerById(proxyServerId);

        if (server) {
            settingsPage.currentSettings.defaultProxyServerId = server.id;
            settingsPage.changeTracking.activeProxy = true;
        } else {
            Debug.warn(`Selected ActiveProxyServer ID ${proxyServerId} not found, resetting.`);
            settingsPage.currentSettings.defaultProxyServerId = null;
            settingsPage.changeTracking.activeProxy = true;
            let cmbActiveProxyServer = jq("#cmbActiveProxyServer");
            cmbActiveProxyServer.val(null);
        }
    },
    onClickAddProxyServer() {
        let modal = jq("#modalModifyProxyServer");
        modal.data("editing", null);

        settingsPage.populateServerModal(modal, null);

        modal.modal("show");
        modal.find("#txtServerAddress").focus();
    },
    onClickRemoveMultipleProxyServer() {
        var rows = settingsPage.grdServers.rows({ selected: true });
        if (!rows)
            return;

        const confirmMsg = api.i18n.getMessage("settingsConfirmRemoveMultipleProxyServer");
        if (confirm(confirmMsg)) {
            rows.remove().draw('full-hold');
            settingsPage.changeTracking.servers = true;
            settingsPage.loadDefaultProxyServer();
            settingsPage.enableGridMultipleDelete(jq("#btnRemoveMultipleProxyServer"), false);
        }
    },
    onChangeServerProtocol() {
        settingsPage.populateServerProtocol();
    },
    onClickSubmitProxyServer() {
        let modal = jq("#modalModifyProxyServer");
        let editingModel: ProxyServer = modal.data("editing");

        let serverInputInfo = settingsPage.readServerModel(modal);

        if (!serverInputInfo.name) {
            messageBox.error(api.i18n.getMessage("settingsServerNameRequired"));
            return;
        }

        let editingServerName: string = null;
        if (editingModel)
            editingServerName = editingModel.name;

        let existingServers = settingsPage.readServers();
        let serverExists = existingServers.some(server => {
            return (server.name === serverInputInfo.name && server.name != editingServerName);
        });
        if (serverExists) {
            messageBox.error(api.i18n.getMessage("settingsServerNameExists"));
            return;
        }

        if (!serverInputInfo.host) {
            messageBox.error(api.i18n.getMessage("settingsServerServerAddressIsEmpty"));
            return;
        }
        if (!serverInputInfo.port || serverInputInfo.port <= 0 || serverInputInfo.port > 65535) {
            messageBox.error(api.i18n.getMessage("settingsServerPortNoInvalid"));
            return;
        }

        if (!serverInputInfo.username && serverInputInfo.password) {
            messageBox.error(api.i18n.getMessage("settingsServerAuthenticationInvalid"));
            return;
        }

        if (editingModel) {
            const proxyServerId = editingModel.id;
            jQuery.extend(editingModel, serverInputInfo);
            editingModel.id = proxyServerId;

            settingsPage.refreshServersGrid();
        } else {
            settingsPage.insertNewServerInGrid(serverInputInfo);
        }

        settingsPage.changeTracking.servers = true;

        modal.modal("hide");

        settingsPage.loadDefaultProxyServer();
    },
    onServersEditClick(e: any) {
        let item = settingsPage.readSelectedServer(e);
        if (!item)
            return;

        let modal = jq("#modalModifyProxyServer");
        modal.data("editing", item);

        settingsPage.populateServerModal(modal, item);

        modal.modal("show");
        modal.find("#txtServerAddress").focus();
    },
    onServersRemoveClick(e: any) {
        var row = settingsPage.readSelectedServerRow(e);
        if (!row)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveProxyServer"),
            () => {
                row.remove().draw('full-hold');

                settingsPage.changeTracking.servers = true;

                settingsPage.loadDefaultProxyServer();
            });
    },
    onClickSaveProxyServers() {
        jq("#cmbActiveProxyServer").trigger("change");
        let saveData = {
            proxyServers: settingsPage.readServers(),
            defaultProxyServerId: settingsPage.currentSettings.defaultProxyServerId
        };

        PolyFill.runtimeSendMessage(
            {
                command: CommandMessages.SettingsPageSaveProxyServers,
                saveData: saveData
            },
            (response: ResultHolder) => {
                if (!response) return;
                if (response.success) {
                    if (response.message)
                        messageBox.success(response.message);

                    settingsPage.currentSettings.proxyServers = saveData.proxyServers;
                    settingsPage.currentSettings.defaultProxyServerId = saveData.defaultProxyServerId;

                    settingsPage.changeTracking.servers = false;
                    settingsPage.changeTracking.activeProxy = false;
                    settingsPage.changeTracking.options = false;
                    settingsPage.changeTracking.smartProfiles = false;
                    settingsPage.changeTracking.newSmartProfile = false;
                    settingsPage.changeTracking.rulesSubscriptions = false;
                    settingsPage.changeTracking.serverSubscriptions = false;
                } else {
                    if (response.message)
                        messageBox.error(response.message);
                }
            },
            (error: Error) => {
                messageBox.error(api.i18n.getMessage("settingsErrorFailedToSaveServers") + " " + error.message);
            });
    },
    onClickRejectProxyServers() {
        settingsPage.currentSettings.proxyServers = settingsPage.originalSettings.proxyServers.slice();
        settingsPage.loadServersGrid(settingsPage.currentSettings.proxyServers);
        settingsPage.loadDefaultProxyServer();

        settingsPage.changeTracking.servers = false;

        messageBox.info(api.i18n.getMessage("settingsChangesReverted"));
    },
    onClickClearProxyServers() {
        messageBox.confirm(api.i18n.getMessage("settingsRemoveAllProxyServers"),
            () => {
                settingsPage.loadServersGrid([]);
                settingsPage.loadDefaultProxyServer();

                settingsPage.changeTracking.servers = true;

                messageBox.info(api.i18n.getMessage("settingsRemoveAllProxyServersSuccess"));
            });
    },
    onClickAddMultipleProxyRule(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalAddMultipleRules");
        modal.data("editing", null);

        modal.find("#cmdMultipleRuleType").val(0);
        modal.find("#txtMultipleRuleList").val("");

        settingsPage.populateRuleModal(pageProfile, modal, null);

        modal.modal("show");
        modal.find("#txtMultipleRuleList").focus();
    },
    onClickRemoveMultipleProxyRule(pageProfile: SettingsPageSmartProfile) {
        var rows = pageProfile.grdRules.rows({ selected: true });
        if (!rows)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveMultipleProxyRule"),
            () => {
                rows.remove().draw('full-hold');
                settingsPage.changeTracking.smartProfiles = true;
                settingsPage.enableGridMultipleDelete(
                    pageProfile.htmlProfileTab.find("#btnRemoveMultipleProxyRule"), false);
            });
    },
    onClickSubmitMultipleRule(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalAddMultipleRules");

        let selectedProxyId = modal.find("#cmdRuleProxyServer").val();
        let selectedProxy = null;

        if (selectedProxyId)
            selectedProxy = settingsPage.findProxyServerById(selectedProxyId);

        let whiteList = parseInt(modal.find("#cmdRuleAction").val()) != 0;

        let ruleType = +modal.find("#cmdMultipleRuleType").val();
        let rulesStr = modal.find("#txtMultipleRuleList").val();

        let ruleList = rulesStr.split(/[\r\n]+/);
        let resultRuleList: ProxyRule[] = [];

        let existingRules = settingsPage.readRules(pageProfile);
        for (let ruleLine of ruleList) {
            if (!ruleLine)
                continue;
            ruleLine = ruleLine.trim().toLowerCase();
            let hostName: string;
            let newRule = new ProxyRule();

            if (ruleType == ProxyRuleType.Exact) {
                if (!Utils.isValidUrl(ruleLine)) {
                    messageBox.error(
                        api.i18n.getMessage("settingsRuleExactUrlInvalid").replace("{0}", ruleLine)
                    );
                    return;
                }
                newRule.ruleExact = ruleLine;
                hostName = Utils.extractHostFromUrl(ruleLine);
            }
            else if (ruleType == ProxyRuleType.MatchPatternHost) {
                let ruleLineNormalized = ruleLine;
                if (!Utils.urlHasSchema(ruleLineNormalized))
                    ruleLineNormalized = "http://" + ruleLineNormalized;

                hostName = Utils.extractHostFromUrl(ruleLineNormalized);

                if (!Utils.isNotInternalHostName(hostName)) {
                    messageBox.error(api.i18n.getMessage("settingsMultipleRuleInvalidHost").replace("{0}", hostName || ruleLine));
                    return;
                }

                newRule.rulePattern = Utils.hostToMatchPattern(hostName, false);
            }
            else if (ruleType == ProxyRuleType.MatchPatternUrl) {
                if (!Utils.isValidUrl(ruleLine)) {
                    messageBox.error(api.i18n.getMessage("settingsRuleUrlInvalid").replace("{0}", ruleLine));
                    return;
                }

                hostName = Utils.extractHostFromUrl(ruleLine);
                newRule.rulePattern = Utils.hostToMatchPattern(ruleLine, true);
            }
            else {
                continue;
            }

            let ruleExists = existingRules.some(rule => {
                return (rule.hostName === hostName);
            });

            if (ruleExists)
                continue;

            newRule.autoGeneratePattern = true;
            newRule.enabled = true;
            newRule.proxy = null;
            newRule.hostName = hostName;
            newRule.ruleType = ruleType;
            newRule.proxy = selectedProxy;
            newRule.proxyServerId = selectedProxyId;
            newRule.whiteList = whiteList;

            resultRuleList.push(newRule);
        }

        if (!resultRuleList.length) {
            messageBox.error(api.i18n.getMessage("settingsMultipleRuleNoNewRuleAdded"));
            return;
        }

        settingsPage.insertNewRuleListInGrid(pageProfile, resultRuleList);
        settingsPage.changeTracking.smartProfiles = true;

        modal.modal("hide");
    },
    onClickAddProxyRule(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalModifyRule");
        modal.data("editing", null);

        settingsPage.populateRuleModal(pageProfile, modal, null);

        modal.modal("show");
        modal.find("#txtRuleSource").focus();
    },
    onClickImportRulesOpenDialog(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalImportRules");
        modal.data("editing", null);

        modal.modal("show");
        modal.find("#txtRuleSource").focus();

        resetModal();

        function resetModal() {
            var file = modal.find("#rbtnImportRulesSelect_File");
            var text = modal.find("#rbtnImportRulesSelect_Text");
            if (!file.prop("checked") && !text.prop("checked")) {
                file.prop("checked", true);
            }
            modal.find("#txtImportRulesSelectText").val("");

            let append = modal.find("#cmbImportRulesOverride_Append");
            let replace = modal.find("#cmbImportRulesOverride_Replace");
            if (!append.prop("checked") && !replace.prop("checked")) {
                append.prop("checked", true);
            }
        }
    },
    onClickImportRules(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;
        let modalContainer = tabContainer.find("#modalImportRules");
        let selectFileElement = modalContainer.find("#btnImportRulesSelectFile")[0];
        let file, text;

        if (modalContainer.find("#rbtnImportRulesSelect_File").prop("checked")) {
            if (selectFileElement.files.length == 0) {
                messageBox.error(api.i18n.getMessage("settingsRulesFileNotSelected"));
                return;
            }
            file = selectFileElement.files[0];
        } else {
            let proxyServerListText: string = modalContainer.find("#txtImportRulesSelectText").val().trim();
            if (proxyServerListText == "") {
                messageBox.error(api.i18n.getMessage("settingsImportRulesTextIsEmpty"));
                return;
            }
            text = proxyServerListText;
        }
        let append = modalContainer.find("#cmbImportRulesOverride_Append").prop("checked");
        let sourceType: ExternalRulesFormat = +modalContainer.find("#cmbImportRulesFormat").val();
        let proxyRules = settingsPage.readRules(pageProfile);

        let config = new ProxyRulesImportFromUI();
        config.format = sourceType;

        if (sourceType != ExternalRulesFormat.AutoProxy &&
            sourceType != ExternalRulesFormat.SwitchyOmega) {
            messageBox.warning(api.i18n.getMessage("settingsSourceTypeNotSelected"));
            return;
        }

        RuleImporter.importRulesBatch(
            config,
            text,
            file,
            append,
            proxyRules,
            (importResult: {
                success: boolean;
                message: string;
                rules: {
                    whiteList: ImportedProxyRule[];
                    blackList: ImportedProxyRule[];
                };
            }) => {
                if (!importResult) return;

                if (importResult.success) {
                    if (importResult.message)
                        messageBox.success(importResult.message);

                    selectFileElement.value = "";

                    doImport(importResult.rules);

                    modalContainer.modal("hide");
                }
                else {
                    if (importResult.message)
                        messageBox.error(importResult.message);
                }
            },
            (error: Error) => {
                let message = "";
                if (error && error.message)
                    message = error.message;
                messageBox.error(api.i18n.getMessage("settingsImportRulesFailed") + " " + message);
            });

        function doImport(rules: {
            whiteList: ImportedProxyRule[];
            blackList: ImportedProxyRule[];
        }) {
            let finalRules: ProxyRule[];
            let mappedBlackRules = rules.blackList.map((rule) => rule.getProxyRule());
            let mappedWhiteRules = rules.whiteList.map((rule) => {
                let newRule = rule.getProxyRule();
                newRule.whiteList = true;
                return newRule;
            });

            if (append) {
                finalRules = proxyRules.concat(mappedBlackRules).concat(mappedWhiteRules);
            }
            else
                finalRules = mappedBlackRules.concat(mappedWhiteRules);

            settingsPage.loadRules(pageProfile, finalRules);
        }
    },
    onChangeRuleGeneratePattern(pageProfile: SettingsPageSmartProfile) {
        settingsPage.updateProxyRuleModal(pageProfile.htmlProfileTab);
    },
    onChangeRuleType(pageProfile: SettingsPageSmartProfile) {
        settingsPage.updateProxyRuleModal(pageProfile.htmlProfileTab);
    },
    onChangeRuleAction(pageProfile: SettingsPageSmartProfile) {
        settingsPage.updateProxyRuleModal(pageProfile.htmlProfileTab);
    },
    onClickSubmitProxyRule(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalModifyRule");
        let editingModel: ProxyRule = modal.data("editing");

        let ruleInfo = settingsPage.readProxyRuleModel(modal);
        let hostName = ruleInfo.hostName;

        function checkHostName(): boolean {
            if (!hostName) {
                messageBox.error(api.i18n.getMessage("settingsRuleSourceRequired"));
                return false;
            }
            return true;
        }

        if (hostName) {
            if (!Utils.isNotInternalHostName(hostName)) {
                messageBox.error(api.i18n.getMessage("settingsRuleSourceInvalid"));
                return;
            }

            let checkHostName = hostName;
            if (!Utils.urlHasSchema(hostName)) {
                checkHostName = "http://" + hostName;
            }

            let extractedHost = Utils.extractHostFromUrl(checkHostName);
            if (extractedHost == null || !Utils.isNotInternalHostName(extractedHost)) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleHostInvalid")
                        .replace("{0}", extractedHost || hostName)
                );
                return;
            }
            hostName = extractedHost;
        }
        ruleInfo.hostName = hostName;

        if (ruleInfo.ruleType == ProxyRuleType.MatchPatternHost) {
            if (ruleInfo.autoGeneratePattern) {
                if (!checkHostName())
                    return;

                ruleInfo.rulePattern = Utils.hostToMatchPattern(hostName, false);
            }
            else if (hostName && !ruleInfo.rulePattern.includes(hostName)) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleDoesntIncludeDomain").replace("{0}", hostName)
                );
                return;
            }
        }
        else if (ruleInfo.ruleType == ProxyRuleType.MatchPatternUrl) {
            if (ruleInfo.autoGeneratePattern) {
                if (!checkHostName())
                    return;

                ruleInfo.rulePattern = Utils.hostToMatchPattern(hostName, true);
            }
            else if (hostName && !ruleInfo.rulePattern.includes(hostName)) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleDoesntIncludeDomain").replace("{0}", hostName)
                );
                return;
            }
        }
        else if (ruleInfo.ruleType == ProxyRuleType.RegexHost) {
            try {
                if (!ruleInfo.ruleRegex) {
                    messageBox.error(
                        api.i18n.getMessage("settingsRuleRegexInvalid").replace("{0}", ruleInfo.ruleRegex)
                    );
                    return;
                }

                let regex = new RegExp(ruleInfo.ruleRegex);
                if (hostName) {
                    if (!regex.test(hostName)) {
                        messageBox.error(
                            api.i18n.getMessage("settingsRuleRegexNotMatchDomain").replace("{0}", hostName)
                        );
                        return;
                    }
                }
            } catch (error) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleRegexInvalid").replace("{0}", ruleInfo.ruleRegex)
                );
                return;
            }
        }
        else if (ruleInfo.ruleType == ProxyRuleType.RegexUrl) {
            try {
                if (!ruleInfo.ruleRegex) {
                    messageBox.error(
                        api.i18n.getMessage("settingsRuleRegexInvalid").replace("{0}", ruleInfo.ruleRegex)
                    );
                    return;
                }

                let regex = new RegExp(ruleInfo.ruleRegex);

                if (hostName) {
                    if (!regex.test(hostName)) {
                        messageBox.error(
                            api.i18n.getMessage("settingsRuleRegexNotMatchDomain").replace("{0}", hostName)
                        );
                        return;
                    }
                }
            } catch (error) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleRegexInvalid").replace("{0}", ruleInfo.ruleRegex)
                );
                return;
            }
        }
        else if (ruleInfo.ruleType == ProxyRuleType.IpCidrNotation) {
            let ipAddress = ruleInfo.ruleSearch;
            let prefixLength = ruleInfo.rulePattern;
            ruleInfo.hostName = hostName || ipAddress;

            try {
                if (!ipAddress || !modal.find("#txtRuleCidrIPAddress")[0].checkValidity()) {
                    messageBox.error(
                        api.i18n.getMessage("settingsRuleCidrIPInvalid").replace("{0}", ipAddress)
                    );
                    return;
                }
                if (!prefixLength || !modal.find("#txtRuleCidrPrefixLength")[0].checkValidity()) {
                    messageBox.error(
                        api.i18n.getMessage("settingsRuleCidrPrefixLengthInvalid").replace("{0}", prefixLength)
                    );
                    return;
                }

                let regex = Utils.ipCidrNotationToRegExp(ipAddress, prefixLength);
                if (!regex) {
                    messageBox.error(
                        api.i18n.getMessage("settingsRuleCidrNotationInvalid").replace("{0}", ipAddress + "/" + prefixLength)
                    );
                    return;
                }

                if (hostName) {
                    let testHost = Utils.normalizeIpForMatching(hostName);
                    if (!regex.test(testHost)) {
                        messageBox.error(
                            api.i18n.getMessage("settingsRuleCidrNotationInvalidMatch").replace("{0}", hostName)
                        );
                        return;
                    }
                }
            } catch (error) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleCidrNotationInvalid").replace("{0}", ipAddress + "/" + prefixLength)
                );
                return;
            }
        }
        else if (ruleInfo.ruleType == ProxyRuleType.DomainSubdomain ||
            ruleInfo.ruleType == ProxyRuleType.DomainSubdomainAndPath ||
            ruleInfo.ruleType == ProxyRuleType.DomainAndPath ||
            ruleInfo.ruleType == ProxyRuleType.DomainExact ||
            ruleInfo.ruleType == ProxyRuleType.SearchUrl) {
            if (!checkHostName())
                return;

            ruleInfo.ruleSearch = hostName;
        }
        else {
            if (!Utils.isValidUrl(ruleInfo.ruleExact)) {
                messageBox.error(
                    api.i18n.getMessage("settingsRuleExactUrlInvalid").replace("{0}", ruleInfo.ruleExact)
                );
                return;
            }
        }

        let editingSource: string = null;
        if (editingModel)
            editingSource = editingModel.hostName;

        let existingRules = settingsPage.readRules(pageProfile);
        let ruleExists = false;
        if (hostName)
            ruleExists = existingRules.some(rule => {
                return (rule.hostName === hostName && rule.hostName != editingSource);
            });

        if (ruleExists) {
            messageBox.error(api.i18n.getMessage("settingsRuleSourceAlreadyExists"));
            return;
        }

        if (!editingModel) {
            do {
                ruleExists = existingRules.some(rule => {
                    return (rule.ruleId === ruleInfo.ruleId);
                });

                if (ruleExists)
                    ruleInfo.ruleId = Utils.getNewUniqueIdNumber();
            } while (ruleExists);
        }

        if (editingModel) {
            jQuery.extend(editingModel, ruleInfo);
            settingsPage.refreshRulesGrid(pageProfile);
        } else {
            settingsPage.insertNewRuleInGrid(pageProfile, ruleInfo);
        }

        settingsPage.changeTracking.smartProfiles = true;
        modal.modal("hide");
    },
    onRulesEditClick(pageProfile: SettingsPageSmartProfile, e: any) {
        let item = settingsPage.readSelectedRule(pageProfile, e);
        if (!item)
            return;
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalModifyRule");
        modal.data("editing", item);

        settingsPage.populateRuleModal(pageProfile, modal, item);

        modal.modal("show");
        modal.find("#txtRuleSource").focus();
    },
    onRuleEnabledToggleChange(pageProfile: SettingsPageSmartProfile, e: any) {
        const checkbox = jq(e.target);
        const isEnabled = checkbox.prop('checked');

        const row = pageProfile.grdRules.row(checkbox.closest('tr'));
        const ruleData: ProxyRule = row.data();

        if (ruleData) {
            ruleData.enabled = isEnabled;
            settingsPage.changeTracking.smartProfiles = true;
            settingsPage.refreshRulesGridRow(pageProfile, row);
        }
    },
    onRulesRemoveClick(pageProfile: SettingsPageSmartProfile, e: any) {
        var row = settingsPage.readSelectedRuleRow(pageProfile, e);
        if (!row)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveProxyRule"),
            () => {
                row.remove().draw('full-hold');
                settingsPage.changeTracking.smartProfiles = true;
            });
    },
    onClickClearProxyRules(pageProfile: SettingsPageSmartProfile) {
        messageBox.confirm(api.i18n.getMessage("settingsRemoveAllRules"),
            () => {
                settingsPage.loadRules(pageProfile, []);
                settingsPage.changeTracking.smartProfiles = true;
                messageBox.info(api.i18n.getMessage("settingsRemoveAllRulesSuccess"));
            });
    },
    onProfileNameClick(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;
        settingsPage.showProfileNameEdit(tabContainer);
    },
    onClickSaveSmartProfile(pageProfile: SettingsPageSmartProfile) {
        let smartProfileModel = settingsPage.readSmartProfile(pageProfile);
        let smartProfile = pageProfile.smartProfile;
        Object.assign(smartProfile, smartProfileModel);

        if (smartProfile.profileName.trim() == '') {
            messageBox.error(api.i18n.getMessage("settingsProfilesAddErrorNameRequired"));
            return;
        }

        if (settingsPage.currentSettings.proxyProfiles.find(x => x.profileName == smartProfile.profileName &&
            x.profileId != smartProfile.profileId) != null) {
            messageBox.error(api.i18n.getMessage("settingsProfilesAddErrorNameExists"));
            return;
        }

        PolyFill.runtimeSendMessage(
            {
                command: CommandMessages.SettingsPageSaveSmartProfile,
                smartProfile: smartProfile
            },
            (response: any) => {
                if (!response) return;
                if (response.success) {
                    if (response.message)
                        messageBox.success(response.message);
                    let updatedProfile: SmartProfile = response.smartProfile || smartProfile;

                    settingsPage.changeTracking.smartProfiles = false;
                    settingsPage.changeTracking.rulesSubscriptions = false;
                    settingsPage.changeTracking.options = false;
                    settingsPage.changeTracking.servers = false;
                    settingsPage.changeTracking.activeProxy = false;
                    settingsPage.changeTracking.newSmartProfile = false;
                    settingsPage.changeTracking.serverSubscriptions = false;

                    if (smartProfile.profileId || smartProfile.profileType == SmartProfileType.IgnoreFailureRules) {
                        settingsPage.updateProfileMenuName(pageProfile);
                    }
                    else {
                        settingsPage.currentSettings.proxyProfiles.push(updatedProfile);
                        settingsPage.removeUnsavedProfileAndReload(pageProfile, updatedProfile);
                    }
                } else {
                    if (response.message)
                        messageBox.error(response.message);
                }
            },
            (error: Error) => {
                messageBox.error(api.i18n.getMessage("settingsErrorFailedToSaveSmartProfile") + " " + error.message);
            });
    },
    saveUnsavedSmartProfile() {
        let unsavedSmartProfileElement = jq(".tab-smart-profile-item" + ".tab-new-unsaved-smart-profile-item:visible");
        if (!unsavedSmartProfileElement.length)
            return;

        let saveButton = unsavedSmartProfileElement.find("#btnSaveSmartProfile");
        saveButton.trigger('click');
    },
    onClickRejectSmartProfile(pageProfile: SettingsPageSmartProfile) {
    },
    onClickDeleteSmartProfile(pageProfile: SettingsPageSmartProfile) {
        let profile = pageProfile.smartProfile;
        if (!profile.profileId)
            return;

        if (profile.profileTypeConfig.builtin)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsProfilesDeleteConfirm"),
            () => {
                PolyFill.runtimeSendMessage(
                    {
                        command: CommandMessages.SettingsPageDeleteSmartProfile,
                        smartProfileId: profile.profileId
                    },
                    (response: any) => {
                        if (!response) return;
                        if (response.success) {
                            if (response.message)
                                messageBox.success(response.message);

                            settingsPage.removePageProfileAndReset(pageProfile);
                        } else {
                            if (response.message)
                                messageBox.error(response.message);
                        }
                    },
                    (error: Error) => {
                        messageBox.error(api.i18n.getMessage("settingsProfilesDeleteFailed") + " " + error.message);
                    });
            });
    },
    onClickAddServerSubscription() {
        let modal = jq("#modalServerSubscription");
        modal.data("editing", null);

        settingsPage.populateServerSubscriptionsModal(modal, null);

        modal.modal("show");

        function focusUrl() {
            modal.off("shown.bs.modal", focusUrl);
            modal.find("#txtUrl").focus();
        }

        modal.on("shown.bs.modal", focusUrl);
    },
    onClickRemoveMultipleServerSubscription() {
        var rows = settingsPage.grdServerSubscriptions.rows({ selected: true });
        if (!rows)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveMultipleServerSubscription"),
            () => {
                rows.remove().draw('full-hold');

                settingsPage.changeTracking.serverSubscriptions = true;
                settingsPage.enableGridMultipleDelete(jq("#btnRemoveMultipleServerSubscription"), false);
            });
    },
    onServerSubscriptionEditClick(e: any) {
        let item = settingsPage.readSelectedServerSubscription(e);
        if (!item)
            return;

        let modal = jq("#modalServerSubscription");
        modal.data("editing", item);

        settingsPage.populateServerSubscriptionsModal(modal, item);

        modal.modal("show");
    },
    onServerSubscriptionRemoveClick(e: any) {
        var row = settingsPage.readSelectedServerSubscriptionRow(e);
        if (!row)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveServerSubscription"),
            () => {
                row.remove().draw('full-hold');
                settingsPage.changeTracking.serverSubscriptions = true;
            });
    },
    onServerSubscriptionViewStatsClick(e: any) {
        let status = e.currentTarget?.title;
        if (status) {
            status = status.replaceAll('\r\n', '<br\>').replaceAll('\n', '<br\>');
            messageBox.info(status);
        }
    },
    onClickSaveServerSubscription() {
        let modal = jq("#modalServerSubscription");

        if (!modal.find("form")[0].checkValidity()) {
            messageBox.error(api.i18n.getMessage("settingsServerSubscriptionIncompleteForm"));
            return;
        }
        let subscriptionModel = settingsPage.readServerSubscriptionModel(modal);
        if (!subscriptionModel) {
            messageBox.error(api.i18n.getMessage("settingsServerSubscriptionInvalidForm"));
            return;
        }

        let subscriptionsList = settingsPage.readServerSubscriptions();
        let editingSubscription = modal.data("editing");
        let editingName = "";
        if (editingSubscription)
            editingName = editingSubscription.name;

        if (editingSubscription) {
            let nameIsDuplicate = false;
            for (let item of subscriptionsList) {
                if (item.name == subscriptionModel.name && subscriptionModel.name != editingName) {
                    nameIsDuplicate = true;
                }
            }
            if (subscriptionModel.name != editingName)
                if (nameIsDuplicate) {
                    messageBox.error(api.i18n.getMessage("settingsServerSubscriptionDuplicateName"));
                    return;
                }
        }

        if (!subscriptionModel.stats) {
            subscriptionModel.stats = new SubscriptionStats();
        }

        jq("#btnSaveServerSubscription").attr("data-loading-text", api.i18n.getMessage("settingsServerSubscriptionSavingButton"));
        jq("#btnSaveServerSubscription").button("loading");

        // Temporarily switch to Direct to fetch the list
        settingsPage.temporarilySwitchToDirect(async () => {
            return new Promise((resolve, reject) => {
                ProxyImporter.readFromServer(subscriptionModel,
                    (response: {
                        success: boolean,
                        message: string,
                        result: ProxyServer[]
                    }) => {
                        jq("#btnSaveServerSubscription").button('reset');

                        if (response.success) {
                            let count = response.result.length;

                            if (subscriptionModel.enabled)
                                subscriptionModel.proxies = response.result;
                            else
                                subscriptionModel.proxies = [];
                            subscriptionModel.totalCount = count;
                            SubscriptionStats.updateStats(subscriptionModel.stats, true);

                            if (editingSubscription) {
                                jQuery.extend(editingSubscription, subscriptionModel);
                                settingsPage.refreshServerSubscriptionsGrid();
                                messageBox.success(api.i18n.getMessage("settingsServerSubscriptionSaveUpdated").replace("{0}", count));
                            } else {
                                settingsPage.insertNewServerSubscriptionInGrid(subscriptionModel);
                                messageBox.success(api.i18n.getMessage("settingsServerSubscriptionSaveAdded").replace("{0}", count));
                            }

                            settingsPage.changeTracking.serverSubscriptions = true;
                            settingsPage.loadDefaultProxyServer();
                            modal.modal("hide");

                            // Auto-save subscription changes
                            settingsPage.uiEvents.onClickSaveServerSubscriptionsChanges();
                            resolve(undefined);
                        } else {
                            SubscriptionStats.updateStats(subscriptionModel.stats, false);
                            messageBox.error(api.i18n.getMessage("settingsServerSubscriptionSaveFailedGet"));
                            reject(response.message);
                        }
                    },
                    (errorResult) => {
                        SubscriptionStats.updateStats(subscriptionModel.stats, false, errorResult);
                        messageBox.error(api.i18n.getMessage("settingsServerSubscriptionSaveFailedGet"));
                        jq("#btnSaveServerSubscription").button('reset');
                        reject(errorResult);
                    });
            });
        }).catch(() => {});
    },
    onClickTestServerSubscription() {
        let modal = jq("#modalServerSubscription");

        if (!modal.find("form")[0].checkValidity()) {
            messageBox.error(api.i18n.getMessage("settingsServerSubscriptionIncompleteForm"));
            return;
        }

        let subscriptionModel = settingsPage.readServerSubscriptionModel(modal);

        if (!subscriptionModel) {
            messageBox.error(api.i18n.getMessage("settingsServerSubscriptionInvalidForm"));
            return;
        }

        jq("#btnTestServerSubscription").attr("data-loading-text", api.i18n.getMessage("settingsServerSubscriptionTestingButton"));
        jq("#btnTestServerSubscription").button("loading");

        var applyProxyMode = subscriptionModel.applyProxy;
        subscriptionModel.applyProxy = null;

        // Temporarily switch to Direct to test
        settingsPage.temporarilySwitchToDirect(async () => {
            return new Promise((resolve, reject) => {
                PolyFill.runtimeSendMessage(
                    {
                        command: CommandMessages.SettingsPageMakeRequestSpecial,
                        url: subscriptionModel.url,
                        applyProxy: applyProxyMode,
                        selectedProxy: null
                    },
                    (response: any) => {
                        if (!response || !response.success) {
                            if (response && response.message)
                                messageBox.error(response.message);
                            jq("#btnTestServerSubscription").button('reset');
                            reject(response?.message || "Request failed");
                            return;
                        }
                        if (response.message)
                            messageBox.success(response.message);

                        ProxyImporter.readFromServer(subscriptionModel,
                            (response: {
                                success: boolean,
                                message: string,
                                result: ProxyServer[]
                            }) => {
                                jq("#btnTestServerSubscription").button('reset');

                                if (response.success) {
                                    let count = response.result.length;
                                    messageBox.success(api.i18n.getMessage("settingsServerSubscriptionTestSuccess").replace("{0}", count));
                                    resolve(undefined);
                                } else {
                                    messageBox.error(api.i18n.getMessage("settingsServerSubscriptionTestFailed"));
                                    reject(response.message);
                                }
                            },
                            () => {
                                messageBox.error(api.i18n.getMessage("settingsServerSubscriptionTestFailed"));
                                jq("#btnTestServerSubscription").button('reset');
                                reject("Test failed");
                            });
                    },
                    (error: Error) => {
                        messageBox.error(api.i18n.getMessage("settingsServerSubscriptionTestFailed"));
                        jq("#btnTestServerSubscription").button('reset');
                        reject(error);
                    });
            });
        }).catch(() => {});
    },
    onClickSaveServerSubscriptionsChanges() {
        let proxyServerSubscriptions = settingsPage.readServerSubscriptions();

        PolyFill.runtimeSendMessage(
            {
                command: CommandMessages.SettingsPageSaveProxySubscriptions,
                proxyServerSubscriptions: proxyServerSubscriptions
            },
            (response: any) => {
                if (!response) return;
                if (response.success) {
                    if (response.message)
                        messageBox.success(response.message);

                    settingsPage.currentSettings.proxyServerSubscriptions = proxyServerSubscriptions;
                    settingsPage.changeTracking.serverSubscriptions = false;
                    settingsPage.changeTracking.options = false;
                    settingsPage.changeTracking.servers = false;
                    settingsPage.changeTracking.activeProxy = false;
                    settingsPage.changeTracking.smartProfiles = false;
                    settingsPage.changeTracking.newSmartProfile = false;
                    settingsPage.changeTracking.rulesSubscriptions = false;
                    settingsPage.loadDefaultProxyServer();
                } else {
                    if (response.message)
                        messageBox.error(response.message);
                }
            },
            (error: Error) => {
                messageBox.error(api.i18n.getMessage("settingsFailedToSaveProxySubscriptions") + " " + error.message);
            });
    },
    onClickRejectServerSubscriptionsChanges() {
        settingsPage.currentSettings.proxyServerSubscriptions = settingsPage.originalSettings.proxyServerSubscriptions.slice();
        settingsPage.loadServerSubscriptionsGrid(settingsPage.currentSettings.proxyServerSubscriptions);
        settingsPage.loadDefaultProxyServer();

        settingsPage.changeTracking.serverSubscriptions = false;

        messageBox.info(api.i18n.getMessage("settingsChangesReverted"));
    },
    onClickClearServerSubscriptions() {
        messageBox.confirm(api.i18n.getMessage("settingsRemoveAllProxyServerSubscriptions"),
            () => {
                settingsPage.loadServerSubscriptionsGrid([]);
                settingsPage.loadDefaultProxyServer();

                settingsPage.changeTracking.serverSubscriptions = true;

                messageBox.info(api.i18n.getMessage("settingsRemoveAllProxyServerSubscriptionsSuccess"));
            });
    },
    onClickAddRulesSubscription(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalRulesSubscription");
        modal.data("editing", null);

        settingsPage.populateRulesSubscriptionsModal(pageProfile, modal, null);

        modal.modal("show");

        function focusUrl() {
            modal.off("shown.bs.modal", focusUrl);
            modal.find("#txtUrl").focus();
        }

        modal.on("shown.bs.modal", focusUrl);
    },
    onClickRemoveMultipleRulesSubscription(pageProfile: SettingsPageSmartProfile) {
        var rows = pageProfile.grdRulesSubscriptions.rows({ selected: true });
        if (!rows)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveMultipleRulesSubscription"),
            () => {
                rows.remove().draw('full-hold');
                settingsPage.changeTracking.rulesSubscriptions = true;

                settingsPage.enableGridMultipleDelete(
                    pageProfile.htmlProfileTab.find("#btnRemoveMultipleRulesSubscription"), false);
            });
    },
    onRulesSubscriptionEditClick(pageProfile: SettingsPageSmartProfile, e: any) {
        let item = settingsPage.readSelectedRulesSubscription(pageProfile, e);
        if (!item)
            return;

        let tabContainer = pageProfile.htmlProfileTab;

        let modal = tabContainer.find("#modalRulesSubscription");
        modal.data("editing", item);

        settingsPage.populateRulesSubscriptionsModal(pageProfile, modal, item);

        modal.modal("show");
    },
    onRulesSubscriptionRemoveClick(pageProfile: SettingsPageSmartProfile, e: any) {
        var row = settingsPage.readSelectedRulesSubscriptionRow(pageProfile, e);
        if (!row)
            return;

        messageBox.confirm(api.i18n.getMessage("settingsConfirmRemoveRulesSubscription"),
            () => {
                row.remove().draw('full-hold');
                settingsPage.changeTracking.rulesSubscriptions = true;
            });
    },
    onRulesSubscriptionRefreshClick(pageProfile: SettingsPageSmartProfile, e: any) {
        var row = settingsPage.readSelectedRulesSubscriptionRow(pageProfile, e);
        if (!row)
            return;
        let editingSubscription = settingsPage.readSelectedRulesSubscription(pageProfile, e);
        if (!editingSubscription)
            return;
        if (!editingSubscription.enabled) {
            messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionRefreshOnDisabled"));
            return;
        }

        if (!editingSubscription.stats) {
            editingSubscription.stats = new SubscriptionStats();
        }

        RuleImporter.readFromServerAndImport(editingSubscription,
            (importResult: {
                success: boolean;
                message: string;
                rules: {
                    whiteList: ImportedProxyRule[];
                    blackList: ImportedProxyRule[];
                };
            }) => {
                if (importResult.success) {
                    let count = importResult.rules.blackList.length + importResult.rules.whiteList.length;

                    if (editingSubscription.enabled) {
                        editingSubscription.proxyRules = importResult.rules.blackList;
                        editingSubscription.whitelistRules = importResult.rules.whiteList;
                    }
                    else {
                        editingSubscription.proxyRules = [];
                        editingSubscription.whitelistRules = [];
                    }

                    editingSubscription.totalCount = count;
                    SubscriptionStats.updateStats(editingSubscription.stats, true);

                    settingsPage.refreshRulesSubscriptionsGrid(pageProfile);

                    messageBox.success(api.i18n.getMessage("settingsRulesSubscriptionSaveUpdated")
                        .replace("{0}", importResult.rules.blackList.length)
                        .replace("{1}", importResult.rules.whiteList.length));

                    settingsPage.changeTracking.rulesSubscriptions = true;
                } else {
                    SubscriptionStats.updateStats(editingSubscription.stats, false);
                    messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionSaveFailedGet"));
                }
            },
            (error) => {
                SubscriptionStats.updateStats(editingSubscription.stats, false, error);
                messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionSaveFailedGet"));
            });
    },
    onRulesSubscriptionViewStatsClick(pageProfile: SettingsPageSmartProfile, e: any) {
        let status = e.currentTarget?.title;
        if (status) {
            status = status.replaceAll('\r\n', '<br\>').replaceAll('\n', '<br\>');
            messageBox.info(status);
        }
    },
    onClickSaveRulesSubscription(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;
        let modal = tabContainer.find("#modalRulesSubscription");
        if (!modal.find("form")[0].checkValidity()) {
            messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionIncompleteForm"));
            return;
        }
        let subscriptionModel = settingsPage.readRulesSubscriptionModel(modal);
        if (!subscriptionModel) {
            messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionInvalidForm"));
            return;
        }

        let subscriptionsList = settingsPage.readRulesSubscriptions(pageProfile);
        let editingSubscription: ProxyRulesSubscription = modal.data("editing");
        let editingName = "";
        if (editingSubscription) {
            editingName = editingSubscription.name;
            subscriptionModel.id = editingSubscription.id;
        }

        if (editingSubscription) {
            let nameIsDuplicate = false;
            for (let item of subscriptionsList) {
                if (item.name == subscriptionModel.name && subscriptionModel.name != editingName) {
                    nameIsDuplicate = true;
                }
            }
            if (subscriptionModel.name != editingName)
                if (nameIsDuplicate) {
                    messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionDuplicateName"));
                    return;
                }
        }

        if (!subscriptionModel.stats) {
            subscriptionModel.stats = new SubscriptionStats();
        }

        tabContainer.find("#btnSaveRulesSubscriptions").attr("data-loading-text", api.i18n.getMessage("settingsRulesSubscriptionSavingButton"));
        tabContainer.find("#btnSaveRulesSubscriptions").button("loading");

        // Temporarily switch to Direct to fetch rules
        settingsPage.temporarilySwitchToDirect(async () => {
            return new Promise((resolve, reject) => {
                RuleImporter.readFromServerAndImport(subscriptionModel,
                    (importResult: {
                        success: boolean;
                        message: string;
                        rules: {
                            whiteList: ImportedProxyRule[];
                            blackList: ImportedProxyRule[];
                        };
                    }) => {
                        tabContainer.find("#btnSaveRulesSubscriptions").button('reset');

                        if (importResult.success) {
                            let count = importResult.rules.blackList.length + importResult.rules.whiteList.length;

                            if (subscriptionModel.enabled) {
                                subscriptionModel.proxyRules = importResult.rules.blackList;
                                subscriptionModel.whitelistRules = importResult.rules.whiteList;
                            }
                            else {
                                subscriptionModel.proxyRules = [];
                                subscriptionModel.whitelistRules = [];
                            }
                            subscriptionModel.totalCount = count;
                            SubscriptionStats.updateStats(subscriptionModel.stats, true);

                            if (editingSubscription) {
                                jQuery.extend(editingSubscription, subscriptionModel);
                                settingsPage.refreshRulesSubscriptionsGrid(pageProfile);
                                messageBox.success(api.i18n.getMessage("settingsRulesSubscriptionSaveUpdated")
                                    .replace("{0}", importResult.rules.blackList.length)
                                    .replace("{1}", importResult.rules.whiteList.length));
                            } else {
                                settingsPage.insertNewRulesSubscriptionInGrid(pageProfile, subscriptionModel);
                                messageBox.success(api.i18n.getMessage("settingsRulesSubscriptionSaveAdded")
                                    .replace("{0}", importResult.rules.blackList.length)
                                    .replace("{1}", importResult.rules.whiteList.length));
                            }

                            settingsPage.changeTracking.rulesSubscriptions = true;
                            modal.modal("hide");
                            resolve(undefined);
                        } else {
                            SubscriptionStats.updateStats(subscriptionModel.stats, false);
                            messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionSaveFailedGet"));
                            reject(importResult.message);
                        }
                    },
                    (error) => {
                        SubscriptionStats.updateStats(subscriptionModel.stats, false, error);
                        messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionSaveFailedGet"));
                        tabContainer.find("#btnSaveRulesSubscriptions").button('reset');
                        reject(error);
                    });
            });
        }).catch(() => {});
    },
    onClickTestRulesSubscription(pageProfile: SettingsPageSmartProfile) {
        let tabContainer = pageProfile.htmlProfileTab;
        let modal = tabContainer.find("#modalRulesSubscription");

        if (!modal.find("form")[0].checkValidity()) {
            messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionIncompleteForm"));
            return;
        }

        let subscriptionModel = settingsPage.readRulesSubscriptionModel(modal);

        if (!subscriptionModel) {
            messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionInvalidForm"));
            return;
        }

        tabContainer.find("#btnTestRulesSubscriptions").attr("data-loading-text", api.i18n.getMessage("settingsRulesSubscriptionTestingButton"));
        tabContainer.find("#btnTestRulesSubscriptions").button("loading");

        var applyProxyMode = subscriptionModel.applyProxy;
        subscriptionModel.applyProxy = null;

        // Temporarily switch to Direct to test
        settingsPage.temporarilySwitchToDirect(async () => {
            return new Promise((resolve, reject) => {
                PolyFill.runtimeSendMessage(
                    {
                        command: CommandMessages.SettingsPageMakeRequestSpecial,
                        url: subscriptionModel.url,
                        applyProxy: applyProxyMode,
                        selectedProxy: null
                    },
                    (response: any) => {
                        if (!response || !response.success) {
                            if (response && response.message)
                                messageBox.error(response.message);
                            tabContainer.find("#btnTestRulesSubscriptions").button('reset');
                            reject(response?.message || "Request failed");
                            return;
                        }
                        if (response.message)
                            messageBox.success(response.message);

                        RuleImporter.readFromServerAndImport(subscriptionModel,
                            (importResult: {
                                success: boolean;
                                message: string;
                                rules: {
                                    whiteList: ImportedProxyRule[];
                                    blackList: ImportedProxyRule[];
                                };
                            }) => {
                                tabContainer.find("#btnTestRulesSubscriptions").button('reset');

                                if (importResult.success) {
                                    messageBox.success(api.i18n.getMessage("settingsRulesSubscriptionTestSuccess")
                                        .replace("{0}", importResult.rules.blackList.length)
                                        .replace("{1}", importResult.rules.whiteList.length));
                                    resolve(undefined);
                                } else {
                                    messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionTestFailed"));
                                    reject(importResult.message);
                                }
                            },
                            () => {
                                messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionTestFailed"));
                                tabContainer.find("#btnTestRulesSubscriptions").button('reset');
                                reject("Test failed");
                            });
                    },
                    (error: Error) => {
                        messageBox.error(api.i18n.getMessage("settingsRulesSubscriptionTestFailed"));
                        tabContainer.find("#btnTestRulesSubscriptions").button('reset');
                        reject(error);
                    });
            });
        }).catch(() => {});
    },
    onClickClearRulesSubscriptions(pageProfile: SettingsPageSmartProfile) {
        messageBox.confirm(api.i18n.getMessage("settingsRemoveAllProxyRulesSubscriptions"),
            () => {
                settingsPage.loadRulesSubscriptions(pageProfile, []);
                settingsPage.changeTracking.rulesSubscriptions = true;
                messageBox.info(api.i18n.getMessage("settingsRemoveAllProxyRulesSubscriptionsSuccess"));
            });
    },
    onClickExportProxyServerOpenBackup() {
        let proxyList = settingsPage.exportServersListFormatted();
        CommonUi.downloadData(proxyList, "ProxyMust-Servers.txt");
    },
    onClickImportProxyServer() {
        let modalContainer = jq("#modalImportProxyServer");
        let file, text;

        if (modalContainer.find("#rbtnImportProxyServer_File").prop("checked")) {
            let selectFileElement = modalContainer.find("#btnImportProxyServerSelectFile")[0];

            if (selectFileElement.files.length == 0) {
                messageBox.error(api.i18n.getMessage("settingsImportProxiesFileNotSelected"));
                return;
            }
            file = selectFileElement.files[0];
        } else {
            let proxyServerListText: string = modalContainer.find("#btnImportProxyServerListText").val().trim();
            if (proxyServerListText == "") {
                messageBox.error(api.i18n.getMessage("settingsImportProxyListTextIsEmpty"));
                return;
            }
            text = proxyServerListText;
        }
        let append = modalContainer.find("#cmbImportProxyServerOverride_Append").prop("checked");
        let proxyServers = settingsPage.readServers();

        ProxyImporter.importText(text, file,
            append,
            proxyServers,
            (response: {
                success: boolean,
                message: string,
                result: ProxyServer[]
            }) => {
                if (!response) return;

                if (response.success) {
                    if (response.message)
                        messageBox.info(response.message);
                    modalContainer.find("#btnImportProxyServerSelectFile")[0].value = "";
                    modalContainer.find("#btnImportProxyServerListText").val("");
                    let servers = response.result;
                    
                    CountryCode.ensureInitialized(() => {
                        settingsPage.loadServersGrid(servers);
                        settingsPage.loadDefaultProxyServer();
                    });
                    
                    settingsPage.changeTracking.servers = true;
                    
                    const saveData = {
                        proxyServers: settingsPage.readServers(),
                        defaultProxyServerId: settingsPage.currentSettings.defaultProxyServerId
                    };
                    PolyFill.runtimeSendMessage(
                        { command: CommandMessages.SettingsPageSaveProxyServers, saveData },
                        () => {
                            settingsPage.currentSettings.proxyServers = saveData.proxyServers;
                            settingsPage.changeTracking.servers = false;
                        }
                    );
                    
                    modalContainer.modal("hide");
                } else {
                    if (response.message)
                        messageBox.error(response.message);
                }
            },
            (error: Error) => {
                let message = "";
                if (error && error.message)
                    message = error.message;
                messageBox.error(api.i18n.getMessage("settingsImportProxyServersFailed") + " " + message);
            });
    },
    onClickFactoryReset() {
        messageBox.confirm(api.i18n.getMessage("settingsFactoryResetConfirm"),
            () => {
                PolyFill.runtimeSendMessage(
                    {
                        command: CommandMessages.SettingsPageFactoryReset,
                    },
                    (response: ResultHolder) => {
                        if (response.success) {
                            jq(window).off("beforeunload");
                            if (response.message) {
                                messageBox.success(response.message,
                                    800,
                                    () => {
                                        settingsPage.changeTracking.resetStats();
                                        document.location.reload();
                                    });
                            } else {
                                settingsPage.changeTracking.resetStats();
                                document.location.reload();
                            }
                        } else {
                            if (response.message) {
                                messageBox.error(response.message);
                            }
                        }
                    });
            });
    },
    onClickBackupComplete() {
        let backupSettings = SettingsOperation.getBackupOfSettings(settingsPage.currentSettings);
        let data = JSON.stringify(backupSettings);
        CommonUi.downloadData(data, "ProxyMust-FullBackup.json");
    },
    onClickRestoreBackup() {
        function callRestoreSettings(fileData: any) {
            PolyFill.runtimeSendMessage(
                {
                    command: CommandMessages.SettingsPageRestoreSettings,
                    fileData: fileData
                },
                (response: ResultHolder) => {
                    if (response.success) {
                        jq(window).off("beforeunload");
                        if (response.message) {
                            messageBox.success(response.message,
                                500,
                                () => {
                                    settingsPage.changeTracking.resetStats();
                                    document.location.reload();
                                });
                        } else {
                            settingsPage.changeTracking.resetStats();
                            document.location.reload();
                        }
                    } else {
                        if (response.message) {
                            messageBox.error(response.message);
                        }
                    }
                },
                (error: Error) => {
                    messageBox.error(api.i18n.getMessage("settingsRestoreBackupFailed"));
                    PolyFill.runtimeSendMessage("restoreSettings failed with> " + error.message);
                });
        }

        CommonUi.selectFileOnTheFly(jq("#frmRestoreBackup")[0],
            "restore-file",
            (inputElement: any, files: any[]) => {
                let file = files[0];

                let reader = new FileReader();
                reader.onerror = event => {
                    messageBox.error(api.i18n.getMessage("settingsRestoreBackupFileError"));
                };
                reader.onload = event => {
                    let fileText = reader.result;
                    callRestoreSettings(fileText);
                };
                reader.readAsText(file);
            },
            "application/json");
    },
    onClickEnableDiagnostics() {
        if (settingsPage.debugDiagnosticsRequested) {
            PolyFill.runtimeSendMessage({ command: CommandMessages.DebugGetDiagnosticsLogs }, (result) => {
                const fileName = `smartproxy-diag-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
                CommonUi.downloadData(result, fileName);
            });
        }
        else if (confirm("Are you sure to enable diagnostics?")) {
            settingsPage.debugDiagnosticsRequested = true;
            PolyFill.runtimeSendMessage({ command: CommandMessages.DebugEnableDiagnostics });
            alert("Diagnostics are enabled for this session only. Check this page for more info.");
            window.open("https://github.com/salarcode/SmartProxy/wiki/Enable-Diagnostics")
        }
    },
    
    /**
     * English: Toggles the embedded test log viewer.
     * Russian: Переключает встроенный просмотрщик лога тестирования.
     */
    onToggleLogViewer: function() {
        const viewer = jq("#testLogViewer");
        const btn = jq("#openTestLogBtn");
        const container = document.getElementById('logContainer');
        const emptyState = document.getElementById('emptyState');
        
        if (viewer.is(":visible")) {
            viewer.slideUp(200);
            btn.find("span").text(api.i18n.getMessage("settingsProxyMustOpenLog"));
        } else {
            viewer.slideDown(200);
            btn.find("span").text(api.i18n.getMessage("settingsHideLog") || "Скрыть лог");
            
            if (container && container.children.length === 0) {
                PolyFill.runtimeSendMessage({ command: "GET_TEST_LOG_HISTORY" }, (response) => {
                    if (response && response.history && response.history.length) {
                        if (container) {
                            if (emptyState) emptyState.style.display = 'none';
                            const container = document.getElementById('logContainer');
							if (container) {
								response.history.forEach((msg) => renderLogMessage(container, msg));
							}
                        }
                    } else {
                        if (emptyState) emptyState.style.display = 'block';
                    }
                });
            } else {
                if (emptyState) emptyState.style.display = 'none';
            }
        }
    },
    
    onWindowUnload(event) {
        if (!settingsPage.readGeneralOptions().Equals(settingsPage.currentSettings.options)) {
            settingsPage.changeTracking.options = true;
        }
        if (!settingsPage.changeTracking.isDirty())
            return;

        jq(window).one("focus", () => {
            setTimeout(() => {
                messageBox.confirm(api.i18n.getMessage("settingsConfirmSaveAllChanged"),
                    () => {
                        if (settingsPage.changeTracking.options) {
                            settingsPage.uiEvents.onClickSaveGeneralOptions();
                        }
                        if (settingsPage.changeTracking.smartProfiles || settingsPage.changeTracking.rulesSubscriptions) {
                            for (let pageProfile of settingsPage.pageSmartProfiles) {
                                settingsPage.uiEvents.onClickSaveSmartProfile(pageProfile);
                            }
                        }

                        settingsPage.uiEvents.saveUnsavedSmartProfile();

                        if (settingsPage.changeTracking.servers || settingsPage.changeTracking.activeProxy) {
                            settingsPage.uiEvents.onClickSaveProxyServers();
                        }
                        if (settingsPage.changeTracking.serverSubscriptions) {
                            settingsPage.uiEvents.onClickSaveServerSubscriptionsChanges();
                        }
                    });
            }, 200);
        });

        event.preventDefault();
        event.returnValue = true;
    }
};

	private static generateNewServerName(): string {
		let servers = this.readServers();
		let serverNo = 1;
		let result = `Server ${serverNo}`;

		if (servers && servers.length > 0) {
			let exist;
			serverNo = servers.length + 1;
			result = `Server ${serverNo}`;

			do {
				exist = false;
				for (let i = servers.length - 1; i >= 0; i--) {
					if (servers[i].name === result) {
						exist = true;
						serverNo++;
						result = `Server ${serverNo}`;
						break;
					}
				}
			} while (exist)
		}
		return result;
	}

	private static generateNewSubscriptionName(): string {
		let subscriptions = settingsPage.readServerSubscriptions();
		let itemNo = 1;
		let result = `Subscription ${itemNo}`;

		if (subscriptions && subscriptions.length > 0) {
			let exist;
			itemNo = subscriptions.length + 1;
			result = `Subscription ${itemNo}`;

			do {
				exist = false;
				for (let i = subscriptions.length - 1; i >= 0; i--) {
					if (subscriptions[i].name === result) {
						exist = true;
						itemNo++;
						result = `Subscription ${itemNo}`;
						break;
					}
				}
			} while (exist)
		}
		return result;
	}

	private static generateNewRulesSubscriptionName(pageProfile: SettingsPageSmartProfile): string {
		let subscriptions = settingsPage.readRulesSubscriptions(pageProfile);
		let itemNo = 1;
		let result = `Rules Sub ${itemNo}`;

		if (subscriptions && subscriptions.length > 0) {
			let exist;
			itemNo = subscriptions.length + 1;
			result = `Rules Sub ${itemNo}`;

			do {
				exist = false;
				for (let i = subscriptions.length - 1; i >= 0; i--) {
					if (subscriptions[i].name === result) {
						exist = true;
						itemNo++;
						result = `Rules Sub ${itemNo}`;
						break;
					}
				}
			} while (exist)
		}
		return result;
	}
	
	// ========================
    // ProxyMust: site list and test functions
    // English: Site list building, test running and priority handling
    // Russian: Построение списка сайтов, запуск тестов и обработка приоритетов
    // ========================

    private static normalizeHost(host: string): string {
        if (!host) return '';
        let normalized = host.trim().toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .replace(/^www\./, '');
        const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Pattern = /^([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}$/i;
        if (ipv4Pattern.test(normalized) || ipv6Pattern.test(normalized)) {
            return '';
        }
        const reserved = ['localhost', 'local', 'loopback', '0.0.0.0', '::1', '[::1]'];
        if (reserved.includes(normalized)) {
            return '';
        }
        return normalized;
    }

    private static getAllSitesList(): string[] {
        const sitesSet = new Set<string>();
        if (settingsPage.currentSettings?.proxyProfiles) {
            for (const profile of settingsPage.currentSettings.proxyProfiles) {
                for (const rule of profile.proxyRules || []) {
                    if (rule.hostName) {
                        const host = settingsPage.normalizeHost(rule.hostName);
                        if (host) sitesSet.add(host);
                    }
                }
            }
        }
        if (settingsPage.currentSettings?.userPrefs?.manualSites) {
            for (const site of settingsPage.currentSettings.userPrefs.manualSites) {
                const normalized = settingsPage.normalizeHost(site);
                if (normalized) sitesSet.add(normalized);
            }
        }
        return Array.from(sitesSet).sort();
    }

    private static async updateRatingForProxy(proxyId: string, delta: number): Promise<void> {
        return new Promise((resolve) => {
            PolyFill.runtimeSendMessage({ command: "UpdateProxyRating", proxyId, delta }, () => {
                settingsPage.refreshSettingsData();
                resolve(undefined);
            });
        });
    }

    private static async resetRatingForProxy(proxyId: string): Promise<void> {
        const proxy = settingsPage.currentSettings.proxyServers.find(p => p.id === proxyId);
        if (proxy) {
            const delta = 0 - (proxy.rating ?? 0);
            if (delta !== 0) {
                await settingsPage.updateRatingForProxy(proxyId, delta);
            } else {
                settingsPage.refreshSettingsData();
            }
        }
    }

    private static async setPriorityForProxy(proxyId: string, priority: "pin" | "star" | null): Promise<void> {
        return new Promise((resolve) => {
            PolyFill.runtimeSendMessage({ command: "SetProxyPriority", proxyId, priority }, () => {
                settingsPage.refreshSettingsData();
                resolve(undefined);
            });
        });
    }

    private static exportSelectedProxies(proxyIds: string[]): void {
        const proxies = settingsPage.readServers().filter(p => proxyIds.includes(p.id));
        let text = "";
        for (const p of proxies) {
            text += `${p.host}:${p.port} [${p.protocol}]`;
            if (p.username) text += ` [${p.name}] [${p.username}] [${p.password}]`;
            else if (p.name !== `${p.host}:${p.port}`) text += ` [${p.name}]`;
            text += "\r\n";
        }
        CommonUi.downloadData(text, "ProxyMust-Servers-export.txt");
    }

    private static copySelectedProxyAddresses(proxyIds: string[]): void {
        const proxies = settingsPage.readServers().filter(p => proxyIds.includes(p.id));
        const addresses = proxies.map(p => `${p.host}:${p.port}`).join("\n");
        navigator.clipboard.writeText(addresses).then(() => {
            messageBox.info(api.i18n.getMessage("settingsCopiedAddresses") || "Addresses copied");
        }).catch(() => messageBox.error(api.i18n.getMessage("settingsCopyFailed") || "Failed to copy"));
    }

    private static async deleteSelectedProxies(proxyIds: string[]): Promise<void> {
        let servers = settingsPage.readServers();
        servers = servers.filter(p => !proxyIds.includes(p.id));
        settingsPage.loadServersGrid(servers);
        settingsPage.currentSettings.proxyServers = servers;
        settingsPage.changeTracking.servers = true;
        await settingsPage.saveProxyServersChanges();
    }

    private static async moveSelectedProxiesToTop(proxyIds: string[]): Promise<void> {
        if (!proxyIds.length) return;
        let servers = settingsPage.readServers();
        if (servers.length === 0) return;
        const selectedServers = servers.filter(s => proxyIds.includes(s.id));
        const remainingServers = servers.filter(s => !proxyIds.includes(s.id));
        selectedServers.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const newOrder = [...selectedServers, ...remainingServers];
        for (let i = 0; i < newOrder.length; i++) {
            newOrder[i].order = i;
        }
        settingsPage.loadServersGrid(newOrder);
        settingsPage.currentSettings.proxyServers = newOrder;
        settingsPage.changeTracking.servers = true;
        await settingsPage.saveProxyServersChanges();
    }

    /**
     * English: Moves selected proxies down in the list.
     * Russian: Перемещает выбранные прокси вниз по списку.
     */
    private static async moveSelectedProxiesToDown(proxyIds: string[]): Promise<void> {
        if (!proxyIds.length) return;
        let servers = settingsPage.readServers();
        if (servers.length === 0) return;
        
        const selectedIndices: number[] = [];
        const selectedServers: ProxyServer[] = [];
        
        // English: Find indices of selected proxies and collect them
        // Russian: Находим индексы выбранных прокси и собираем их
        for (let i = 0; i < servers.length; i++) {
            if (proxyIds.includes(servers[i].id)) {
                selectedIndices.push(i);
                selectedServers.push(servers[i]);
            }
        }
        
        if (selectedIndices.length === 0) return;
        
        // English: Check if the lowest selected proxy is already at the bottom
        // Russian: Проверяем, находится ли самый нижний выбранный прокси уже внизу
        const maxSelectedIndex = Math.max(...selectedIndices);
        if (maxSelectedIndex === servers.length - 1) {
            // English: Already at bottom, nothing to move
            // Russian: Уже внизу, нечего перемещать
            return;
        }
        
        // English: Sort selected indices in descending order to move from bottom to top
        // Russian: Сортируем выбранные индексы в порядке убывания для перемещения снизу вверх
        const sortedIndices = [...selectedIndices].sort((a, b) => b - a);
        
        // English: Create a new array with the selected proxies moved down one position each
        // Russian: Создаём новый массив с перемещением выбранных прокси на одну позицию вниз
        const newServers = [...servers];
        
        for (const idx of sortedIndices) {
            if (idx < servers.length - 1) {
                // English: Swap with the next element
                // Russian: Меняем местами со следующим элементом
                const temp = newServers[idx];
                newServers[idx] = newServers[idx + 1];
                newServers[idx + 1] = temp;
            }
        }
        
        // English: Update order values based on new positions
        // Russian: Обновляем значения order на основе новых позиций
        for (let i = 0; i < newServers.length; i++) {
            newServers[i].order = i;
        }
        
        settingsPage.loadServersGrid(newServers);
        settingsPage.currentSettings.proxyServers = newServers;
        settingsPage.changeTracking.servers = true;
        await settingsPage.saveProxyServersChanges();
    }

    private static async saveProxyServersChanges(): Promise<void> {
        const saveData = {
            proxyServers: settingsPage.readServers(),
            defaultProxyServerId: settingsPage.currentSettings.defaultProxyServerId
        };
        return new Promise((resolve) => {
            PolyFill.runtimeSendMessage(
                { command: CommandMessages.SettingsPageSaveProxyServers, saveData },
                () => resolve()
            );
        });
    }

    private static refreshSettingsData(): void {
        console.log("[ProxyMust] refreshSettingsData: запрос данных...");
        PolyFill.runtimeSendMessage(CommandMessages.SettingsPageGetInitialData,
            (dataForSettings: SettingsPageInternalDataType) => {
                if (dataForSettings) {
                    settingsPage.currentSettings = dataForSettings.settings;
                    // Обновляем все основные компоненты
                    settingsPage.loadServersGrid(settingsPage.currentSettings.proxyServers);
                    settingsPage.loadServerSubscriptionsGrid(settingsPage.currentSettings.proxyServerSubscriptions);
                    settingsPage.loadSmartProfiles(settingsPage.currentSettings.proxyProfiles);
                    settingsPage.loadGeneralOptions(settingsPage.currentSettings.options);
                    settingsPage.loadDefaultProxyServer(settingsPage.currentSettings.proxyServers, settingsPage.currentSettings.proxyServerSubscriptions);
                    settingsPage.buildSitesDropdown();
                    settingsPage.loadAllProfilesProxyServers();
                    
                    // Принудительно обновляем DataTables
                    if (settingsPage.grdServers) {
                        settingsPage.grdServers.clear();
                        settingsPage.grdServers.rows.add(settingsPage.currentSettings.proxyServers);
                        settingsPage.grdServers.draw('full-hold');
                        settingsPage.grdServers.columns.adjust().draw();
                    }
                    // Обновляем таблицы правил для каждого профиля
                    for (const pageProfile of settingsPage.pageSmartProfiles) {
                        if (pageProfile.grdRules) {
							const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
							pageProfile.grdRules.clear();
							pageProfile.grdRules.rows.add(fixedRules);
							pageProfile.grdRules.draw('full-hold');
                            pageProfile.grdRules.columns.adjust().draw();
                        }
                    }
                    
                    // Обновляем состояние кнопки рейтинга
                    const ratingEnabled = settingsPage.currentSettings.options.enableRating;
                    jq("#chkEnableRating").prop("checked", ratingEnabled);
                    jq("#proxyTestControlBlock").toggle(ratingEnabled);
                    if (settingsPage.grdServers) {
                        settingsPage.grdServers.column(6).visible(ratingEnabled);
                    }
                    console.log("[ProxyMust] refreshSettingsData: все данные обновлены");
                } else {
                    console.log("[ProxyMust] refreshSettingsData: данные НЕ получены (dataForSettings = null)");
                }
            },
            (error: Error) => {
                console.error("[ProxyMust] refreshSettingsData ОШИБКА:", error);
            });
    }
    /**
     * English: Updates the state of export buttons based on proxy count
     * Russian: Обновляет состояние кнопок экспорта в зависимости от количества прокси
     */
    private static updateExportButtonsState(): void {
        const servers = settingsPage.readServers();
        const hasProxies = servers.length > 0;
        jq("#btnExportProxyServerOpen, #btnExportProxyServerOpenBackup").prop("disabled", !hasProxies);
    }
	
    /**
     * English: Waits until the active profile ID (from background) matches the expected profile ID.
     * Russian: Ожидает, пока идентификатор активного профиля (из фона) не совпадёт с ожидаемым.
     * @param profileId - Expected profile ID / Ожидаемый ID профиля
     * @param timeoutMs - Maximum wait time in milliseconds / Максимальное время ожидания в мс
     * @throws Error if timeout is reached / Выбрасывает ошибку при таймауте
     */
    private static async waitForProfile(profileId: string, timeoutMs: number = 10000): Promise<void> {
        const start = Date.now();
        let lastCheckedProfile: string | null = null;
        while (Date.now() - start < timeoutMs) {
            // English: Request fresh data from background to get the actual active profile
            // Russian: Запрашиваем свежие данные из фона, чтобы получить актуальный активный профиль
            const freshData = await new Promise<PopupInternalDataType>((resolve) => {
                PolyFill.runtimeSendMessage(CommandMessages.PopupGetInitialData, (data: PopupInternalDataType) => {
                    resolve(data);
                });
            });
            if (freshData && freshData.activeProfileId === profileId) {
                // English: Also update local Settings to keep in sync
                // Russian: Также обновляем локальные Settings для синхронизации
                if (settingsPage.currentSettings) {
                    settingsPage.currentSettings.activeProfileId = profileId;
                }
                console.log(`[waitForProfile] Профиль успешно сменился на ${profileId} за ${Date.now() - start}мс`);
                return;
            }
            if (freshData && freshData.activeProfileId !== lastCheckedProfile) {
                lastCheckedProfile = freshData.activeProfileId;
                console.log(`[waitForProfile] Текущий профиль в фоне: ${freshData.activeProfileId}, ожидаем: ${profileId}`);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        console.error(`[waitForProfile] Таймаут ожидания профиля ${profileId}`);
        throw new Error(`Timeout waiting for profile ${profileId}`);
    }

    /**
     * English: Temporarily switches to Direct profile, executes an async action, then restores original profile.
     * Russian: Временно переключает на профиль Direct, выполняет действие, затем восстанавливает исходный профиль.
     * Uses the same reliable mechanism as ProxyCycleTester (background command + waitForProfile).
     * Использует тот же надёжный механизм, что и ProxyCycleTester (команда в фон + waitForProfile).
     */
    private static async temporarilySwitchToDirect(action: () => Promise<any>): Promise<any> {
        const originalProfileId = settingsPage.currentSettings?.activeProfileId;
        console.log("[temporarilySwitchToDirect] Начало. Исходный профиль:", originalProfileId);

        // If already Direct or no profile, just execute action
        if (originalProfileId === SmartProfileTypeBuiltinIds.Direct || !originalProfileId) {
            console.log("[temporarilySwitchToDirect] Уже Direct, выполняем действие без переключения.");
            return action();
        }

        const directProfileId = SmartProfileTypeBuiltinIds.Direct;
        console.log("[temporarilySwitchToDirect] Переключаем на Direct через команду в фон...");

        // 1. Отправляем команду в фон на переключение профиля
        await new Promise<void>((resolve) => {
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupChangeActiveProfile,
                profileId: directProfileId
            }, () => {
                console.log("[temporarilySwitchToDirect] Команда отправлена в фон.");
                resolve();
            });
        });

        // 2. Ждём, пока профиль действительно станет Direct (проверяем через фон)
        await settingsPage.waitForProfile(directProfileId);

        // 3. Обновляем локальное состояние
        settingsPage.currentSettings.activeProfileId = directProfileId;

        // 4. Выполняем действие
        let result: any;
        let firstError: any = null;

        console.log("[temporarilySwitchToDirect] Выполняем действие (попытка 1)...");
        try {
            result = await action();
            console.log("[temporarilySwitchToDirect] Первая попытка успешна.");
        } catch (error) {
            firstError = error;
            console.log("[temporarilySwitchToDirect] Первая попытка не удалась:", error);
        }

        // Если первая попытка не удалась, делаем вторую через 1 секунду
        if (firstError) {
            console.log("[temporarilySwitchToDirect] Повторяем через 1 секунду (как второе нажатие)...");
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log("[temporarilySwitchToDirect] Выполняем действие (попытка 2)...");
            try {
                result = await action();
                console.log("[temporarilySwitchToDirect] Вторая попытка успешна.");
                firstError = null;
            } catch (error2) {
                console.log("[temporarilySwitchToDirect] Вторая попытка тоже не удалась:", error2);
                throw error2;
            }
        }

        // 5. Восстанавливаем исходный профиль
        console.log("[temporarilySwitchToDirect] Восстанавливаем исходный профиль:", originalProfileId);
        await new Promise<void>((resolve) => {
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupChangeActiveProfile,
                profileId: originalProfileId
            }, () => {
                console.log("[temporarilySwitchToDirect] Команда на восстановление отправлена в фон.");
                resolve();
            });
        });

        // 6. Ждём, пока профиль восстановится
        await settingsPage.waitForProfile(originalProfileId);

        // 7. Обновляем локальное состояние обратно
        settingsPage.currentSettings.activeProfileId = originalProfileId;
        console.log("[temporarilySwitchToDirect] Восстановление завершено.");

        return result;
    }
	
    private static showTableContextMenu(clientX: number, clientY: number, selectedProxyIds: string[]): void {
        const existing = document.getElementById("tableContextMenu");
        if (existing) existing.remove();

        let themeBg = "#fff";
        let themeText = "#212529";
        let themeBorder = "#ccc";
        let themeHeaderBg = "#f0f0f0";
        let themeHoverBg = "#f0f0f0";

        if (document.body.classList.contains("theme-dark")) {
            themeBg = "#2d2d2d";
            themeText = "#e0e0e0";
            themeBorder = "#444";
            themeHeaderBg = "#3a3a3a";
            themeHoverBg = "#3a3a3a";
        } else if (document.body.classList.contains("theme-auto")) {
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (isDark) {
                themeBg = "#2d2d2d";
                themeText = "#e0e0e0";
                themeBorder = "#444";
                themeHeaderBg = "#3a3a3a";
                themeHoverBg = "#3a3a3a";
            }
        }
        const enableRating = settingsPage.currentSettings?.options?.enableRating ?? true;
        const menu = document.createElement("div");
        menu.id = "tableContextMenu";
        menu.style.cssText = `position:fixed; background:${themeBg}; color:${themeText}; border:1px solid ${themeBorder}; box-shadow:2px 2px 10px rgba(0,0,0,0.2); z-index:10000; min-width:180px;`;

        const sites = settingsPage.getAllSitesList();
        const selectedCountText = api.i18n.getMessage("settingsContextMenuSelectedCount", selectedProxyIds.length.toString());
        const changeRatingText = api.i18n.getMessage("settingsContextMenuRatingTitle") || "Manual rating";
        const resetText = api.i18n.getMessage("settingsContextMenuResetRating") || "Reset rating";
        const favoriteText = api.i18n.getMessage("settingsContextMenuSetFavorite") || "Set favorite";
        const pinText = api.i18n.getMessage("settingsContextMenuSetPin") || "Pin";
        const exportText = api.i18n.getMessage("settingsContextMenuExportSelected") || "Export selected";
        const copyText = api.i18n.getMessage("settingsContextMenuCopyAddresses") || "Copy addresses";
        const deleteText = api.i18n.getMessage("settingsContextMenuDelete") || "Delete";
        const preciseTestText = api.i18n.getMessage("settingsContextMenuPreciseTest");
        const expressTestText = api.i18n.getMessage("settingsContextMenuExpressTest");

        let html = `
    <div style="padding:4px 8px; background:${themeHeaderBg}; border-bottom:1px solid ${themeBorder}; color:${themeText};">${selectedCountText}</div>
    <div style="border-top:1px solid ${themeBorder}; margin:4px 0;"></div>
`;

        if (enableRating) {
            // English: Full menu with rating, priority and clear status options
            // Russian: Полное меню с опциями рейтинга, приоритета и очистки статусов
            html += `
        <div class="menu-item submenu" style="position:relative; padding:4px 12px; cursor:pointer;">${changeRatingText}
            <div class="submenu-content" style="display:none; position:absolute; left:100%; top:0; background:${themeBg}; border:1px solid ${themeBorder}; min-width:150px;">
                <div class="menu-item" data-action="rating_plus1" style="padding:4px 12px;">${api.i18n.getMessage("settingsContextMenuPlus1Desc")} (+1)</div>
                <div class="menu-item" data-action="rating_minus1" style="padding:4px 12px;">${api.i18n.getMessage("settingsContextMenuMinus1Desc")} (-1)</div>
                <div class="menu-item" data-action="rating_reset" style="padding:4px 12px;">${resetText}</div>
            </div>
        </div>
        <div class="menu-item" data-action="set_favorite" style="padding:4px 12px; cursor:pointer;">⭐ ${favoriteText}</div>
        <div class="menu-item" data-action="set_pin" style="padding:4px 12px; cursor:pointer;">📌 ${pinText}</div>
        <div style="border-top:1px solid ${themeBorder}; margin:4px 0;"></div>
        <div class="menu-item submenu" style="position:relative; padding:4px 12px; cursor:pointer;">🧹 ${api.i18n.getMessage("settingsContextMenuClearStatuses") || "Clear statuses"}
            <div class="submenu-content" style="display:none; position:absolute; left:100%; top:0; background:${themeBg}; border:1px solid ${themeBorder}; min-width:150px;">
                <div class="menu-item" data-action="clear_status_selected" style="padding:4px 12px;">${api.i18n.getMessage("settingsContextMenuClearStatusesSelected") || "Selected proxies"}</div>
                <div class="menu-item" data-action="clear_status_all" style="padding:4px 12px;">${api.i18n.getMessage("settingsContextMenuClearStatusesAll") || "All proxies"}</div>
            </div>
        </div>
        <div style="border-top:1px solid ${themeBorder}; margin:4px 0;"></div>
    `;
        } else {
			const moveToTopText = api.i18n.getMessage("settingsContextMenuMoveToTop");
			const moveToDownText = api.i18n.getMessage("settingsContextMenuMoveToDown");
            html += `
        <div class="menu-item" data-action="move_to_top" style="padding:4px 12px; cursor:pointer;">⬆ ${moveToTopText}</div>
        <div class="menu-item" data-action="move_to_down" style="padding:4px 12px; cursor:pointer;">⬇ ${moveToDownText}</div>
        <div style="border-top:1px solid ${themeBorder}; margin:4px 0;"></div>
    `;
        }

        // Common menu items for both modes
        const setDefaultText = api.i18n.getMessage("settingsActiveProxyServer") || "Set as Default Proxy Server";
        html += `
    <div class="menu-item" data-action="set_as_default" style="padding:4px 12px; cursor:pointer;">${setDefaultText}</div>
    <div class="menu-item" data-action="export" style="padding:4px 12px; cursor:pointer;">${exportText}</div>
    <div class="menu-item" data-action="copy" style="padding:4px 12px; cursor:pointer;">${copyText}</div>
    <div class="menu-item" data-action="delete" style="padding:4px 12px; cursor:pointer;">${deleteText}</div>
`;

        // English: Add test section with two submenus for precise and express tests, each with site list
        // If no sites are available, clicking the parent menu item will prompt for site input
        // Russian: Добавляем секцию теста с двумя подменю для точного и быстрого теста, внутри каждого список сайтов
        // Если сайты отсутствуют, то при клике на родительский пункт меню будет предложено ввести сайт вручную
        if (enableRating) {
            html += `<div style="border-top:1px solid ${themeBorder}; margin:4px 0;"></div>`;
            if (settingsPage.isTestingForSite) {
                const stopText = api.i18n.getMessage("settingsProxyTestStopButton") || "Stop test";
                html += `<div class="menu-item" data-action="stop_test" style="padding:4px 12px; cursor:pointer;">⏹ ${stopText}</div>`;
            } else {
                // English: Check if there are any sites available
                // Russian: Проверяем, есть ли доступные сайты
                const hasSites = sites && sites.length > 0;
                
                // ----- 1. Cycle test (full switching) - works in all browsers -----
                const cycleTestText = api.i18n.getMessage("settingsContextMenuCycleTest") || "Cycle test (full switching)";
                const cycleTestDesc = api.i18n.getMessage("settingsCycleTestDesc") || "Sequentially switches proxies, tests site loading. More thorough but slower.";
                
                if (hasSites) {
                    html += `<div class="menu-item submenu" style="position:relative; padding:4px 12px; cursor:pointer;">🔄 ${cycleTestText}
                        <div class="submenu-content" style="display:none; position:absolute; left:100%; top:0; background:${themeBg}; border:1px solid ${themeBorder}; max-height:300px; overflow-y:auto;">
                            <div class="menu-item-desc" style="padding:4px 12px; font-size:11px; color:#888; border-bottom:1px solid ${themeBorder};">${cycleTestDesc}</div>`;
                    for (const site of sites) {
                        html += `<div class="menu-item" data-action="test_cycle_for_site" data-site="${site}" style="padding:4px 12px;">${site}</div>`;
                    }
                    html += `</div></div>`;
                } else {
                    html += `<div class="menu-item" data-action="test_cycle_prompt" style="padding:4px 12px; cursor:pointer;">🔄 ${cycleTestText}<br><small class="menu-item-desc" style="font-size:11px; color:#888;">${cycleTestDesc}</small></div>`;
                }
                
                // ----- 2. Express cycle test (fast switching) - works in all browsers -----
				const expressCycleTestText = api.i18n.getMessage("settingsContextMenuExpressCycleTest") || "Express cycle test (fast switching)";
				const expressCycleTestDesc = api.i18n.getMessage("settingsExpressCycleTestDesc") || "Fast sequential proxy switching, 10s timeout, works on first success";

				if (hasSites) {
					html += `<div class="menu-item submenu" style="position:relative; padding:4px 12px; cursor:pointer;">⚡🔄 ${expressCycleTestText}
						<div class="submenu-content" style="display:none; position:absolute; left:100%; top:0; background:${themeBg}; border:1px solid ${themeBorder}; max-height:300px; overflow-y:auto;">
							<div class="menu-item-desc" style="padding:4px 12px; font-size:11px; color:#888; border-bottom:1px solid ${themeBorder};">${expressCycleTestDesc}</div>`;
					for (const site of sites) {
						html += `<div class="menu-item" data-action="test_express_cycle_for_site" data-site="${site}" style="padding:4px 12px;">${site}</div>`;
					}
					html += `</div></div>`;
				} else {
					html += `<div class="menu-item" data-action="test_express_cycle_prompt" style="padding:4px 12px; cursor:pointer;">⚡🔄 ${expressCycleTestText}<br><small class="menu-item-desc" style="font-size:11px; color:#888;">${expressCycleTestDesc}</small></div>`;
				}
                
                // ----- 3. Precise and Express tests (only in non-Firefox browsers, because they rely on direct proxy API) -----
                if (environment.name !== "Firefox") {
                    // Add a separator before precise/express tests
                    html += `<div style="border-top:1px solid ${themeBorder}; margin:4px 0;"></div>`;
                    
                    // English: Precise test - if sites exist, show submenu; otherwise make parent clickable with prompt
                    // Russian: Точный тест - если сайты есть, показываем подменю; иначе родительский пункт кликабельный с prompt
                    if (hasSites) {
                        html += `<div class="menu-item submenu" style="position:relative; padding:4px 12px; cursor:pointer;">🔍 ${preciseTestText}
                            <div class="submenu-content" style="display:none; position:absolute; left:100%; top:0; background:${themeBg}; border:1px solid ${themeBorder}; max-height:300px; overflow-y:auto;">
                        `;
                        for (const site of sites) {
                            html += `<div class="menu-item" data-action="test_precise_for_site" data-site="${site}" style="padding:4px 12px;">${site}</div>`;
                        }
                        html += `</div></div>`;
                    } else {
                        html += `<div class="menu-item" data-action="test_precise_prompt" style="padding:4px 12px; cursor:pointer;">🔍 ${preciseTestText}</div>`;
                    }
                    
                    // English: Express test - if sites exist, show submenu; otherwise make parent clickable with prompt
                    // Russian: Быстрый тест - если сайты есть, показываем подменю; иначе родительский пункт кликабельный с prompt
                    if (hasSites) {
                        html += `<div class="menu-item submenu" style="position:relative; padding:4px 12px; cursor:pointer;">⚡ ${expressTestText}
                            <div class="submenu-content" style="display:none; position:absolute; left:100%; top:0; background:${themeBg}; border:1px solid ${themeBorder}; max-height:300px; overflow-y:auto;">
                        `;
                        for (const site of sites) {
                            html += `<div class="menu-item" data-action="test_express_for_site" data-site="${site}" style="padding:4px 12px;">${site}</div>`;
                        }
                        html += `</div></div>`;
                    } else {
                        html += `<div class="menu-item" data-action="test_express_prompt" style="padding:4px 12px; cursor:pointer;">⚡ ${expressTestText}</div>`;
                    }
                }
            }
        }

        menu.innerHTML = html;

        const style = document.createElement('style');
        style.textContent = `.custom-context-menu .menu-item:hover { background: ${themeHoverBg} !important; }`;
        menu.appendChild(style);
        document.body.appendChild(menu);

        let left = clientX, top = clientY;
        const rect = menu.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;
        if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 10;
        menu.style.left = left + "px";
        menu.style.top = top + "px";

        // Handle clicks
        menu.querySelectorAll(".menu-item").forEach(item => {
            item.addEventListener("click", async (e) => {
                e.stopPropagation();
                const action = item.getAttribute("data-action");
                const site = item.getAttribute("data-site");
                switch (action) {
                    case "rating_plus1":
                        for (const id of selectedProxyIds) await settingsPage.updateRatingForProxy(id, 1);
                        break;
                    case "rating_minus1":
                        for (const id of selectedProxyIds) await settingsPage.updateRatingForProxy(id, -1);
                        break;
                    case "rating_reset":
                        for (const id of selectedProxyIds) await settingsPage.resetRatingForProxy(id);
                        break;
                    case "set_favorite":
                        for (const id of selectedProxyIds) {
                            const proxy = settingsPage.currentSettings.proxyServers.find(p => p.id === id);
                            const newPriority = (proxy?.priority === "star") ? null : "star";
                            await settingsPage.setPriorityForProxy(id, newPriority);
                        }
                        break;
                    case "set_pin":
                        for (const id of selectedProxyIds) {
                            const proxy = settingsPage.currentSettings.proxyServers.find(p => p.id === id);
                            const newPriority = (proxy?.priority === "pin") ? null : "pin";
                            await settingsPage.setPriorityForProxy(id, newPriority);
                        }
                        break;
                    case "move_to_top":
                        await settingsPage.moveSelectedProxiesToTop(selectedProxyIds);
                        break;
                    case "move_to_down":
                        await settingsPage.moveSelectedProxiesToDown(selectedProxyIds);
                        break;
                    case "export":
                        settingsPage.exportSelectedProxies(selectedProxyIds);
                        break;
                    case "set_as_default":
                        if (selectedProxyIds.length === 1) {
                            const proxyId = selectedProxyIds[0];
                            settingsPage.currentSettings.defaultProxyServerId = proxyId;
                            await settingsPage.saveProxyServersChanges();
                            // Обновляем выпадающий список активного прокси
                            settingsPage.loadDefaultProxyServer();
							messageBox.info(api.i18n.getMessage("defaultProxyUpdated"));
                        } else {
                            messageBox.warning(api.i18n.getMessage("settingsContextMenuSetDefaultSingle"));
                        }
                        break;
                    case "copy":
                        settingsPage.copySelectedProxyAddresses(selectedProxyIds);
                        break;
                    case "delete":
                        if (confirm(api.i18n.getMessage("settingsConfirmRemoveMultipleProxyServer") || `Delete ${selectedProxyIds.length} proxies?`)) {
                            await settingsPage.deleteSelectedProxies(selectedProxyIds);
                        }
                        break;
                    case "test_precise_for_site":
                        if (site) {
                            const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                            if (selectedProxies.length) {
                                settingsPage.runTestForProxies(selectedProxies, site, false);
                            } else {
                                messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                            }
                        }
                        break;
                    case "test_express_for_site":
                        if (site) {
                            const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                            if (selectedProxies.length) {
                                settingsPage.runTestForProxies(selectedProxies, site, true);
                            } else {
                                messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                            }
                        }
                        break;
                     case "test_cycle_for_site":
                        if (site) {
                            const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                            if (selectedProxies.length) {
                                settingsPage.runCycleTestForProxies(selectedProxies, site);
                            } else {
                                messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                            }
                        }
                        break;
                    case "test_cycle_prompt":
                        {
                            const enterSiteMsg = api.i18n.getMessage("settingsProxyMustAddSitePrompt");
                            const enteredSite = prompt(enterSiteMsg);
                            if (enteredSite && enteredSite.trim()) {
                                let normalizedSite = enteredSite.trim().toLowerCase();
                                normalizedSite = normalizedSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                if (normalizedSite) {
                                    // English: Add site to manual sites list if not already present
                                    // Russian: Добавляем сайт в список ручных сайтов, если его там ещё нет
                                    let needSave = false;
                                    if (!settingsPage.currentSettings.userPrefs) {
                                        settingsPage.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
                                    }
                                    if (!settingsPage.currentSettings.userPrefs.manualSites.includes(normalizedSite)) {
                                        settingsPage.currentSettings.userPrefs.manualSites.push(normalizedSite);
                                        needSave = true;
                                    }
                                    if (needSave) {
                                        api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                                            console.error("[ProxyMust] Failed to save userPrefs on add from context menu:", err);
                                        });
                                        settingsPage.buildSitesDropdown();
                                    }
                                    const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                                    if (selectedProxies.length) {
                                        settingsPage.runCycleTestForProxies(selectedProxies, normalizedSite);
                                    } else {
                                        messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                                    }
                                }
                            }
                        }
                        break;
                    case "test_express_cycle_for_site":
                        if (site) {
                            const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                            if (selectedProxies.length) {
                                settingsPage.runExpressCycleTestForProxies(selectedProxies, site);
                            } else {
                                messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                            }
                        }
                        break;
                    case "test_express_cycle_prompt":
                        {
                            const enterSiteMsg = api.i18n.getMessage("settingsProxyMustAddSitePrompt");
                            const enteredSite = prompt(enterSiteMsg);
                            if (enteredSite && enteredSite.trim()) {
                                let normalizedSite = enteredSite.trim().toLowerCase();
                                normalizedSite = normalizedSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                if (normalizedSite) {
                                    // English: Add site to manual sites list if not already present
                                    // Russian: Добавляем сайт в список ручных сайтов, если его там ещё нет
                                    let needSave = false;
                                    if (!settingsPage.currentSettings.userPrefs) {
                                        settingsPage.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
                                    }
                                    if (!settingsPage.currentSettings.userPrefs.manualSites.includes(normalizedSite)) {
                                        settingsPage.currentSettings.userPrefs.manualSites.push(normalizedSite);
                                        needSave = true;
                                    }
                                    if (needSave) {
                                        api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                                            console.error("[ProxyMust] Failed to save userPrefs on add from context menu:", err);
                                        });
                                        settingsPage.buildSitesDropdown();
                                    }
                                    const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                                    if (selectedProxies.length) {
                                        settingsPage.runExpressCycleTestForProxies(selectedProxies, normalizedSite);
                                    } else {
                                        messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                                    }
                                }
                            }
                        }
                        break;
                    case "test_express_prompt":
                        {
                            const enterSiteMsg = api.i18n.getMessage("settingsProxyMustAddSitePrompt");
                            const enteredSite = prompt(enterSiteMsg);
                            if (enteredSite && enteredSite.trim()) {
                                let normalizedSite = enteredSite.trim().toLowerCase();
                                normalizedSite = normalizedSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                if (normalizedSite) {
                                    // English: Add site to manual sites list if not already present
                                    // Russian: Добавляем сайт в список ручных сайтов, если его там ещё нет
                                    let needSave = false;
                                    if (!settingsPage.currentSettings.userPrefs) {
                                        settingsPage.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
                                    }
                                    if (!settingsPage.currentSettings.userPrefs.manualSites.includes(normalizedSite)) {
                                        settingsPage.currentSettings.userPrefs.manualSites.push(normalizedSite);
                                        needSave = true;
                                    }
                                    if (needSave) {
                                        api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                                            console.error("[ProxyMust] Failed to save userPrefs on add from context menu:", err);
                                        });
                                        settingsPage.buildSitesDropdown();
                                    }
                                    const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                                    if (selectedProxies.length) {
                                        settingsPage.runTestForProxies(selectedProxies, normalizedSite, true);
                                    } else {
                                        messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                                    }
                                }
                            }
                        }
                        break;
                    case "test_express_cycle_prompt":
                        {
                            const enterSiteMsg = api.i18n.getMessage("settingsProxyMustAddSitePrompt");
                            const enteredSite = prompt(enterSiteMsg);
                            if (enteredSite && enteredSite.trim()) {
                                let normalizedSite = enteredSite.trim().toLowerCase();
                                normalizedSite = normalizedSite.replace(/^https?:\/\//, '').replace(/\/$/, '');
                                if (normalizedSite) {
                                    let needSave = false;
                                    if (!settingsPage.currentSettings.userPrefs) {
                                        settingsPage.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
                                    }
                                    if (!settingsPage.currentSettings.userPrefs.manualSites.includes(normalizedSite)) {
                                        settingsPage.currentSettings.userPrefs.manualSites.push(normalizedSite);
                                        needSave = true;
                                    }
                                    if (needSave) {
                                        api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                                            console.error("[ProxyMust] Failed to save userPrefs on add from context menu:", err);
                                        });
                                        settingsPage.buildSitesDropdown();
                                    }
                                    const selectedProxies = settingsPage.readServers().filter(p => selectedProxyIds.includes(p.id));
                                    if (selectedProxies.length) {
                                        settingsPage.runExpressCycleTestForProxies(selectedProxies, normalizedSite);
                                    } else {
                                        messageBox.warning(api.i18n.getMessage("noProxiesSelected"));
                                    }
                                }
                            }
                        }
                        break;
                    case "stop_test":
                        settingsPage.cancelCurrentTest();
                        break;
                    case "clear_status_selected":
                        {
                            // English: Clear autoStatus for selected proxies only
                            // Russian: Очищаем autoStatus только для выбранных прокси
                            console.log("[ProxyMust] ========== НАЧАЛО ОЧИСТКИ СТАТУСОВ (выбранные) ==========");
                            console.log("[ProxyMust] selectedProxyIds:", selectedProxyIds);
                            console.log("[ProxyMust] currentSettings.autoStatus ДО очистки:", JSON.stringify(settingsPage.currentSettings.autoStatus, null, 2));
                            
                            if (selectedProxyIds.length === 0) {
                                messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies") || "No proxies selected.");
                                console.log("[ProxyMust] Нет выбранных прокси, выход");
                                break;
                            }
                            const confirmMsg = api.i18n.getMessage("settingsContextMenuClearStatusesConfirmSelected") || `Clear test statuses for ${selectedProxyIds.length} selected proxy(ies)?`;
                            if (confirm(confirmMsg)) {
                                console.log("[ProxyMust] Пользователь подтвердил очистку");
                                if (!settingsPage.currentSettings.autoStatus) {
                                    settingsPage.currentSettings.autoStatus = {};
                                    console.log("[ProxyMust] autoStatus был пуст, создан новый объект");
                                }
                                let deletedCount = 0;
                                const clearedAutoStatus = JSON.parse(JSON.stringify(settingsPage.currentSettings.autoStatus));
                                for (const proxyId of selectedProxyIds) {
                                    if (clearedAutoStatus[proxyId]) {
                                        console.log("[ProxyMust] Удаляем статус для прокси:", proxyId, "=", JSON.stringify(clearedAutoStatus[proxyId]));
                                        delete clearedAutoStatus[proxyId];
                                        deletedCount++;
                                    } else {
                                        console.log("[ProxyMust] Для прокси", proxyId, "нет записей в autoStatus");
                                    }
                                }
                                console.log("[ProxyMust] Удалено записей:", deletedCount);
                                console.log("[ProxyMust] clearedAutoStatus ПОСЛЕ ОЧИСТКИ:", JSON.stringify(clearedAutoStatus, null, 2));
                                
                                // English: Send cleared statuses to background (Core) to update both memory and storage
                                // Russian: Отправляем очищенные статусы в фон (Core) для обновления памяти и хранилища
                                console.log("[ProxyMust] Отправляем очищенные autoStatus в Core через сообщение...");
                                PolyFill.runtimeSendMessage({
                                    command: "ClearProxyAutoStatus",
                                    autoStatus: clearedAutoStatus
                                }, (response: any) => {
                                    console.log("[ProxyMust] Ответ от Core:", response);
                                    if (response && response.success) {
                                        console.log("[ProxyMust] autoStatus успешно обновлён в Core и сохранён");
                                        settingsPage.currentSettings.autoStatus = clearedAutoStatus;
                                        settingsPage.refreshSettingsData();
                                        messageBox.info(api.i18n.getMessage("settingsContextMenuClearStatusesSuccess") || "Statuses cleared successfully.");
                                    } else {
                                        console.error("[ProxyMust] Ошибка при обновлении autoStatus в Core:", response?.error);
                                        messageBox.error("Failed to clear statuses. Please try again.");
                                    }
                                });
                            } else {
                                console.log("[ProxyMust] Пользователь ОТМЕНИЛ очистку");
                            }
                            console.log("[ProxyMust] ========== КОНЕЦ ОЧИСТКИ СТАТУСОВ (выбранные) ==========");
                        }
                        break;
                    case "clear_status_all":
                        {
                            // English: Clear autoStatus for all proxies in the table
                            // Russian: Очищаем autoStatus для всех прокси в таблице
                            console.log("[ProxyMust] ========== НАЧАЛО ОЧИСТКИ СТАТУСОВ (все) ==========");
                            console.log("[ProxyMust] currentSettings.autoStatus ДО очистки:", JSON.stringify(settingsPage.currentSettings.autoStatus, null, 2));
                            
                            const confirmMsg = api.i18n.getMessage("settingsContextMenuClearStatusesConfirmAll") || "Clear test statuses for ALL proxies? This action cannot be undone.";
                            if (confirm(confirmMsg)) {
                                console.log("[ProxyMust] Пользователь подтвердил очистку ВСЕХ статусов");
                                const clearedAutoStatus = {};
                                console.log("[ProxyMust] clearedAutoStatus ПОСЛЕ ОЧИСТКИ = {}");
                                
                                // English: Send cleared statuses to background (Core) to update both memory and storage
                                // Russian: Отправляем очищенные статусы в фон (Core) для обновления памяти и хранилища
                                console.log("[ProxyMust] Отправляем очищенные autoStatus (все) в Core через сообщение...");
                                PolyFill.runtimeSendMessage({
                                    command: "ClearProxyAutoStatus",
                                    autoStatus: clearedAutoStatus
                                }, (response: any) => {
                                    console.log("[ProxyMust] Ответ от Core:", response);
                                    if (response && response.success) {
                                        console.log("[ProxyMust] autoStatus (все) успешно обновлён в Core и сохранён");
                                        settingsPage.currentSettings.autoStatus = clearedAutoStatus;
                                        settingsPage.refreshSettingsData();
                                        messageBox.info(api.i18n.getMessage("settingsContextMenuClearStatusesSuccess") || "Statuses cleared successfully.");
                                    } else {
                                        console.error("[ProxyMust] Ошибка при обновлении autoStatus (все) в Core:", response?.error);
                                        messageBox.error("Failed to clear statuses. Please try again.");
                                    }
                                });
                            } else {
                                console.log("[ProxyMust] Пользователь ОТМЕНИЛ очистку ВСЕХ статусов");
                            }
                            console.log("[ProxyMust] ========== КОНЕЦ ОЧИСТКИ СТАТУСОВ (все) ==========");
                        }
                        break;
                }
                menu.remove();
                settingsPage.refreshSettingsData();
            });
        });

        // Show submenu on hover
        menu.querySelectorAll(".submenu").forEach(sub => {
            sub.addEventListener("mouseenter", () => {
                const submenu = sub.querySelector(".submenu-content");
                if (submenu) (submenu as HTMLElement).style.display = "block";
            });
            sub.addEventListener("mouseleave", () => {
                const submenu = sub.querySelector(".submenu-content");
                if (submenu) (submenu as HTMLElement).style.display = "none";
            });
        });

        const closeHandler = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) {
                menu.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 0);
    }

    // private static isManualSite(site: string): boolean {
    //     if (!settingsPage.currentSettings?.userPrefs?.manualSites) return false;
    //     const normalized = settingsPage.normalizeHost(site);
    //     if (!normalized) return false;
    //     return settingsPage.currentSettings.userPrefs.manualSites.includes(normalized);
    // }

    private static buildSitesDropdown(): void {
        const $select = jq("#testSiteSelect");
        if (!$select.length) return;

        // English: Remember current selected value before rebuilding
        // Russian: Запоминаем текущее выбранное значение перед перестроением
        const currentValue = $select.val() as string;

        const sitesSet = new Set<string>();

        if (settingsPage.currentSettings?.proxyProfiles) {
            for (const profile of settingsPage.currentSettings.proxyProfiles) {
                for (const rule of profile.proxyRules || []) {
                    if (rule.hostName) {
                        const host = settingsPage.normalizeHost(rule.hostName);
                        if (host) sitesSet.add(host);
                    }
                }
            }
        }

        if (settingsPage.currentSettings?.userPrefs?.manualSites) {
            for (const site of settingsPage.currentSettings.userPrefs.manualSites) {
                const normalized = settingsPage.normalizeHost(site);
                if (normalized) sitesSet.add(normalized);
            }
        }

        const sitesArray = Array.from(sitesSet).sort((a, b) => a.localeCompare(b));
        $select.empty();

        if (sitesArray.length === 0) {
            $select.append(jq("<option>").text("— No sites —").val(""));
        } else {
            for (const site of sitesArray) {
                $select.append(jq("<option>").text(site).val(site));
            }
        }

        // English: Restore previously selected value if it exists in the new list
        // Russian: Восстанавливаем ранее выбранное значение, если оно существует в новом списке
        if (currentValue && sitesArray.includes(currentValue)) {
            $select.val(currentValue);
        }
    }

    private static addManualSite(): void {
        const siteInput = prompt(
            api.i18n.getMessage("settingsProxyMustAddSitePrompt") ||
            "Enter site domain (e.g. youtube.com):"
        );
        if (!siteInput) return;

        const normalized = settingsPage.normalizeHost(siteInput);
        if (!normalized) {
            messageBox.error(api.i18n.getMessage("settingsProxyMustInvalidDomain") || "Invalid domain.");
            return;
        }

        const existing = new Set<string>();
        if (settingsPage.currentSettings?.userPrefs?.manualSites) {
            settingsPage.currentSettings.userPrefs.manualSites.forEach(s => existing.add(s.toLowerCase()));
        }
        if (settingsPage.currentSettings?.proxyProfiles) {
            for (const profile of settingsPage.currentSettings.proxyProfiles) {
                for (const rule of profile.proxyRules || []) {
                    if (rule.hostName) existing.add(settingsPage.normalizeHost(rule.hostName));
                }
            }
        }

        if (existing.has(normalized)) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustSiteAlreadyExists") || "Site already exists.");
            return;
        }

        if (!settingsPage.currentSettings.userPrefs) {
            settingsPage.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
        }
        settingsPage.currentSettings.userPrefs.manualSites.push(normalized);
        settingsPage.changeTracking.options = true;

        if (settingsPage.currentSettings.userPrefs) {
            api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                console.error("[ProxyMust] Failed to save userPrefs on addManualSite:", err);
            });
        }

        settingsPage.buildSitesDropdown();
        // English: Restore selection to the newly added site
        // Russian: Восстанавливаем выбор на только что добавленном сайте
        jq("#testSiteSelect").val(normalized);
        messageBox.success(api.i18n.getMessage("settingsProxyMustSiteAdded").replace("{0}", normalized));
    }

    private static removeManualSite(): void {
        const $select = jq("#testSiteSelect");
        const selectedSite = $select.val() as string;
        if (!selectedSite) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoSiteSelected") || "No site selected.");
            return;
        }

        // Нормализуем сайт для поиска в правилах
        const normalizedSite = settingsPage.normalizeHost(selectedSite);
        if (!normalizedSite) {
            messageBox.error(api.i18n.getMessage("settingsProxyMustInvalidDomain") || "Invalid domain.");
            return;
        }

        // Проверяем, есть ли правило для этого сайта в профиле SmartRules
        let hasRule = false;
        const smartRulesProfile = settingsPage.currentSettings?.proxyProfiles?.find(p => p.profileType === SmartProfileType.SmartRules);
        if (smartRulesProfile) {
            const rule = smartRulesProfile.proxyRules?.find(r => r.hostName === normalizedSite);
            if (rule) {
                hasRule = true;
            }
        }

        // Определяем текст подтверждения в зависимости от наличия правила
        let confirmMsg: string;
        if (hasRule) {
            confirmMsg = (api.i18n.getMessage("settingsProxyMustConfirmRemoveSiteWithRule") || 
                'Remove "{0}" from test sites and delete its AutoProxy rule?').replace("{0}", selectedSite);
        } else {
            confirmMsg = (api.i18n.getMessage("settingsProxyMustConfirmRemoveSite") || 
                'Remove "{0}" from test sites?').replace("{0}", selectedSite);
        }

        messageBox.confirm(confirmMsg, () => {
            // 1. Если есть правило — удаляем его
            if (hasRule && smartRulesProfile) {
                const rule = smartRulesProfile.proxyRules.find(r => r.hostName === normalizedSite);
                if (rule) {
                    const ruleIndex = smartRulesProfile.proxyRules.indexOf(rule);
                    if (ruleIndex !== -1) {
                        smartRulesProfile.proxyRules.splice(ruleIndex, 1);
            // Сохраняем профиль
            SettingsOperation.saveSmartProfiles();
            SettingsOperation.saveAllSync(false);
            // Обновляем ProxyEngine через background
            PolyFill.runtimeSendMessage({
                command: "SaveProfileAndRefresh",
                profileId: smartRulesProfile.profileId
            });
                        // Перезагружаем таблицы правил
                        for (const pageProfile of settingsPage.pageSmartProfiles) {
                            if (pageProfile.grdRules && pageProfile.smartProfile) {
                                const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
                                pageProfile.grdRules.clear();
                                pageProfile.grdRules.rows.add(fixedRules);
                                pageProfile.grdRules.draw('full-hold');
                                settingsPage.refreshRulesGridAllRows(pageProfile);
                            }
                        }
                    }
                }
            }

// === ОЧИСТКА ЗАКРЕПЛЕНИЯ И ДИНАМИЧЕСКОГО ПРОКСИ ===
// English: Clear pinned proxy and dynamic override for this site
// Russian: Очищаем закреплённый прокси и динамическое переопределение для сайта
PolyFill.runtimeSendMessage({
    command: "ClearProxyAutoStatusForSite",
    site: normalizedSite
});
// === КОНЕЦ ОЧИСТКИ ===

            // 2. Удаляем из manualSites, если есть
            if (!settingsPage.currentSettings.userPrefs) {
                settingsPage.currentSettings.userPrefs = { staleHours: 6, manualSites: [] };
            }
            const index = settingsPage.currentSettings.userPrefs.manualSites.indexOf(selectedSite);
            if (index !== -1) {
                settingsPage.currentSettings.userPrefs.manualSites.splice(index, 1);
                if (settingsPage.currentSettings.userPrefs) {
                    api.storage.local.set({ userPrefs: settingsPage.currentSettings.userPrefs }).catch((err: any) => {
                        console.error("[ProxyMust] Failed to save userPrefs on removeManualSite:", err);
                    });
                }
            }

            // 3. Обновляем интерфейс
            settingsPage.buildSitesDropdown();
            if ($select.val() === selectedSite) {
                const newSite = $select.find("option:first").val();
                if (newSite) $select.val(newSite);
            }

            // 4. Обновляем таблицу ручных прокси (перерисовать)
            if (settingsPage.grdServers) {
                settingsPage.grdServers.draw('full-hold');
                settingsPage.grdServers.column(6).visible(true);
            }

            const successMsg = (api.i18n.getMessage("settingsProxyMustSiteRemoved") || 'Site "{0}" removed.').replace("{0}", selectedSite);
            messageBox.success(successMsg);
        });
    }

    private static attachPriorityClickHandler(): void {
        jq("#grdServers").off("click", ".rating-priority-cell").on("click", ".rating-priority-cell", function (this: HTMLElement, e: any) {
            e.stopPropagation();
            const row = settingsPage.grdServers.row(jq(this).closest("tr"));
            const server = row.data() as ProxyServer;
            if (!server) return;

            let newPriority: "pin" | "star" | null = null;
            if (server.priority === null || server.priority === undefined) newPriority = "star";
            else if (server.priority === "star") newPriority = "pin";
            else if (server.priority === "pin") newPriority = null;

            PolyFill.runtimeSendMessage({
                command: "SetProxyPriority",
                proxyId: server.id,
                priority: newPriority
            }, (response: any) => {
                if (response?.success) {
                    server.priority = newPriority;
                    if (!settingsPage.currentSettings.proxyPriority) settingsPage.currentSettings.proxyPriority = {};
                    if (newPriority === null) delete settingsPage.currentSettings.proxyPriority[server.id];
                    else settingsPage.currentSettings.proxyPriority[server.id] = newPriority;
                    settingsPage.changeTracking.servers = true;
                    settingsPage.refreshSettingsData();
                }
            });
        });
    }

    /**
     * English: Check express cycle test status and update button UI accordingly
     * Russian: Проверяет статус экспресс-циклического теста и обновляет UI кнопки
     * @deprecated Replaced by checkAllTestsStatus() which covers all test types
     */
    // private static checkExpressCycleTestStatus(): void {
    //     PolyFill.runtimeSendMessage({ command: "GET_EXPRESS_CYCLE_TEST_STATUS" }, (status: any) => {
    //         if (status && status.isRunning) {
    //             settingsPage.isTestingForSite = true;
    //             const $testBtn = jq("#runTestForAllBtn");
    //             $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
    //             $testBtn.removeClass("btn-primary").addClass("btn-danger");
    //             jq("#checkProgress").show();
    //             jq("#progressBar").val(status.completed).attr("max", status.total);
    //             jq("#progressText").text(`${status.completed}/${status.total}`);
    //         }
    //     });
    // }

    /**
     * English: Check all test types (standard, cycle, express cycle) and update UI accordingly
     * Russian: Проверяет все типы тестов (обычный, циклический, экспресс-циклический) и обновляет UI
     */
    private static checkAllTestsStatus() {
        // English: Standard proxy test (ProxyTester)
        // Russian: Обычный тест прокси (ProxyTester)
        PolyFill.runtimeSendMessage({ command: "GET_PROXY_TEST_STATUS" }, (status: any) => {
            if (status && status.isRunning) {
                settingsPage.isTestingForSite = true;
                const $testBtn = jq("#runTestForAllBtn");
                $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
                $testBtn.removeClass("btn-primary").addClass("btn-danger");
                jq("#checkProgress").show();
                jq("#progressBar").val(status.completed).attr("max", status.total);
                jq("#progressText").text(`${status.completed}/${status.total}`);
            }
        });
        // English: Cycle test (ProxyCycleTester)
        // Russian: Циклический тест (ProxyCycleTester)
        PolyFill.runtimeSendMessage({ command: "GET_CYCLE_TEST_STATUS" }, (status: any) => {
            if (status && status.isRunning) {
                settingsPage.isTestingForSite = true;
                const $testBtn = jq("#runTestForAllBtn");
                $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
                $testBtn.removeClass("btn-primary").addClass("btn-danger");
                jq("#checkProgress").show();
                jq("#progressBar").val(status.completed).attr("max", status.total);
                jq("#progressText").text(`${status.completed}/${status.total} — ${status.site || ''}`);
            }
        });
        // English: Express cycle test (ExpressProxyCycleTester)
        // Russian: Экспресс-циклический тест (ExpressProxyCycleTester)
        PolyFill.runtimeSendMessage({ command: "GET_EXPRESS_CYCLE_TEST_STATUS" }, (status: any) => {
            if (status && status.isRunning) {
                settingsPage.isTestingForSite = true;
                const $testBtn = jq("#runTestForAllBtn");
                $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
                $testBtn.removeClass("btn-primary").addClass("btn-danger");
                jq("#checkProgress").show();
                jq("#progressBar").val(status.completed).attr("max", status.total);
                jq("#progressText").text(`${status.completed}/${status.total} — ${status.site || ''}`);
            }
        });
    }
	
    private static resetTestButtonUI() {
        const $btn = jq("#runTestForAllBtn");
        $btn.text(api.i18n.getMessage("settingsProxyMustTestRun") || "Test");
        $btn.removeClass("btn-danger").addClass("btn-primary");
        settingsPage.isTestingForSite = false;
        jq("#checkProgress").hide();
        jq("#progressBar").val(0);
        jq("#progressText").text("");

        // English: Do NOT reload data from background, as it may have lost autoStatus.
        // The table already shows current statuses from CHECK_PROGRESS events.
        // Russian: НЕ перезагружаем данные из фона, так как они могут потерять autoStatus.
        // Таблица уже показывает текущие статусы из событий CHECK_PROGRESS.
        // settingsPage.refreshSettingsData();
    }

    private static runTestForProxies(proxies: ProxyServer[], site: string | null = null, isExpress: boolean = false): void {
        if (settingsPage.isTestingForSite) {
            PolyFill.runtimeSendMessage({ command: "CANCEL_PROXY_TEST_FOR_SITE" });
            settingsPage.resetTestButtonUI();
            return;
        }

        if (!proxies || !proxies.length) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
            return;
        }

        let testSite = site;
        if (!testSite) {
            const siteSelect = document.getElementById("testSiteSelect") as HTMLSelectElement;
            if (siteSelect && siteSelect.value) {
                testSite = siteSelect.value;
            }
        }
        if (!testSite) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoSiteSelected") || "Please select a site.");
            return;
        }

        settingsPage.isTestingForSite = true;
        const $testBtn = jq("#runTestForAllBtn");
        $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
        $testBtn.removeClass("btn-primary").addClass("btn-danger");
        jq("#checkProgress").show();
        jq("#progressBar").val(0).attr("max", proxies.length);
        jq("#progressText").text(`0/${proxies.length}`);

        const command = isExpress ? "START_PROXY_TEST_FOR_SITE_EXPRESS" : "START_PROXY_TEST_FOR_SITE";

        PolyFill.runtimeSendMessage({
            command: command,
            site: testSite,
            proxies: proxies.map(p => ({
                id: p.id,
                host: p.host,
                port: p.port,
                protocol: p.protocol
            }))
        });
    }
	

    private static runCycleTestForProxies(proxies: ProxyServer[], site: string | null = null): void {
        // English: Run cycle test for selected proxies (full switching test)
        // Russian: Запуск циклического теста для выбранных прокси (тест с полным переключением)
        if (settingsPage.isTestingForSite) {
            // English: Send correct cancel command for cycle test
            // Russian: Отправляем правильную команду отмены для циклического теста
            PolyFill.runtimeSendMessage({ command: "CANCEL_CYCLE_TEST_FOR_SITE" });
            settingsPage.resetTestButtonUI();
            return;
        }

        if (!proxies || !proxies.length) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
            return;
        }

        let testSite = site;
        if (!testSite) {
            const siteSelect = document.getElementById("testSiteSelect") as HTMLSelectElement;
            if (siteSelect && siteSelect.value) {
                testSite = siteSelect.value;
            }
        }
        if (!testSite) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoSiteSelected") || "Please select a site.");
            return;
        }

        settingsPage.isTestingForSite = true;
        const $testBtn = jq("#runTestForAllBtn");
        $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
        $testBtn.removeClass("btn-primary").addClass("btn-danger");
        jq("#checkProgress").show();
        jq("#progressBar").val(0).attr("max", proxies.length);
        jq("#progressText").text(`0/${proxies.length}`);

        // English: Send cycle test command to background
        // Russian: Отправляем команду на запуск циклического теста в фон
        PolyFill.runtimeSendMessage({
            command: "START_CYCLE_TEST_FOR_SITE",
            site: testSite,
            proxies: proxies.map(p => ({
                id: p.id,
                host: p.host,
                port: p.port,
                protocol: p.protocol
            }))
        });
    }

    /**
     * English: Runs express cycle test for selected proxies (fast sequential switching with 10s timeout)
     * Russian: Запускает экспресс-циклический тест для выбранных прокси (быстрое последовательное переключение с таймаутом 10с)
     */
    private static runExpressCycleTestForProxies(proxies: ProxyServer[], site: string | null = null): void {
        if (settingsPage.isTestingForSite) {
            PolyFill.runtimeSendMessage({ command: "CANCEL_EXPRESS_CYCLE_TEST_FOR_SITE" });
            settingsPage.resetTestButtonUI();
            return;
        }

        if (!proxies || !proxies.length) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
            return;
        }

        let testSite = site;
        if (!testSite) {
            const siteSelect = document.getElementById("testSiteSelect") as HTMLSelectElement;
            if (siteSelect && siteSelect.value) {
                testSite = siteSelect.value;
            }
        }
        if (!testSite) {
            messageBox.warning(api.i18n.getMessage("settingsProxyMustNoSiteSelected") || "Please select a site.");
            return;
        }

        settingsPage.isTestingForSite = true;
        const $testBtn = jq("#runTestForAllBtn");
        $testBtn.text(api.i18n.getMessage("settingsProxyTestStopButton") || "Stop");
        $testBtn.removeClass("btn-primary").addClass("btn-danger");
        jq("#checkProgress").show();
        jq("#progressBar").val(0).attr("max", proxies.length);
        jq("#progressText").text(`0/${proxies.length}`);

        PolyFill.runtimeSendMessage({
            command: "START_EXPRESS_CYCLE_TEST_FOR_SITE",
            site: testSite,
            proxies: proxies.map(p => ({
                id: p.id,
                host: p.host,
                port: p.port,
                protocol: p.protocol
            }))
        });
    }

    private static cancelCurrentTest(): void {
        if (settingsPage.isTestingForSite) {
            // English: Immediately show stop message in the log
            // Russian: Немедленно показываем сообщение об остановке в логе
            const container = document.getElementById('logContainer');
			if (container) {
				renderLogMessage(container, { type: 'stop', timestamp: Date.now() });
			}
            // English: Send cancel commands for all possible test types
            // Russian: Отправляем команды отмены для всех возможных типов тестов
            PolyFill.runtimeSendMessage({ command: "CANCEL_PROXY_TEST_FOR_SITE" });
            PolyFill.runtimeSendMessage({ command: "CANCEL_CYCLE_TEST_FOR_SITE" });
            PolyFill.runtimeSendMessage({ command: "CANCEL_EXPRESS_CYCLE_TEST_FOR_SITE" });
            settingsPage.resetTestButtonUI();
        }
    }

    // private static reloadSettingsPage(delayMs: number = 500): void {
    //     let activeTabSelector = null;
    //     const activeTabPane = document.querySelector('.tab-pane.active');
    //     if (activeTabPane && activeTabPane.id) {
    //         activeTabSelector = `#${activeTabPane.id}`;
    //     } else {
    //         const activeLink = document.querySelector('.nav-link.active');
    //         if (activeLink && activeLink.getAttribute('href')) {
    //             activeTabSelector = activeLink.getAttribute('href');
    //         }
    //     }
    //
    //     if (activeTabSelector) {
    //         localStorage.setItem('proxyMust_activeTab', activeTabSelector);
    //     }
    //
    //     jq(window).off("beforeunload");
    //     setTimeout(() => {
    //         window.location.reload();
    //     }, delayMs);
    // }


    private static restoreActiveTab(): void {
        const savedTab = localStorage.getItem('proxyMust_activeTab');
        if (!savedTab) return;

        localStorage.removeItem('proxyMust_activeTab');

        const targetLink = document.querySelector(`.nav-link[href="${savedTab}"]`) as HTMLElement;
        if (!targetLink) {
            console.warn("[RestoreTab] Ссылка не найдена:", savedTab);
            return;
        }

        const doSwitch = () => {
            if (typeof bootstrap !== 'undefined' && bootstrap.Tab) {
                const tab = bootstrap.Tab.getOrCreateInstance(targetLink);
                tab.show();
            } else {
                targetLink.click();
            }

            document.querySelectorAll('.nav-link').forEach(link => {
                const href = link.getAttribute('href');
                if (href === savedTab) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            const targetPane = document.querySelector(savedTab);
            if (targetPane) {
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('active', 'show');
                });
                targetPane.classList.add('active', 'show');
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(doSwitch, 50));
        } else {
            setTimeout(doSwitch, 50);
        }
    }
    private static initTestControl(): void {
        const $testSelect = jq("#testSiteSelect");
        const $testBtn = jq("#runTestForAllBtn");
        const $addSiteBtn = jq("#addSiteBtn");
        const $removeSiteBtn = jq("#removeSiteBtn");

        if (!$testSelect.length) return;

        settingsPage.buildSitesDropdown();
        // English: Trigger change event to apply statuses for the initially selected site
        // Russian: Вызываем событие change, чтобы применить статусы для изначально выбранного сайта
        $testSelect.trigger('change');
		// English: Check if express cycle test is already running and update button state
        // Russian: Проверяем, запущен ли экспресс-циклический тест, и обновляем состояние кнопки
        settingsPage.checkAllTestsStatus();

        // === НОВЫЙ ОБРАБОТЧИК ===
        // English: When site selection changes, refresh the proxy table to show updated statuses
        // Russian: При смене сайта обновляем таблицу прокси, чтобы показать актуальные статусы
        $testSelect.off("change").on("change", function() {
            console.log("[ProxyMust] Сайт изменён, обновляем таблицу прокси");
            if (settingsPage.grdServers) {
                // English: Invalidate all rows to force re-render with new site
                // Russian: Инвалидируем все строки, чтобы принудительно перерисовать с новым сайтом
                settingsPage.grdServers.rows().invalidate();
                settingsPage.grdServers.draw('full-hold');
                // English: Ensure rating column is visible (may be hidden if rating disabled)
                // Russian: Убеждаемся, что колонка рейтинга видима (может быть скрыта, если рейтинг отключён)
                settingsPage.grdServers.column(6).visible(true);
            }
            // English: Update rules tables for all profiles to reflect statuses for this site
            // Russian: Обновляем таблицы правил для всех профилей, чтобы отразить статусы для этого сайта
            for (const pageProfile of settingsPage.pageSmartProfiles) {
                if (pageProfile.grdRules) {
                    const fixedRules = ProxyRule.assignArray(pageProfile.smartProfile.proxyRules || []);
                    pageProfile.grdRules.clear();
                    pageProfile.grdRules.rows.add(fixedRules);
                    pageProfile.grdRules.draw('full-hold');
                    settingsPage.refreshRulesGridAllRows(pageProfile);
                }
            }
        });
        // === КОНЕЦ НОВОГО ОБРАБОТЧИКА ===

        $testBtn.off("click").on("click", async () => {
            // English: if test is already running, cancel it without showing dialog
            // Russian: если тест уже запущен, отменяем его без показа диалога
            if (settingsPage.isTestingForSite) {
                settingsPage.cancelCurrentTest();
                return;
            }

            const site = $testSelect.val() as string;
			if (!site) {
				messageBox.warning(api.i18n.getMessage("settingsProxyMustNoSiteSelected"));
				return;
			}

            let proxies: ProxyServer[];
            const selectedRows = settingsPage.grdServers.rows({ selected: true });
            if (selectedRows.count() > 0) {
                proxies = selectedRows.data().toArray();
            } else {
                proxies = settingsPage.readServers();
            }

            if (!proxies.length) {
                messageBox.warning(api.i18n.getMessage("settingsProxyMustNoProxies"));
                return;
            }

            // Create modal dialog dynamically
            const modalId = "testTypeSelectModal";
            let $modal = jq("#" + modalId);
            if (!$modal.length) {
            const modalHtml = `
                <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="${modalId}Label" aria-hidden="true">
                    <div class="modal-dialog" role="document">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="${modalId}Label">${api.i18n.getMessage("settingsChooseTestTypeTitle") || "Select test type"}</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <p>${api.i18n.getMessage("settingsChooseTestTypeDescription") || "Choose which test to run:"}</p>
                                <div class="list-group">
                                    <button type="button" id="cycleTestBtn" class="list-group-item list-group-item-action">
                                        <strong>🔄 ${api.i18n.getMessage("settingsContextMenuCycleTest") || "Cycle test (full switching)"}</strong>
                                        <br><small class="text-muted">${api.i18n.getMessage("settingsCycleTestDesc") || "Sequentially switches proxies, tests site loading. More thorough but slower."}</small>
                                    </button>
                                    <button type="button" id="expressCycleTestBtn" class="list-group-item list-group-item-action">
                                        <strong>⚡🔄 ${api.i18n.getMessage("settingsContextMenuExpressCycleTest") || "Express cycle test (fast switching)"}</strong>
                                        <br><small class="text-muted">${api.i18n.getMessage("settingsExpressCycleTestDesc") || "Fast sequential proxy switching, 10s timeout, works on first success"}</small>
                                    </button>
                                    <button type="button" id="preciseTestBtn" class="list-group-item list-group-item-action">
                                        <strong>🔍 ${api.i18n.getMessage("settingsContextMenuPreciseTest") || "Precise test (slower, more accurate)"}</strong>
                                        <br><small class="text-muted">${api.i18n.getMessage("settingsPreciseTestDesc") || "Full check, more accurate but takes longer."}</small>
                                    </button>
                                    <button type="button" id="expressTestBtn" class="list-group-item list-group-item-action">
                                        <strong>⚡ ${api.i18n.getMessage("settingsContextMenuExpressTest") || "Express test (fast, less accurate)"}</strong>
                                        <br><small class="text-muted">${api.i18n.getMessage("settingsExpressTestDesc") || "Express test, may skip some working proxies, but finds at least one quickly."}</small>
                                    </button>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${api.i18n.getMessage("settingsCancelButton") || "Cancel"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            $modal = jq(modalHtml).appendTo("body");
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                $modal.data("bs.modal", new bootstrap.Modal($modal[0]));
            }
            // English: Hide non-working test types in Firefox
            // Russian: Скрываем неработающие типы тестов в Firefox
            if (environment.name === "Firefox") {
                $modal.find("#preciseTestBtn, #expressTestBtn").hide();
            }
        }
        $modal.off("click", "#preciseTestBtn");
            $modal.off("click", "#expressTestBtn");
            $modal.on("click", "#preciseTestBtn", () => {
                $modal.modal("hide");
                settingsPage.runTestForProxies(proxies, site, false);
            });
            $modal.on("click", "#expressTestBtn", () => {
                $modal.modal("hide");
                settingsPage.runTestForProxies(proxies, site, true);
            });
            $modal.on("click", "#cycleTestBtn", () => {
                $modal.modal("hide");
                settingsPage.runCycleTestForProxies(proxies, site);
            });
            $modal.on("click", "#expressCycleTestBtn", () => {
                $modal.modal("hide");
                settingsPage.runExpressCycleTestForProxies(proxies, site);
            });
            $modal.modal("show");
        });

        $addSiteBtn.off("click").on("click", () => {
            settingsPage.addManualSite();
        });

        if ($removeSiteBtn.length) {
            $removeSiteBtn.off("click").on("click", () => {
                settingsPage.removeManualSite();
            });
        }
    }
    /**
     * English: Toggles visibility of protocol switch mode selector based on auto-detect checkbox state
     * Russian: Переключает видимость селектора режима перебора протоколов в зависимости от состояния чекбокса автоопределения
     */
    private static toggleProtocolSwitchModeVisibility(enabled: boolean): void {
        const $container = jq("#protocolSwitchModeContainer");
        if (enabled) {
            $container.slideDown(200);
        } else {
            $container.slideUp(200);
        }
    }
}

settingsPage.initialize();