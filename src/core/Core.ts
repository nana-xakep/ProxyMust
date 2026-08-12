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
import { api, environment } from '../lib/environment';
import { ProxyAuthentication } from './ProxyAuthentication';
import { Debug, DiagDebug } from '../lib/Debug';
import { SettingsOperation } from './SettingsOperation';
import { ProxyTester } from "./ProxyTester";
import { ProxyCycleTester } from "./ProxyCycleTester";
import { ExpressProxyCycleTester } from "./ExpressProxyCycleTester";
import { ProxyEngine } from './ProxyEngine';
import { PolyFill } from '../lib/PolyFill';
import { TabManager, TabDataType } from './TabManager';
import { Utils } from '../lib/Utils';
// import { UpdateManager } from './UpdateManager'; // disabled for ProxyMust
import { ProxyRules } from './ProxyRules';
import { TabRequestLogger } from './TabRequestLogger';
import { WebFailedRequestMonitor } from './WebFailedRequestMonitor';
import { SubscriptionUpdater } from './SubscriptionUpdater';
import { Settings } from './Settings';
import {
    CommandMessages,
    SettingsPageInternalDataType,
    PopupInternalDataType,
    ProxyableInternalDataType,
    ProxyServer,
    ResultHolderGeneric,
    CompiledProxyRulesMatchedSource,
    SmartProfile,
    SmartProfileType,
    ProxyRule,
    ProxyRuleType,
    PartialThemeDataType,
    TabProxyStatus,
} from './definitions';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { ProxyEngineSpecialRequests } from './ProxyEngineSpecialRequests';
import { ProfileOperations } from './ProfileOperations';
import { ProfileRules } from './ProfileRules';
import { Icons } from './Icons';
import { TestManager } from './TestManager';
import { AutoStatusService } from './AutoStatusService';

const subscriptionUpdaterLib = SubscriptionUpdater;
const proxyEngineLib = ProxyEngine;
const settingsLib = Settings;
const settingsOperationLib = SettingsOperation;
const iconsLib = Icons;


/**
 * Cross-browser runtime detection - use instead of direct chrome checks
 */
const isChromeRuntime = (): boolean => {
    // English: Use api.runtime for cross-browser compatibility
    // Russian: Используем api.runtime для кроссбраузерной совместимости
    return api.runtime !== undefined && 
           typeof api.runtime.sendMessage === 'function';
};
export class Core {
	/** Start the application */
	public static initializeApp() {

		Debug.disable(); // comment this for debugging
		//Debug.enableDiagnostics(true); // uncomment for verbose logs

		proxyEngineLib.configureEnginePrematurely();

		const settingReadComplete = () => {
			DiagDebug?.trace("Core.settingReadComplete start");
			// on settings read success
			// Note: this might run twice, one for local, one for remotely synced data

			// register the proxy when config is ready
			proxyEngineLib.registerEngine();

			// set the title
			Core.setBrowserActionStatus();

			// update the timers
			subscriptionUpdaterLib.setServerSubscriptionsRefreshTimers();
			subscriptionUpdaterLib.reloadEmptyServerSubscriptions();

			subscriptionUpdaterLib.setRulesSubscriptionsRefreshTimers();
			subscriptionUpdaterLib.reloadEmptyRulesSubscriptions();

			subscriptionUpdaterLib.updateProxyServerSubscriptionsCountryCode();

			// check for updates, in all browsers
			// UpdateManager.readUpdateInfo(); // disabled for ProxyMust

			DiagDebug?.trace("Core.settingReadComplete end");

			Core.dumpDiagnosticsInfo();
		};

		settingsLib.onInitializedLocally = settingReadComplete;
		settingsLib.onInitializedRemoteSync = settingReadComplete;
		settingsLib.initialize();

		// start handling messages
		Core.registerMessageReader();

        // tracking active tab
        TabManager.initializeTracking();
        // English: Listen to active tab changes to update popup dynamically
        // Russian: Слушаем изменения активной вкладки для динамического обновления попапа
        api.tabs.onActivated.addListener((activeInfo: any) => {
            // English: Send message to popup (if open) to refresh data
            // Russian: Отправляем сообщение в попап (если открыт) для обновления данных
            PolyFill.runtimeSendMessage({
                command: CommandMessages.PopupActiveTabChanged,
                tabId: activeInfo.tabId
            });
            // English: Check if there is a pending dialog for this tab
            // Russian: Проверяем, есть ли отложенный диалог для этой вкладки
            if (Core._pendingDialogs.has(activeInfo.tabId)) {
                const pending = Core._pendingDialogs.get(activeInfo.tabId);
                console.log(`[Core] Вкладка ${activeInfo.tabId} активирована, показываем отложенный диалог для ${pending.site}`);
                // English: Remove from pending before showing to avoid loops
                // Russian: Удаляем из ожидающих перед показом, чтобы избежать зацикливания
                Core._pendingDialogs.delete(activeInfo.tabId);
                // English: Open the dialog
                // Russian: Открываем диалог
                Core._createDialogWindow(pending.params.url, pending.params.dialogKey);
            } else {
                // English: If no pending dialog, check if there is already an open dialog for this site
                // Russian: Если нет отложенного диалога, проверяем, есть ли уже открытый диалог для этого сайта
                const site = Core.getSiteForTab(activeInfo.tabId);
                if (site) {
                    const dialogKey = `pin_${site}`;
                    if (Core._openDialogs.has(dialogKey)) {
                        const winId = Core._openDialogs.get(dialogKey);
                        if (winId) {
                            // English: Focus the existing dialog window
                            // Russian: Фокусируем существующее окно диалога
                            api.windows.update(winId, { focused: true });
                            console.log(`[Core] Focused existing dialog for ${site}`);
                        }
                    }
                }
            }
        });
        // English: Clean up pending dialogs when tab is closed
        // Russian: Очищаем ожидающие диалоги при закрытии вкладки
        api.tabs.onRemoved.addListener((tabId: number) => {
            if (Core._pendingDialogs.has(tabId)) {
                console.log(`[Core] Вкладка ${tabId} закрыта, удаляем отложенный диалог`);
                Core._pendingDialogs.delete(tabId);
            }
        });
        // English: Listen to webNavigation events to detect user-initiated reloads and typed navigations
        // Russian: Слушаем события webNavigation для обнаружения перезагрузок и ввода адреса пользователем
        if (api.webNavigation) {
            api.webNavigation.onCommitted.addListener((details: any) => {
                const tabId = details.tabId;
                if (tabId < 0) return;
                // English: Detect reload (F5) or typed (address bar entry)
                // Russian: Определяем перезагрузку (F5) или ввод адреса
                if (details.transitionType === 'reload' || details.transitionType === 'typed') {
                    WebFailedRequestMonitor.setUserInitiatedNavigation(tabId, details.transitionType);
                }
            });
        }
		// English: Listen for test log window closure to reset the reference
		// Russian: Слушаем закрытие окна лога для сброса ссылки
		api.windows.onRemoved.addListener((windowId) => {
			if (Core._testLogWindowId === windowId) {
				Core._testLogWindowId = null;
			}
		});
		TabManager.TabUpdated.on(Core.onTabUpdatedUpdateActionStatus);

		// register the request logger used for Proxyable Resources
		TabRequestLogger.startTracking();

		// Monitoring failed requests
		WebFailedRequestMonitor.startMonitor();

		// start proxy authentication request check
		ProxyAuthentication.startMonitor();

		// listen to shortcut events
		KeyboardShortcuts.startMonitor();

	}

	public static initializeFromServiceWorker() {
		// nothing yet!
	}
	
    // English: Track open dialogs to prevent duplicates (site -> dialog window id)
    // Russian: Отслеживаем открытые диалоги, чтобы предотвратить дублирование (сайт -> id окна диалога)
    private static _openDialogs: Map<string, number> = new Map();

    // English: Store pending dialogs per tab (site -> dialog data)
    // Russian: Хранилище ожидающих диалогов для каждой вкладки (сайт -> данные диалога)
    private static _pendingDialogs: Map<number, { site: string, type: 'pin' | 'change' | 'add_site', proxyId: string, proxyName: string, tabId: number, params: { url: string, dialogKey: string } }> = new Map();

	/**
	 * Unified message handler with cross-browser support
	 * Returns boolean for Chrome (async) or undefined for Firefox
	 */
	private static handleMessages(message: any, sender: any, sendResponse: Function): boolean | undefined {
		Debug.log('core message> ', message);

		let isCommand = false;
		let command: string;
		if (typeof message == 'string') command = message;
		else {
			command = message['command'];
			isCommand = true;
		}

		// Handle non-command messages
		if (!isCommand) {
			return Core.handleNonCommandMessages(message, sendResponse);
		}

		// Handle command messages with unified response pattern
		return Core.handleCommandMessages(message, command, sender, sendResponse);
	}

	/**
	 * Handle non-command messages with cross-browser response handling
	 */
	private static handleNonCommandMessages(message: any, sendResponse: Function): boolean | undefined {
		switch (message) {
			case CommandMessages.PopupGetInitialData:
				if (!sendResponse) return false;
				const dataForPopup = Core.getPopupInitialData();
				WebFailedRequestMonitor.enableFailedRequestNotification();
				sendResponse(dataForPopup);
				return false;

			case CommandMessages.SettingsPageGetInitialData:
				if (!sendResponse) return false;
				const dataForSettingsUi = Core.getSettingsPageInitialData();
				sendResponse(dataForSettingsUi);

				// Cross-browser workaround for first run issues
				// Use feature detection instead of environment.chrome
				if (isChromeRuntime()) {
					PolyFill.runtimeSendMessage({
						command: CommandMessages.SettingsPageGetInitialDataResponse,
						settingsPageInitialData: dataForSettingsUi
					});
				}
				return false;
		}
		return false;
	}

	/**
	 * Handle command messages with unified async/response pattern
	 * Returns true for async responses (Chrome), false/undefined otherwise
	 */
	private static handleCommandMessages(
		message: any, 
		command: string, 
		sender: any, 
		sendResponse: Function
	): boolean | undefined {
		
		switch (command) {
			case CommandMessages.ProxyableGetInitialData:
				return Core.handleProxyableGetInitialData(message, sendResponse);
				
            case "UPDATE_AUTO_STATUS":
                Core.handleUpdateAutoStatus(message, sendResponse);
                return false;
				
			case "DIRECT_IP_RESULT":
                // English: This message is handled by ProxyCycleTester via onMessage listener
                // Russian: Это сообщение обрабатывается ProxyCycleTester через onMessage
                if (sendResponse) sendResponse({ success: true });
                return false;	

			case CommandMessages.ProxyableRemoveProxyableLog:
				Core.handleProxyableRemoveProxyableLog(message);
				return false;

			case CommandMessages.PopupChangeActiveProfile:
				Core.handlePopupChangeActiveProfile(message);
				return false;

			case CommandMessages.PopupChangeActiveProxyServer:
				return Core.handlePopupChangeActiveProxyServer(message, sendResponse);

			case CommandMessages.PopupToggleProxyForDomain:
				Core.handlePopupToggleProxyForDomain(message);
				return false;

            case CommandMessages.PopupChangeProxyForRule:
                return Core.handlePopupChangeProxyForRule(message, sendResponse);
                
            case "PopupSetRuleWhitelist":
                return Core.handlePopupSetRuleWhitelist(message, sendResponse);
				
			case CommandMessages.PopupAddDomainListToProxyRule:
				return Core.handlePopupAddDomainListToProxyRule(message, sendResponse);

			case CommandMessages.PopupAddDomainListToIgnored:
				return Core.handlePopupAddDomainListToIgnored(message, sendResponse);

			case CommandMessages.SettingsPageSaveOptions:
				return Core.handleSettingsPageSaveOptions(message, sendResponse);

			case CommandMessages.SettingsPageSaveUiOption:
				return Core.handleSettingsPageSaveUiOption(message, sendResponse);

			case CommandMessages.SettingsPageSaveProxyServers:
				return Core.handleSettingsPageSaveProxyServers(message, sendResponse);

			case "START_PROXY_CHECK":
				return Core.handleStartProxyCheck(message, sendResponse);

			case CommandMessages.SettingsPageSaveSmartProfile:
				return Core.handleSettingsPageSaveSmartProfile(message, sendResponse);

			case CommandMessages.SettingsPageDeleteSmartProfile:
				return Core.handleSettingsPageDeleteSmartProfile(message, sendResponse);

			case CommandMessages.SettingsPageSaveProxySubscriptions:
				return Core.handleSettingsPageSaveProxySubscriptions(message, sendResponse);

			case CommandMessages.SettingsPageRestoreSettings:
				return Core.handleSettingsPageRestoreSettings(message, sendResponse);

			case CommandMessages.SettingsPageFactoryReset:
				Core.handleSettingsPageFactoryReset(sendResponse);
				return false;

			case CommandMessages.SettingsPageMakeRequestSpecial:
				Core.handleSettingsPageMakeRequestSpecial(message, sendResponse);
				return false;

			case CommandMessages.SettingsPageSkipWelcome:
				Core.handleSettingsPageSkipWelcome(sendResponse);
				return false;

			case CommandMessages.ProxyableToggleProxyableDomain:
				return Core.handleProxyableToggleProxyableDomain(message, sendResponse);

			case CommandMessages.DebugEnableDiagnostics:
				Core.handleDebugEnableDiagnostics();
				return false;

			case CommandMessages.DebugGetDiagnosticsLogs:
				return Core.handleDebugGetDiagnosticsLogs(sendResponse);

			case "CHECK_START":
				// English: Reset the test timeout timer on progress update
				// Russian: Сбрасываем таймер таймаута теста при обновлении прогресса
				TestManager.resetTimer();
				// English: Automatically open test log window when test starts
				// Russian: Автоматически открываем окно лога при старте теста
				Core.handleOpenTestLog((response) => {
					// Ignore response, just ensure window opens
				});
				break;

			case "CHECK_PROGRESS":
				// English: Reset the test timeout timer on progress update
				// Russian: Сбрасываем таймер таймаута теста при обновлении прогресса
				TestManager.resetTimer();
				// Pass through to let other handlers process if needed
				break;

			case "CHECK_COMPLETE":
			case "TEST_CANCELLED":
				// English: Release test lock when test finishes or is cancelled
				// Russian: Освобождаем блокировку теста при завершении или отмене
				TestManager.finishTest();
				// Pass through to let other handlers process if needed
				break;

			case CommandMessages.SettingsPageWebDavBackupNow:
				return Core.handleSettingsPageWebDavBackupNow(message, sendResponse);

			case CommandMessages.SettingsPageWebDavRestoreNow:
				return Core.handleSettingsPageWebDavRestoreNow(message, sendResponse);

			case "UpdateProxyRating":
				return Core.handleUpdateProxyRating(message, sendResponse);
				
			case "AddCurrentSiteToManual":
                return Core.handleAddCurrentSiteToManual(message, sendResponse);
				
            case "SetProxyPriority":
                return Core.handleSetProxyPriority(message, sendResponse);
				
			case "START_PROXY_TEST_FOR_SITE":
				return Core.handleStartProxyTestForSite(message, sendResponse);
				
			case "START_PROXY_TEST_FOR_SITE_EXPRESS":
				return Core.handleStartProxyTestForSiteExpress(message, sendResponse);
				
			case "START_QUICK_TEST_IN_POPUP":
                return Core.handleStartQuickTestInPopup(message, sendResponse);
				
            case "START_CYCLE_TEST_FOR_SITE":
                return Core.handleStartCycleTestForSite(message, sendResponse);
                
            case "START_EXPRESS_CYCLE_TEST_FOR_SITE":
                return Core.handleStartExpressCycleTestForSite(message, sendResponse);
				
			case "GET_PROXY_TEST_STATUS":
				return Core.handleGetProxyTestStatus(message, sendResponse);
				
			case "GET_EXPRESS_CYCLE_TEST_STATUS":
				return Core.handleGetExpressCycleTestStatus(message, sendResponse);	
				
			case "GET_CYCLE_TEST_STATUS":
				return Core.handleGetCycleTestStatus(message, sendResponse);
				
			case "CANCEL_PROXY_TEST_FOR_SITE":
				return Core.handleCancelProxyTestForSite(message, sendResponse);
				
            case "AddSubscriptionProxyToManual":
                Core.handleAddSubscriptionProxyToManual(message, sendResponse);
                
                return true;
            case "AddSiteToAutoRules":
                return Core.handleAddSiteToAutoRules(message, sendResponse);
            case "ForceAutoProxyRefresh":
                return Core.handleForceAutoProxyRefresh(message, sendResponse);
            case "SaveProfileAndRefresh":
                return Core.handleSaveProfileAndRefresh(message, sendResponse);
            case "ClearProxyAutoStatus":
                Core.handleClearProxyAutoStatus(message, sendResponse);
                return false;
            case "ClearProxyAutoStatusForSite":
                Core.handleClearProxyAutoStatusForSite(message, sendResponse);
                return false;
				
            case "DIRECT_IP_RESULT":
                // English: This message is handled by ProxyCycleTester via onMessage listener, just acknowledge
                // Russian: Это сообщение обрабатывается ProxyCycleTester через onMessage, просто подтверждаем
                if (sendResponse) sendResponse({ success: true });
                return false;
				
			case "CANCEL_CYCLE_TEST_FOR_SITE":
				return Core.handleCancelCycleTestForSite(message, sendResponse);	
				
			case "CANCEL_EXPRESS_CYCLE_TEST_FOR_SITE":
                return Core.handleCancelExpressCycleTestForSite(message, sendResponse);	
			case "OPEN_TEST_LOG":
				return Core.handleOpenTestLog(sendResponse);

			case "CLOSE_TEST_LOG":
				return Core.handleCloseTestLog(sendResponse);

			case "GET_TEST_LOG_HISTORY":
				return Core.handleGetTestLogHistory(sendResponse);
			
			case "TOGGLE_TEST_LOG_PIN":
				return Core.handleToggleTestLogPin(sendResponse);
			
            case CommandMessages.PopupRemoveProxyRule:
//console.log("[Core] Получена команда PopupRemoveProxyRule, message:", message)
                return Core.handlePopupRemoveProxyRule(message, sendResponse);

            case CommandMessages.PopupDisableProxyRule:
//console.log("[Core] Получена команда PopupDisableProxyRule, message:", message)
                return Core.handlePopupDisableProxyRule(message, sendResponse);

            case CommandMessages.PopupToggleProxyPerOriginForRule:
//console.log("[Core] Получена команда PopupToggleProxyPerOriginForRule, message:", message)
                return Core.handlePopupToggleProxyPerOriginForRule(message, sendResponse);
				
            case CommandMessages.AutoProxyDialogResponse:
                return Core.handleAutoProxyDialogResponse(message, sendResponse);				

            case "ClearSiteLockForSite":
                return Core.handleClearSiteLockForSite(message, sendResponse);
                
            case "SetUserSelectedProxy":
                Core.handleSetUserSelectedProxy(message, sendResponse);
                return false;
                
            case "AddToTempSkipList":
                Core.handleAddToTempSkipList(message, sendResponse);
                return false;
				
            case 'DIALOG_RESPONSE':
                return Core.handleDialogResponse(message, sendResponse);
				
            case CommandMessages.OpenChangeDialog:
                return Core.handleOpenChangeDialog(message, sendResponse);
                
            case "HandleAutoRefresh":
                return Core.handleAutoRefresh(message, sendResponse);
                
            case "SetRuleMode":
                return Core.handleSetRuleMode(message, sendResponse);

            case "ADD_UNREACHABLE_SITE":
                return Core.handleAddUnreachableSite(message, sendResponse);				
				
			default:
				if (sendResponse) sendResponse(null);
				return false;
		}
	}

	// ==================== Individual Handlers for Better Maintainability ====================

	private static handleProxyableGetInitialData(message: any, sendResponse: Function): boolean {
		if (message.tabId === null) return false;
		const tabId = message.tabId;
		const dataForProxyable = Core.getProxyableInitialData(tabId);
		
		if (dataForProxyable) TabRequestLogger.subscribeProxyableLogs(tabId);
		
		sendResponse(dataForProxyable);
		
		// Cross-browser workaround - use feature detection
		if (isChromeRuntime()) {
			PolyFill.runtimeSendMessage({
				command: CommandMessages.ProxyableGetInitialDataResponse,
				tabId: tabId,
				dataForProxyable: dataForProxyable
			});
		}
		return false;
	}
	
	    /**
     * English: Handles cancellation of express cycle test.
     * Russian: Обрабатывает отмену экспресс-циклического теста.
     */
    private static handleCancelExpressCycleTestForSite(message: any, sendResponse: Function): boolean {
        // English: Immediately send stop message to log
        // Russian: Немедленно отправляем сообщение об остановке в лог
        Core.sendTestLogStep({
            type: 'stop',
            timestamp: Date.now()
        });
        // English: Cancel failover as well
        // Russian: Отменяем также failover
        WebFailedRequestMonitor.cancelFailover();
        ExpressProxyCycleTester.cancelTest();
        if (sendResponse) sendResponse({ success: true });
        return false;
    }
	
    private static handleCancelProxyTestForSite(message: any, sendResponse: Function): boolean {
        // English: Immediately send stop message to log
        // Russian: Немедленно отправляем сообщение об остановке в лог
        Core.sendTestLogStep({
            type: 'stop',
            timestamp: Date.now()
        });
        // English: Cancel failover
        // Russian: Отменяем failover
        WebFailedRequestMonitor.cancelFailover();
        ProxyTester.cancelTestForSite().then(() => {
            if (sendResponse) sendResponse({ success: true });
        }).catch((err) => {
            if (sendResponse) sendResponse({ success: false, error: err.message });
        });
        return true;
    }	
	
	/**
 * English: Opens the test log window.
 * Russian: Открывает окно лога тестирования.
 */
	private static handleOpenTestLog(sendResponse: Function): boolean {
		if (Core._testLogWindowId !== null) {
			// Check if window still exists
			api.windows.get(Core._testLogWindowId, (win) => {
				if (api.runtime?.lastError || !win) {
					Core._testLogWindowId = null;
					Core._createTestLogWindow(sendResponse);
				} else {
					// Focus existing window
					api.windows.update(Core._testLogWindowId, { focused: true });
					if (sendResponse) sendResponse({ success: true, alreadyOpen: true });
				}
			});
			return true;
		} else {
			Core._createTestLogWindow(sendResponse);
			return true;
		}
	}

	/**
	 * English: Creates the test log window.
	 * Russian: Создаёт окно лога тестирования.
	 */
	private static _createTestLogWindow(sendResponse?: Function): void {
		const width = 450;
		const height = 900;
		api.windows.create({
			url: api.runtime.getURL('ui/test-log.html'),
			type: 'popup',
			width: width,
			height: height,
			focused: true
		}, (win) => {
			if (win) {
				Core._testLogWindowId = win.id;
				Core._testLogPinned = false; // Сброс закрепления при новом окне
				if (sendResponse) sendResponse({ success: true, windowId: win.id });
			} else {
				if (sendResponse) sendResponse({ success: false, error: 'Failed to create window' });
			}
		});
	}

	/**
	 * English: Closes the test log window.
	 * Russian: Закрывает окно лога тестирования.
	 */
	private static handleCloseTestLog(sendResponse: Function): boolean {
		if (Core._testLogWindowId !== null) {
			api.windows.remove(Core._testLogWindowId, () => {
				Core._testLogWindowId = null;
				if (sendResponse) sendResponse({ success: true });
			});
		} else {
			if (sendResponse) sendResponse({ success: false, error: 'No log window open' });
		}
		return true;
	}

	/**
	 * English: Toggles pin state of the test log window.
	 * Russian: Переключает состояние закрепления окна лога тестирования.
	 */
	private static handleToggleTestLogPin(sendResponse: Function): boolean {
		Core._testLogPinned = !Core._testLogPinned;
		if (sendResponse) {
			sendResponse({ success: true, pinned: Core._testLogPinned });
		}
		return false;
	}

	/**
	 * English: Returns the log history to the requesting window.
	 * Russian: Возвращает историю лога запрашивающему окну.
	 */
	private static handleGetTestLogHistory(sendResponse: Function): boolean {
		if (sendResponse) {
			sendResponse({ history: Core._logBuffer });
		}
		return false;
	}

	private static handleProxyableRemoveProxyableLog(message: any): void {
		if (message.tabId === null) return;
		TabRequestLogger.unsubscribeProxyableLogs(message.tabId);
	}

	private static handlePopupChangeActiveProfile(message: any): void {
		if (message.profileId === null || message.profileId === undefined) return;
		Core.ChangeActiveProfileId(message.profileId);
	}

	private static handlePopupChangeActiveProxyServer(message: any, sendResponse: Function): boolean {
		if (!message.id) return false;
		
		const proxy = settingsOperationLib.findProxyServerById(message.id);
		if (proxy != null) {
			Core.ChangeActiveProxy(proxy);
			if (sendResponse) sendResponse({ success: true });
		} else {
			if (sendResponse) sendResponse({ success: false });
		}
		return false;
	}

	private static handlePopupToggleProxyForDomain(message: any): void {
		if (!message.domain) return;
		ProfileRules.toggleRule(message.domain, message.ruleId);
		settingsOperationLib.saveSmartProfiles();
		settingsOperationLib.saveAllSync();
		proxyEngineLib.notifyProxyRulesChanged();
		Core.setBrowserActionStatus();
		PolyFill.runtimeSendMessage({ command: "REFRESH_SETTINGS_PAGE_RELOAD" });
	}

	private static handlePopupChangeProxyForRule(message: any, sendResponse: Function): boolean {
		if (!message.ruleId || message.proxyServerId === undefined) return false;
		
		const result = ProfileRules.changeProxyForRule(message.ruleId, message.proxyServerId);
		
		if (result.success) {
			// Find the site for this rule to clear lock
			let site = null;
			for (const profile of settingsLib.current.proxyProfiles) {
				const rule = profile.proxyRules.find(r => r.ruleId === message.ruleId);
				if (rule) {
					site = rule.hostName;
					break;
				}
			}
			if (site) {
				WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
				WebFailedRequestMonitor.clearSiteLock();
				ProxyEngine.clearDynamicProxyForSite(site);
//console.log(`[Core] Cleared lock and cache for site ${site} after rule proxy change`)
			}
			
			settingsOperationLib.saveSmartProfiles();
			settingsOperationLib.saveAllSync();
			proxyEngineLib.notifyProxyRulesChanged();
			Core.setBrowserActionStatus();
		}
		
        if (sendResponse) sendResponse(result);
        return false;
    }

    /**
     * English: Handles setting a rule to whitelist (no proxy)
     * Russian: Обрабатывает установку правила в белый список (без прокси)
     */
    private static handlePopupSetRuleWhitelist(message: any, sendResponse: Function): boolean {
        const { ruleId, whiteList } = message;
        if (!ruleId) {
            if (sendResponse) sendResponse({ success: false, error: 'Missing ruleId' });
            return false;
        }
        let found = false;
        for (const profile of Settings.current.proxyProfiles) {
            const rule = profile.proxyRules?.find(r => r.ruleId === ruleId);
            if (rule) {
                rule.whiteList = whiteList;
                if (whiteList) {
                    rule.proxyServerId = null;
                    rule.proxy = null;
                }
                found = true;
                break;
            }
        }
        if (found) {
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync();
            proxyEngineLib.notifyProxyRulesChanged();
            Core.setBrowserActionStatus();
            if (sendResponse) sendResponse({ success: true });
        } else {
            if (sendResponse) sendResponse({ success: false, error: 'Rule not found' });
        }
        return false;
    }

	private static handlePopupAddDomainListToProxyRule(message: any, sendResponse: Function): boolean {
		if (!message.domainList) return false;
		
		const result = ProfileRules.enableByHostnameList(message.domainList);
		const updatedFailedRequests = WebFailedRequestMonitor.removeDomainsFromTabFailedRequests(
			message.tabId, 
			message.domainList
		);
		
		proxyEngineLib.notifyProxyRulesChanged();
		settingsOperationLib.saveSmartProfiles();
		settingsOperationLib.saveAllSync();
		Core.setBrowserActionStatus();
		
		if (sendResponse) {
			sendResponse({
				result: result,
				failedRequests: updatedFailedRequests,
			});
		}
		return false;
	}

	private static handlePopupAddDomainListToIgnored(message: any, sendResponse: Function): boolean {
		if (!message.domainList) return false;
		
		const result = ProfileRules.enableByHostnameListIgnoreFailureRules(message.domainList);
		const updatedFailedRequests = WebFailedRequestMonitor.removeDomainsFromTabFailedRequests(
			message.tabId, 
			message.domainList
		);
		
		settingsOperationLib.saveSmartProfiles();
		settingsOperationLib.saveAllSync();
		settingsLib.updateActiveSettings();
		
		if (sendResponse) {
			sendResponse({
				result: result,
				failedRequests: updatedFailedRequests,
			});
		}
		return false;
	}

	private static handleSettingsPageSaveOptions(message: any, sendResponse: Function): boolean {
		if (!message.options) return false;
		
		settingsLib.current.options = message.options;
		settingsOperationLib.saveOptions();
		settingsOperationLib.saveAllSync();
		proxyEngineLib.updateBrowsersProxyConfig();
		
		if (sendResponse) {
			sendResponse({
				success: true,
				message: api.i18n.getMessage('settingsSaveOptionsSuccess'),
			});
		}
		return false;
	}

	private static handleSettingsPageSaveUiOption(message: any, sendResponse: Function): boolean {
		if (!message.uiOptions) return false;
		
		settingsLib.current.uiOptions = message.uiOptions;
		settingsOperationLib.saveUIOptions();
		
		if (sendResponse) {
			sendResponse({
				success: true,
				message: api.i18n.getMessage('settingsSaveUiOptionsSuccess') || 'UI options saved successfully.',
			});
		}
		return false;
	}

	private static handleSettingsPageSaveProxyServers(message: any, sendResponse: Function): boolean {
		if (!message.saveData) return false;
		
		SettingsOperation.sortProxyServers(message.saveData.proxyServers);
		settingsLib.current.proxyServers = message.saveData.proxyServers;
		settingsLib.current.defaultProxyServerId = message.saveData.defaultProxyServerId;
		settingsOperationLib.saveProxyServers();
		settingsOperationLib.updateSmartProfilesRulesProxyServer();
		settingsOperationLib.saveDefaultProxyServer();
		settingsOperationLib.saveAllSync();
		settingsLib.updateActiveSettings();
		proxyEngineLib.updateBrowsersProxyConfig();
		
		if (sendResponse) {
			sendResponse({
				success: true,
				message: 'Proxy servers saved successfully.',
			});
		}
		return false;
	}

	private static handleStartProxyCheck(message: any, sendResponse: Function): boolean {
		const testUrls = message.testUrls || [];
		ProxyTester.startCheck(testUrls);
		
		if (sendResponse) {
			sendResponse({ status: "started" });
		}
		return true; // Async operation - MUST return true for Chrome
	}

	private static handleSettingsPageSaveSmartProfile(message: any, sendResponse: Function): boolean {
		if (!message.smartProfile) return false;
		
		const smartProfile: SmartProfile = message.smartProfile;
		ProfileOperations.addUpdateProfile(smartProfile);
		
		settingsOperationLib.saveSmartProfiles();
		settingsOperationLib.saveAllSync();
		settingsLib.updateActiveSettings();
		subscriptionUpdaterLib.setRulesSubscriptionsRefreshTimers();
		proxyEngineLib.updateBrowsersProxyConfig();
		
		if (sendResponse) {
			sendResponse({
				success: true,
				message: api.i18n.getMessage('settingsSaveSmartProfileSuccess'),
				smartProfile: smartProfile
			});
		}
		return false;
	}

	private static handleSettingsPageDeleteSmartProfile(message: any, sendResponse: Function): boolean {
		if (!message.smartProfileId) return false;
		
		const deleteResult = ProfileOperations.deleteProfile(message.smartProfileId);
		
		if (deleteResult.success) {
			settingsOperationLib.saveSmartProfiles();
			settingsOperationLib.saveAllSync();
			settingsLib.updateActiveSettings();
			proxyEngineLib.updateBrowsersProxyConfig();
			
			if (sendResponse) {
				sendResponse({
					success: true,
					message: api.i18n.getMessage('settingsProfilesDeleteDone'),
				});
			}
		} else if (sendResponse) {
			sendResponse({
				success: false,
				message: deleteResult.message || api.i18n.getMessage('settingsProfilesDeleteFailed'),
			});
		}
		return false;
	}

	private static handleSettingsPageSaveProxySubscriptions(message: any, sendResponse: Function): boolean {
		if (!message.proxyServerSubscriptions) return false;
		
		settingsLib.current.proxyServerSubscriptions = message.proxyServerSubscriptions;
		settingsOperationLib.saveProxyServerSubscriptions();
		settingsOperationLib.saveAllSync();
		subscriptionUpdaterLib.setServerSubscriptionsRefreshTimers();
		subscriptionUpdaterLib.updateProxyServerSubscriptionsCountryCode();
		proxyEngineLib.updateBrowsersProxyConfig();
		
		if (sendResponse) {
			sendResponse({
				success: true,
				message: api.i18n.getMessage('settingsSaveProxyServerSubscriptionsSuccess'),
			});
		}
		return false;
	}

	private static handleSettingsPageRestoreSettings(message: any, sendResponse: Function): boolean {
		if (!message.fileData) return false;
		
		const result = settingsOperationLib.restoreBackup(message.fileData);
		if (sendResponse) sendResponse(result);
		return false;
	}

	private static handleSettingsPageFactoryReset(sendResponse: Function): void {
		settingsOperationLib.factoryReset();
		if (sendResponse) {
			sendResponse({
				success: true,
				message: api.i18n.getMessage('settingsFactoryResetSuccess')
			});
		}
	}

	private static handleSettingsPageMakeRequestSpecial(message: any, sendResponse: Function): void {
		if (!message.url) return;
		
		ProxyEngineSpecialRequests.setSpecialUrl(message.url, message.applyProxy, message.selectedProxy);
		if (sendResponse) sendResponse({ success: true });
	}

	private static handleSettingsPageSkipWelcome(sendResponse: Function): void {
		settingsLib.current.firstEverInstallNotified = true;
		settingsOperationLib.saveAllSync();
		if (sendResponse) sendResponse({ success: true });
	}

	private static handleProxyableToggleProxyableDomain(message: any, sendResponse: Function): boolean {
		if (!message.enableByDomain && !message.removeBySource) return false;
		
		let ruleResult;
		if (message.enableByDomain) {
			ruleResult = ProfileRules.enableByHostname(message.enableByDomain);
		} else {
			ruleResult = ProfileRules.removeByHostname(message.removeBySource, message.ruleId);
		}
		
		const result = {
			success: ruleResult.success,
			message: ruleResult.message,
			rule: ruleResult.rule,
			requests: null as any[],
		};
		
		if (ruleResult.success) {
			settingsOperationLib.saveSmartProfiles();
			settingsOperationLib.saveAllSync();
			proxyEngineLib.notifyProxyRulesChanged();
		}
		
		if (result && sendResponse) sendResponse(result);
		Core.setBrowserActionStatus();
		return false;
	}

	private static handleDebugEnableDiagnostics(): void {
		Debug.enableDiagnostics();
		Core.dumpDiagnosticsInfo();
	}

	private static handleDebugGetDiagnosticsLogs(sendResponse: Function): boolean {
		const result = DiagDebug?.getDiagLogs();
		if (result && sendResponse) sendResponse(result);
		return false;
	}

	private static handleSettingsPageWebDavBackupNow(message: any, sendResponse: Function): boolean {
		settingsOperationLib.handleWebDavBackupNow(
			message.serverUrl,
			message.backupFilename,
			message.username,
			message.password
		).then((result) => {
			// Cross-browser notification - use feature detection
			if (isChromeRuntime()) {
				PolyFill.runtimeSendMessage({
					command: CommandMessages.SettingsPageShowMessage,
					success: result.success,
					message: result.success 
						? api.i18n.getMessage('settingsGeneralWebDavBackupNowSuccess')
						: api.i18n.getMessage('settingsGeneralWebDavBackupNowFailed') + ' ' + result.message
				});
			}
			if (sendResponse) sendResponse(result);
		}).catch((error) => {
			console.error("[WebDav] Backup failed:", error);
			if (sendResponse) sendResponse({ success: false, message: error.message });
		});
		return true; // Async operation - MUST return true for Chrome
	}

	private static handleSettingsPageWebDavRestoreNow(message: any, sendResponse: Function): boolean {
		settingsOperationLib.handleWebDavRestoreNow(
			message.serverUrl,
			message.backupFilename,
			message.username,
			message.password
		).then((result) => {
			// Cross-browser notification - use feature detection
			if (isChromeRuntime()) {
				PolyFill.runtimeSendMessage({
					command: CommandMessages.SettingsPageShowMessage,
					success: result.success,
					message: result.success 
						? api.i18n.getMessage('settingsGeneralWebDavRestoreNowSuccess')
						: api.i18n.getMessage('settingsGeneralWebDavRestoreNowFailed') + ' ' + result.message
				});
			}
			if (sendResponse) sendResponse(result);
		}).catch((error) => {
			console.error("[WebDav] Restore failed:", error);
			if (sendResponse) sendResponse({ success: false, message: error.message });
		});
		return true; // Async operation - MUST return true for Chrome
	}

	private static handleUpdateProxyRating(message: any, sendResponse: Function): boolean {
		const success = SettingsOperation.updateProxyRating(message.proxyId, message.delta);
		if (sendResponse) sendResponse({ success: success });
		return false;
	}
	    /**
     * Adds current site to manualSites list
     * Добавляет текущий сайт в список manualSites
     */
    private static handleAddCurrentSiteToManual(message: any, sendResponse: Function): boolean {
        const { site } = message;
        if (!site) {
            if (sendResponse) sendResponse({ success: false });
            return false;
        }
        // English: ensure userPrefs exists
        // Russian: убеждаемся, что userPrefs существует
        if (!Settings.current.userPrefs) {
            Settings.current.userPrefs = { staleHours: 6, manualSites: [] };
        }
        if (!Settings.current.userPrefs.manualSites.includes(site)) {
            Settings.current.userPrefs.manualSites.push(site);
            // English: save only user preferences to local storage (no sync)
            // Russian: сохраняем только пользовательские настройки в локальное хранилище (без синхронизации)
            SettingsOperation.saveUserPreferences();
            SettingsOperation.saveAllSync(false);
        }
        if (sendResponse) sendResponse({ success: true });
        return false;
    }

    /**
     * Sets priority (pin/star/null) for a proxy
     * Устанавливает приоритет (pin/star/null) для прокси
     */
    private static handleSetProxyPriority(message: any, sendResponse: Function): boolean {
        const { proxyId, priority } = message;
        if (!proxyId) {
            if (sendResponse) sendResponse({ success: false });
            return false;
        }
        if (!Settings.current.proxyPriority) Settings.current.proxyPriority = {};
        if (priority === null) {
            delete Settings.current.proxyPriority[proxyId];
        } else {
            Settings.current.proxyPriority[proxyId] = priority;
        }
        // Also update the proxy object's priority field for consistency
        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (proxy) proxy.priority = priority;
        SettingsOperation.saveAllLocal(true);
        SettingsOperation.saveAllSync(false);
        if (sendResponse) sendResponse({ success: true });
        return false;
    }

    /**
     * Starts proxy test for a specific site
     * Запускает проверку прокси для конкретного сайта
     */
    /**
     * Starts proxy test for a specific site
     * Запускает проверку прокси для конкретного сайта
     */
    private static handleStartProxyTestForSite(message: any, sendResponse: Function): boolean {
        try {
            // English: Check if another test is already running (precise test)
            // Russian: Проверяем, не запущен ли уже другой тест (точный тест)
            if (!TestManager.tryStartTest('precise')) {
                if (sendResponse) sendResponse({ 
                    success: false, 
                    message: api.i18n.getMessage("settingsAnotherTestRunning") || "Another test is already running. If you think it's stuck, please reload the settings page (F5) and try again."
                });
                return false;
            }
            
            const { site, proxies } = message;
			            // Clear dynamic override for this site before testing
            if (site) {
                ProxyEngine.clearDynamicProxyForSite(site);
            }
            if (!site || !proxies || !proxies.length) {
                TestManager.finishTest();
                if (sendResponse) sendResponse({ success: false, message: "Invalid site or proxies" });
                return false;
            }
            ProxyTester.startCheckForSite(site, proxies)
                .finally(() => {
                    TestManager.finishTest();
                })
                .then(() => {
                    if (sendResponse) sendResponse({ success: true });
                })
                .catch((err) => {
                    TestManager.finishTest(); // Дополнительная страховка
                    if (sendResponse) sendResponse({ success: false, message: err.message });
                });
            return true;
        } catch (err) {
            TestManager.finishTest();
            if (sendResponse) sendResponse({ success: false, message: String(err) });
            return false;
        }
    }

    /**
     * English: Handles start of express (quick) proxy test for a specific site.
     * Russian: Обрабатывает запуск экспресс-теста прокси для конкретного сайта.
     */
    private static handleStartProxyTestForSiteExpress(message: any, sendResponse: Function): boolean {
        try {
            // English: Check if another test is already running
            // Russian: Проверяем, не запущен ли уже другой тест
            if (!TestManager.tryStartTest('quick')) {
                if (sendResponse) sendResponse({ 
                    success: false, 
                    message: api.i18n.getMessage("settingsAnotherTestRunning") || "Another test is already running. If you think it's stuck, please reload the settings page (F5) and try again."
                });
                return false;
            }
            
            const { site, proxies } = message;
			            // Clear dynamic override for this site before testing
            if (site) {
                ProxyEngine.clearDynamicProxyForSite(site);
            }
            if (!site || !proxies || !proxies.length) {
                TestManager.finishTest();
                if (sendResponse) sendResponse({ success: false, message: "Invalid site or proxies" });
                return false;
            }
            // English: start express test via ProxyTester.startQuickTestForSite
            // Russian: запускаем экспресс-тест через ProxyTester.startQuickTestForSite
            ProxyTester.startQuickTestForSite(site, proxies)
                .finally(() => {
                    TestManager.finishTest();
                })
                .then(() => {
                    if (sendResponse) sendResponse({ success: true });
                })
                .catch((err) => {
                    TestManager.finishTest(); // Дополнительная страховка
                    if (sendResponse) sendResponse({ success: false, message: err.message });
                });
            return true;
        } catch (err) {
            TestManager.finishTest();
            if (sendResponse) sendResponse({ success: false, message: String(err) });
            return false;
        }
    }
	    /**
     * English: Starts quick (express) proxy test from popup for current site.
     * Russian: Запускает быстрый тест прокси из попапа для текущего сайта.
     */
    private static handleStartQuickTestInPopup(message: any, sendResponse: Function): boolean {
        try {
            // English: Check if another test is already running
            // Russian: Проверяем, не запущен ли уже другой тест
            if (!TestManager.tryStartTest('quick')) {
                if (sendResponse) sendResponse({ 
                    success: false, 
                    message: api.i18n.getMessage("settingsAnotherTestRunning") || "Another test is already running. If you think it's stuck, please reload the settings page (F5) and try again."
                });
                return false;
            }
            
            const { site, proxies } = message;
            if (!site || !proxies || !proxies.length) {
                TestManager.finishTest();
                if (sendResponse) sendResponse({ success: false, message: "Invalid site or proxies" });
                return false;
            }
            ProxyTester.startQuickTestForSite(site, proxies)
                .finally(() => {
                    TestManager.finishTest();
                })
                .then(() => {
                    if (sendResponse) sendResponse({ success: true });
                })
                .catch((err) => {
                    TestManager.finishTest(); // Дополнительная страховка
                    if (sendResponse) sendResponse({ success: false, message: err.message });
                });
            return true;
        } catch (err) {
            TestManager.finishTest();
            if (sendResponse) sendResponse({ success: false, message: String(err) });
            return false;
        }
    }

    private static handleStartCycleTestForSite(message: any, sendResponse: Function): boolean {
        try {
            // English: Check if another test is already running
            // Russian: Проверяем, не запущен ли уже другой тест
            if (!TestManager.tryStartTest('cycle')) {
                if (sendResponse) sendResponse({ 
                    success: false, 
                    message: api.i18n.getMessage("settingsAnotherTestRunning") || "Another test is already running. If you think it's stuck, please reload the settings page (F5) and try again."
                });
                return false;
            }
            
            const { site, proxies } = message;
			            // Clear dynamic override for this site before testing
            if (site) {
                ProxyEngine.clearDynamicProxyForSite(site);
            }
            if (!site || !proxies || !proxies.length) {
                TestManager.finishTest();
                if (sendResponse) sendResponse({ success: false, message: "Invalid site or proxies" });
                return false;
            }
            // English: Convert proxy list to ProxyListItem format expected by ProxyCycleTester
            // Russian: Преобразуем список прокси в формат ProxyListItem, ожидаемый ProxyCycleTester
            const proxyList = proxies.map((p: any) => ({
                id: p.id,
                name: p.name || `${p.host}:${p.port}`,
                protocol: p.protocol,
                host: p.host,
                port: p.port
            }));
            
            // English: Get current refreshTab setting and original profile ID from settings
            // Russian: Получаем текущую настройку refreshTab и ID исходного профиля из настроек
            const refreshTabOnConfigChanges = Settings.current.options?.refreshTabOnConfigChanges || false;
            const originalProfileId = Settings.current.activeProfileId || null;
            
            // English: Start cycle test via ProxyCycleTester with provided proxy list
            // Russian: Запускаем циклический тест через ProxyCycleTester с переданным списком прокси
            ProxyCycleTester.startCycleTest(site, refreshTabOnConfigChanges, originalProfileId, proxyList)
                .finally(() => {
                    TestManager.finishTest();
                })
                .then(() => {
                    if (sendResponse) sendResponse({ success: true });
                })
                .catch((err) => {
                    TestManager.finishTest(); // Дополнительная страховка
                    if (sendResponse) sendResponse({ success: false, message: err.message });
                });
            return true;
        } catch (err) {
            TestManager.finishTest();
            if (sendResponse) sendResponse({ success: false, message: String(err) });
            return false;
        }
    }
	
	    /**
     * English: Handles start of express cycle test (fast sequential proxy switching)
     * Russian: Обрабатывает запуск экспресс-циклического теста (быстрое последовательное переключение прокси)
     */
    private static handleStartExpressCycleTestForSite(message: any, sendResponse: Function): boolean {
        try {
            // English: Check if another test is already running
            // Russian: Проверяем, не запущен ли уже другой тест
            if (!TestManager.tryStartTest('express-cycle')) {
                if (sendResponse) sendResponse({ 
                    success: false, 
                    message: api.i18n.getMessage("settingsAnotherTestRunning") || "Another test is already running. If you think it's stuck, please reload the settings page (F5) and try again."
                });
                return false;
            }
            
            const { site, proxies } = message;
            if (!site || !proxies || !proxies.length) {
                TestManager.finishTest();
                if (sendResponse) sendResponse({ success: false, message: "Invalid site or proxies" });
                return false;
            }
            // English: Convert proxy list to ProxyListItem format expected by ExpressProxyCycleTester
            // Russian: Преобразуем список прокси в формат ProxyListItem, ожидаемый ExpressProxyCycleTester
            const proxyList = proxies.map((p: any) => ({
                id: p.id,
                name: p.name || `${p.host}:${p.port}`,
                protocol: p.protocol,
                host: p.host,
                port: p.port
            }));
            
            const refreshTabOnConfigChanges = Settings.current.options?.refreshTabOnConfigChanges || false;
            const originalProfileId = Settings.current.activeProfileId || null;
            
            // English: Start express cycle test via ExpressProxyCycleTester
            // Russian: Запускаем экспресс-циклический тест через ExpressProxyCycleTester
            ExpressProxyCycleTester.startCycleTest(site, refreshTabOnConfigChanges, originalProfileId, proxyList)
                .finally(() => {
                    TestManager.finishTest();
                })
                .then(() => {
                    if (sendResponse) sendResponse({ success: true });
                })
                .catch((err) => {
                    TestManager.finishTest(); // Дополнительная страховка
                    if (sendResponse) sendResponse({ success: false, message: err.message });
                });
            return true;
        } catch (err) {
            TestManager.finishTest();
            if (sendResponse) sendResponse({ success: false, message: String(err) });
            return false;
        }
    }
		/**
	 * English: Handles cancellation of cycle test.
	 * Russian: Обрабатывает отмену циклического теста.
	 */
	private static handleCancelCycleTestForSite(message: any, sendResponse: Function): boolean {
		// English: Immediately send stop message to log
		// Russian: Немедленно отправляем сообщение об остановке в лог
		Core.sendTestLogStep({
			type: 'stop',
			timestamp: Date.now()
		});
		// English: Cancel failover as well
		// Russian: Отменяем также failover
		WebFailedRequestMonitor.cancelFailover();
		ProxyCycleTester.cancelTest();
		if (sendResponse) sendResponse({ success: true });
		return false;
	}

    /**
     * English: Returns current proxy test status.
     * Russian: Возвращает текущий статус теста прокси.
     */
    private static handleGetProxyTestStatus(message: any, sendResponse: Function): boolean {
        const status = ProxyTester.getStatus();
        if (sendResponse) sendResponse(status);
        return false;
    }
	
	    /**
     * English: Returns current express cycle test status.
     * Russian: Возвращает текущий статус экспресс-циклического теста.
     */
    private static handleGetExpressCycleTestStatus(message: any, sendResponse: Function): boolean {
        const status = ExpressProxyCycleTester.getStatus();
        if (sendResponse) sendResponse(status);
        return false;
    }

    private static handleGetCycleTestStatus(message: any, sendResponse: Function): boolean {
        const status = ProxyCycleTester.getStatus();
        if (sendResponse) sendResponse(status);
        return false;
    }
	
    /**
     * English: Handles adding an unreachable site to auto-proxy rules and starting failover
     * Russian: Обрабатывает добавление недоступного сайта в правила автопрокси и запуск failover
     */
    private static handleAddUnreachableSite(message: any, sendResponse: Function): boolean {
        const site = message.site;
        const tabId = message.tabId || -1;
        if (!site) {
            if (sendResponse) sendResponse({ success: false, error: 'No site' });
            return false;
        }

        // Find SmartRules profile
        const smartRulesProfile = settingsLib.current.proxyProfiles.find(p => p.profileType === SmartProfileType.SmartRules);
        if (!smartRulesProfile) {
            if (sendResponse) sendResponse({ success: false, error: 'SmartRules profile not found' });
            return false;
        }

        // Normalize site
        const normalizedSite = Core.normalizeSite(site);
        if (!normalizedSite) {
            if (sendResponse) sendResponse({ success: false, error: 'Invalid site' });
            return false;
        }

        // Check if rule already exists
        let rule = smartRulesProfile.proxyRules.find(r => r.hostName === normalizedSite);
        if (!rule) {
            // Create new rule
            rule = new ProxyRule();
            rule.ruleType = ProxyRuleType.DomainSubdomain;
            rule.hostName = normalizedSite;
            rule.ruleSearch = normalizedSite;
            rule.enabled = true;
            rule.mode = 'auto';
            rule.isAuto = true;
            rule.proxyServerId = null;
            smartRulesProfile.proxyRules.push(rule);
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync(false);
            proxyEngineLib.notifyProxyRulesChanged();
//console.log(`[Core] Added auto-rule for ${normalizedSite}`)
        } else {
            // Ensure it's enabled and mode is auto
            rule.enabled = true;
            rule.mode = 'auto';
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync(false);
            proxyEngineLib.notifyProxyRulesChanged();
//console.log(`[Core] Enabled auto-rule for ${normalizedSite}`)
        }

        // Switch to SmartRules profile if not already
        Core.ChangeActiveProfileId(smartRulesProfile.profileId);

        // English: Reset user-stopped flag so failover can start
        // Russian: Сбрасываем флаг остановки пользователем, чтобы failover мог запуститься
        WebFailedRequestMonitor.resetUserStoppedFailover(normalizedSite);

        // Trigger failover for this site
        WebFailedRequestMonitor.triggerFailoverForSite(normalizedSite, null, tabId);

        if (sendResponse) sendResponse({ success: true });
        return false;
    }	
	
/**
 * Handles adding a subscription proxy to manual list
 * Обрабатывает добавление прокси из подписки в ручной список
 */
private static async handleAddSubscriptionProxyToManual(message: any, sendResponse: Function): Promise<boolean> {
    //        //        console.log("[ProxyMust] STEP 0: Method called", message.proxy);
    try {
        if (!Settings.current || !Array.isArray(Settings.current.proxyServers)) {
            //        //        console.log("[ProxyMust] STEP 1: Settings not initialized");
            sendResponse({ success: false, error: "Settings not initialized" });
            return true;
        }
        
        const subscriptionProxy = message.proxy;
        const oldProxyId = subscriptionProxy.id;
        //        //        console.log("[ProxyMust] STEP 2: subscriptionProxy =", subscriptionProxy, "oldProxyId =", oldProxyId);
        if (!subscriptionProxy) {
            //        console.log("[ProxyMust] STEP 2 FAILED: No proxy object");
            sendResponse({ success: false, error: "Invalid proxy data: missing proxy object" });
            return true;
        }
        
        const host = Core.normalizeHost(subscriptionProxy.host);
        //        console.log("[ProxyMust] STEP 3: host =", host);
        if (!host) {
            //        console.log("[ProxyMust] STEP 3 FAILED: Invalid host");
            sendResponse({ success: false, error: "Invalid proxy data: missing host" });
            return true;
        }
        
        const port = Core.toPort(subscriptionProxy.port);
        //        console.log("[ProxyMust] STEP 4: port =", port);
        if (port <= 0 || port > 65535) {
            //        console.log("[ProxyMust] STEP 4 FAILED: Invalid port");
            sendResponse({ success: false, error: `Invalid port: ${subscriptionProxy.port}` });
            return true;
        }
        
        const protocol = Core.normalizeProtocol(subscriptionProxy.protocol);
        const ALLOWED_PROTOCOLS = new Set(['HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5']);
        //        console.log("[ProxyMust] STEP 5: protocol =", protocol);
        if (!protocol || !ALLOWED_PROTOCOLS.has(protocol)) {
            //        console.log("[ProxyMust] STEP 5 FAILED: Invalid protocol");
            sendResponse({ success: false, error: `Invalid protocol: ${subscriptionProxy.protocol}` });
            return true;
        }
        
        const normalizedSubscriptionProxy = {
            protocol: protocol,
            host: host,
            port: port,
            username: Core.normalizeAuth(subscriptionProxy.username),
            password: Core.normalizeAuth(subscriptionProxy.password)
        };
        //        console.log("[ProxyMust] STEP 6: normalizedSubscriptionProxy =", normalizedSubscriptionProxy);
        
        const proxyKey = Core.buildProxyKey(normalizedSubscriptionProxy);
        //        console.log("[ProxyMust] STEP 7: proxyKey =", proxyKey);
        
        let proxyMap = Core.getProxyMap();
        let existingProxy = proxyMap.get(proxyKey);
        //        console.log("[ProxyMust] STEP 8: existingProxy =", existingProxy);
        
        if (existingProxy) {
            //        console.log("[ProxyMust] STEP 8 RESULT: Proxy already exists");
            Debug.log("[Proxy][Exists]", { id: existingProxy.id, host, port });
            sendResponse({ 
                success: false, 
                alreadyExists: true,
                existingProxyId: existingProxy.id,
                existingProxyRating: existingProxy.rating || 0,
                message: "Proxy already exists. Use existing or update rating?"
            });
            return true;
        }
        
        //        console.log("[ProxyMust] STEP 9: Creating new proxy via createProxyFromSubscription");
        const newProxy = Core.createProxyFromSubscription(normalizedSubscriptionProxy, subscriptionProxy);
        
        // English: Preserve rating and priority from subscription proxy if they exist
        // Russian: Сохраняем рейтинг и приоритет из подписочного прокси, если они существуют
        if (subscriptionProxy.rating !== undefined && subscriptionProxy.rating !== null) {
            newProxy.rating = subscriptionProxy.rating;
            //        console.log("[ProxyMust] STEP 9a: Copied rating =", newProxy.rating);
        }
        if (subscriptionProxy.priority !== undefined && subscriptionProxy.priority !== null) {
            newProxy.priority = subscriptionProxy.priority;
            //        console.log("[ProxyMust] STEP 9b: Copied priority =", newProxy.priority);
        }
        
        // English: Migrate autoStatus data from old proxyId to new proxyId
        // Russian: Переносим данные autoStatus со старого proxyId на новый
        if (oldProxyId && Settings.current.autoStatus && Settings.current.autoStatus[oldProxyId]) {
            //        console.log("[ProxyMust] STEP 9c: Migrating autoStatus from", oldProxyId, "to", newProxy.id);
            if (!Settings.current.autoStatus[newProxy.id]) {
                Settings.current.autoStatus[newProxy.id] = {};
            }
            // English: Copy all site statuses from old proxy to new proxy
            // Russian: Копируем все статусы сайтов со старого прокси на новый
            for (const site in Settings.current.autoStatus[oldProxyId]) {
                Settings.current.autoStatus[newProxy.id][site] = Settings.current.autoStatus[oldProxyId][site];
            }
            // English: Remove old autoStatus entry to avoid confusion
            // Russian: Удаляем старую запись autoStatus во избежание путаницы
            delete Settings.current.autoStatus[oldProxyId];
            //        console.log("[ProxyMust] STEP 9d: autoStatus migrated successfully");
        }
        
        // English: Migrate proxyPriority data from old proxyId to new proxyId
        // Russian: Переносим данные proxyPriority со старого proxyId на новый
        if (oldProxyId && Settings.current.proxyPriority && Settings.current.proxyPriority[oldProxyId] !== undefined) {
            //        console.log("[ProxyMust] STEP 9e: Migrating proxyPriority from", oldProxyId, "to", newProxy.id);
            Settings.current.proxyPriority[newProxy.id] = Settings.current.proxyPriority[oldProxyId];
            delete Settings.current.proxyPriority[oldProxyId];
            //        console.log("[ProxyMust] STEP 9f: proxyPriority migrated successfully");
        }
        
        // English: Add new proxy to array
        // Russian: Добавляем новый прокси в массив
        Settings.current.proxyServers.push(newProxy);
        //        console.log("[ProxyMust] STEP 10: newProxy created =", newProxy);
        
        const finalKey = Core.buildProxyKey({
            protocol: newProxy.protocol,
            host: newProxy.host,
            port: newProxy.port,
            username: newProxy.username,
            password: newProxy.password
        });
        //        console.log("[ProxyMust] STEP 11: finalKey =", finalKey);
        
        Core.invalidateProxyCache();
        const freshMap = Core.getProxyMap();
        const duplicate = freshMap.get(finalKey);
        //        console.log("[ProxyMust] STEP 12: duplicate =", duplicate);
        
        if (duplicate && duplicate.id !== newProxy.id) {
            //        console.log("[ProxyMust] STEP 12 RESULT: Duplicate found, removing");
            const index = Settings.current.proxyServers.findIndex(p => p.id === newProxy.id);
            if (index !== -1) Settings.current.proxyServers.splice(index, 1);
            Core.invalidateProxyCache();
            
            sendResponse({ 
                success: false, 
                alreadyExists: true,
                existingProxyId: duplicate.id,
                existingProxyRating: duplicate.rating || 0,
                message: "Proxy already exists (race condition detected)"
            });
            return true;
        }
        
        //        console.log("[ProxyMust] STEP 13: Saving proxy servers");
        SettingsOperation.saveProxyServers();
        
        // English: Save autoStatus and proxyPriority to local storage (serialize to JSON first)
        // Russian: Сохраняем autoStatus и proxyPriority в локальное хранилище (сначала сериализуем в JSON)
        if (Settings.current.autoStatus && Object.keys(Settings.current.autoStatus).length > 0) {
            const autoStatusJson = JSON.parse(JSON.stringify(Settings.current.autoStatus));
            await api.storage.local.set({ autoStatus: autoStatusJson });
            //        console.log("[ProxyMust] autoStatus saved to local storage");
        }
        if (Settings.current.proxyPriority && Object.keys(Settings.current.proxyPriority).length > 0) {
            const proxyPriorityJson = JSON.parse(JSON.stringify(Settings.current.proxyPriority));
            await api.storage.local.set({ proxyPriority: proxyPriorityJson });
            //        console.log("[ProxyMust] proxyPriority saved to local storage");
        }
        
        // English: Force save to local storage (bypass sync settings)
        // Russian: Принудительное сохранение в локальное хранилище (в обход настроек синхронизации)
        const proxyServersPlain = Settings.current.proxyServers.map(p => ({
            id: p.id,
            order: p.order,
            name: p.name,
            host: p.host,
            port: p.port,
            protocol: p.protocol,
            username: p.username,
            password: p.password,
            proxyDNS: p.proxyDNS,
            failoverTimeout: p.failoverTimeout,
            countryCode: p.countryCode,
            rating: p.rating,
            priority: p.priority,
            createdAt: p.createdAt
        }));
        await api.storage.local.set({ proxyServers: proxyServersPlain });
        //        console.log("[ProxyMust] Forced save completed, proxyServers length:", Settings.current.proxyServers.length);
        
        // English: Verify save was successful (result ignored, no logging)
        // Russian: Проверка успешности сохранения (результат игнорируется, без логов)
        await api.storage.local.get("proxyServers");
        await SettingsOperation.saveAllSync(false);
        Settings.updateActiveSettings();
        proxyEngineLib.updateBrowsersProxyConfig();
        
        //        console.log("[ProxyMust] STEP 14: Sending success response");
        Debug.log("[Proxy][Added]", { id: newProxy.id, host, port, protocol, rating: newProxy.rating, priority: newProxy.priority });
        sendResponse({ success: true, newProxyId: newProxy.id });
        
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("[ProxyMust] ERROR:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
    return true;
}

	// ==================== Helper Methods for Proxy Management ====================

	private static proxyCache: Map<string, ProxyServer> | null = null;
	
		// ==================== Test Log Window ====================
	// English: Stores the window ID of the test log window (if open)
	// Russian: Хранит ID окна лога тестирования (если открыто)
	private static _testLogWindowId: number | null = null;

	// English: Buffer of log messages (max 200 entries)
	// Russian: Буфер сообщений лога (макс. 200 записей)
	private static _logBuffer: any[] = [];

	// English: Maximum number of log entries to keep
	// Russian: Максимальное количество записей в логе
	private static readonly MAX_LOG_BUFFER = 200;

    // English: Whether the test log window is pinned (always on top via focus)
    // Russian: Закреплено ли окно лога (поверх всех через фокусировку)
    private static _testLogPinned: boolean = false;

    /**
     * English: Resets the flags that prevent duplicate stop/complete messages.
     * Russian: Сбрасывает флаги, предотвращающие дублирование сообщений stop/complete.
     */
    public static resetTestLogFlags(): void {
        Core._stopSent = false;
        Core._completeSent = false;
    }

	private static normalizeHost(host: string): string | null {
		if (!host || typeof host !== 'string') return null;
		return host.trim().toLowerCase();
	}
	
    /**
     * English: Normalizes site domain (removes protocol, www., trailing slash)
     * Russian: Нормализует домен сайта (удаляет протокол, www., завершающий слэш)
     */
    public static normalizeSite(site: string): string | null {
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
     * English: Gets the site (domain) for a given tab ID
     * Russian: Возвращает сайт (домен) для заданной вкладки
     */
    private static getSiteForTab(tabId: number): string | null {
        const tabData = TabManager.getTab(tabId);
        if (!tabData || !tabData.url) return null;
        const host = Utils.extractHostFromUrl(tabData.url);
        if (!host) return null;
        return Core.normalizeSite(host);
    }	

	private static toPort(port: any): number {
		const parsed = parseInt(port, 10);
		return isNaN(parsed) ? 0 : parsed;
	}

	private static normalizeProtocol(protocol: string): string | null {
		if (!protocol || typeof protocol !== 'string') return null;
		const upper = protocol.toUpperCase();
		if (upper.startsWith('SOCKS')) return upper;
		if (upper === 'HTTP' || upper === 'HTTPS') return upper;
		return null;
	}

	private static normalizeAuth(value: any): string | undefined {
		if (!value || typeof value !== 'string') return undefined;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	private static buildProxyKey(proxy: { protocol: string; host: string; port: number; username?: string; password?: string }): string {
		const authPart = proxy.username && proxy.password 
			? `${proxy.username}:${proxy.password}@` 
			: (proxy.username ? `${proxy.username}@` : '');
		return `${proxy.protocol}://${authPart}${proxy.host}:${proxy.port}`;
	}

	private static getProxyMap(): Map<string, ProxyServer> {
		if (Core.proxyCache) return Core.proxyCache;
		
		const map = new Map<string, ProxyServer>();
		if (Settings.current?.proxyServers) {
			for (const proxy of Settings.current.proxyServers) {
				const key = Core.buildProxyKey(proxy);
				map.set(key, proxy);
			}
		}
		Core.proxyCache = map;
		return map;
	}

	private static invalidateProxyCache(): void {
		Core.proxyCache = null;
	}

	/**
	 * Creates a copy of subscription proxy to add to manual list
	 * Создаёт копию подписочного прокси для добавления в ручной список
	 */
	private static createProxyFromSubscription(normalized: any, subscriptionProxy: any): ProxyServer {
		const newProxy = new ProxyServer();
		
		do {
			newProxy.id = Utils.getNewUniqueIdString();
		} while (Settings.current.proxyServers.some(p => p.id === newProxy.id));
		
	//	const shortHost = Core.shortenHost(normalized.host);
		newProxy.name = `${normalized.host}:${normalized.port} - (sub)`;
		newProxy.host = normalized.host;
		newProxy.port = normalized.port;
		newProxy.protocol = normalized.protocol;
		newProxy.username = normalized.username;
		newProxy.password = normalized.password;
		newProxy.createdAt = Date.now();
		
		if (subscriptionProxy.proxyDNS !== undefined) {
			newProxy.proxyDNS = subscriptionProxy.proxyDNS;
		} else {
			newProxy.proxyDNS = normalized.protocol.startsWith("SOCKS");
		}
		
		const maxOrder = Settings.current.proxyServers.length > 0
			? Math.max(...Settings.current.proxyServers.map(p => p.order || 0))
			: 0;
		newProxy.order = maxOrder + 1;
		
		// English: Copy rating and priority from original subscription proxy if they exist
		// Russian: Копируем рейтинг и приоритет из исходного подписочного прокси, если они существуют
		if (subscriptionProxy.rating !== undefined && subscriptionProxy.rating !== null) {
			newProxy.rating = subscriptionProxy.rating;
		} else {
			newProxy.rating = 1;
		}
		
		if (subscriptionProxy.priority !== undefined && subscriptionProxy.priority !== null) {
			newProxy.priority = subscriptionProxy.priority;
		}
		
		return newProxy;
	}

/*	private static shortenHost(host: string): string {
		const parts = host.split('.');
		if (parts.length >= 3) {
			return parts.slice(-2).join('.');
		}
		return host;
	}
*/
	// ==================== Public API Methods ====================

	public static ChangeActiveProfileId(profileId: string) {
		const profile = ProfileOperations.findSmartProfileById(profileId, settingsLib.current.proxyProfiles);
		if (profile == null) {
			Debug.warn(`Requested profile id '${profileId}' not found, change tor profile failed`);
			return;
		}

		// Clear all dynamic proxy overrides when switching profiles
		ProxyEngine.clearAllDynamicProxies();
		
		// Clear site lock when switching profiles
		WebFailedRequestMonitor.clearSiteLock();		

		settingsLib.current.activeProfileId = profileId;
		settingsOperationLib.saveActiveProfile();
		settingsOperationLib.saveAllSync();
		settingsLib.updateActiveSettings();
		proxyEngineLib.updateBrowsersProxyConfig();
		Core.setBrowserActionStatus();
	}

	public static ChangeActiveProxy(proxy: ProxyServer) {
		// Clear dynamic override for all sites when manually changing proxy
		ProxyEngine.clearAllDynamicProxies();
		// Clear site lock when manually changing proxy
		WebFailedRequestMonitor.clearSiteLock();
		const smartProfile = ProfileOperations.getActiveSmartProfile();
		
		if (smartProfile == null) {
			Core.updateDefaultProxyServer(proxy);
		} else if (smartProfile.profileProxyServerId) {
			smartProfile.profileProxyServerId = proxy.id;
			settingsOperationLib.saveSmartProfiles();
			settingsOperationLib.saveAllSync();
			settingsOperationLib.updateSmartProfilesRulesProxyServer();
		} else {
			Core.updateDefaultProxyServer(proxy);
		}

		settingsLib.updateActiveSettings();
		proxyEngineLib.updateBrowsersProxyConfig();
		Core.setBrowserActionStatus();
	}

	private static updateDefaultProxyServer(proxy: ProxyServer) {
		settingsLib.current.defaultProxyServerId = proxy.id;
		settingsOperationLib.saveDefaultProxyServer();
		settingsOperationLib.saveAllSync();
		settingsOperationLib.updateSmartProfilesRulesProxyServer();
	}

	public static CycleToNextProxyServer(): ResultHolderGeneric<ProxyServer> {
		const settingsActive = settingsLib.active;
		let currentServerId = settingsActive.activeProfile?.profileProxyServerId || 
							  settingsLib.current.defaultProxyServerId;
		let resultProxy: ProxyServer | null = null;

		if (!currentServerId) {
			resultProxy = settingsOperationLib.getFirstProxyServer();
		}

		if (!resultProxy && currentServerId) {
			resultProxy = settingsOperationLib.findNextProxyServerByCurrentProxyId(currentServerId);
		}

		if (!resultProxy) {
			resultProxy = settingsOperationLib.getFirstProxyServer();
			if (resultProxy && resultProxy.id === currentServerId) {
				resultProxy = null;
			}
		}

		if (resultProxy) {
			Core.ChangeActiveProxy(resultProxy);
			const result = new ResultHolderGeneric<ProxyServer>();
			result.success = true;
			result.value = resultProxy;
			return result;
		}

		const result = new ResultHolderGeneric<ProxyServer>();
		result.success = false;
		result.message = api.i18n.getMessage('notificationNoNextProxyServer');
		return result;
	}

	public static CycleToPreviousProxyServer(): ResultHolderGeneric<ProxyServer> {
		const settingsActive = settingsLib.active;
		let currentServerId = settingsActive.activeProfile?.profileProxyServerId || 
							  settingsLib.current.defaultProxyServerId;
		let resultProxy: ProxyServer | null = null;

		if (!currentServerId) {
			resultProxy = settingsOperationLib.getFirstProxyServer();
		}

		if (!resultProxy && currentServerId) {
			resultProxy = settingsOperationLib.findPreviousProxyServerByCurrentProxyId(currentServerId);
		}

		if (!resultProxy) {
			resultProxy = settingsOperationLib.getLastProxyServer();
			if (resultProxy && resultProxy.id === currentServerId) {
				resultProxy = null;
			}
		}

		if (resultProxy) {
			Core.ChangeActiveProxy(resultProxy);
			const result = new ResultHolderGeneric<ProxyServer>();
			result.success = true;
			result.value = resultProxy;
			return result;
		}

		const result = new ResultHolderGeneric<ProxyServer>();
		result.success = false;
		result.message = api.i18n.getMessage('notificationNoPreviousProxyServer');
		return result;
	}

	private static getSettingsPageInitialData(): SettingsPageInternalDataType {
		return { settings: settingsLib.current };
	}

	private static getPopupInitialData(): PopupInternalDataType {
		const settingsActive = settingsLib.active;
		const settings = settingsLib.current;
		const dataForPopup = new PopupInternalDataType();
		
		dataForPopup.proxyableDomains = [];
		dataForPopup.proxyProfiles = ProfileOperations.getSmartProfileBaseList(settings.proxyProfiles);
		dataForPopup.activeProfileId = settings.activeProfileId;
		dataForPopup.activeIncognitoProfileId = settings.options.activeIncognitoProfileId;
		dataForPopup.proxyServers = settings.proxyServers;
		// English: For SmartRules profile, try to get proxy for current site
		// Russian: Для профиля SmartRules пытаемся получить прокси для текущего сайта
		let currentProxyId = (settingsActive.activeProfile?.profileProxyServerId) || settings.defaultProxyServerId;
		const activeProfile = settingsActive.activeProfile;
		if (activeProfile && activeProfile.profileType === SmartProfileType.SmartRules) {
			const currentTabData = TabManager.getCurrentTab();
			if (currentTabData && currentTabData.url) {
				const site = Utils.extractHostFromUrl(currentTabData.url);
				if (site) {
					// First check dynamic override
					const dynamicProxyId = ProxyEngine.getDynamicProxyForSite(site);
					if (dynamicProxyId) {
						currentProxyId = dynamicProxyId;
					} else {
						// Check rule
						const profile = settings.proxyProfiles.find(p => p.profileId === settings.activeProfileId);
						if (profile) {
							const rule = profile.proxyRules.find(r => r.hostName === site);
							if (rule && rule.proxyServerId) {
								currentProxyId = rule.proxyServerId;
							}
						}
					}
				}
			}
		}
		dataForPopup.currentProxyServerId = currentProxyId;
		dataForPopup.currentTabId = null;
		dataForPopup.currentTabIndex = null;
		dataForPopup.proxyServersSubscribed = settingsOperationLib.getAllSubscribedProxyServers();
		dataForPopup.hasProxyServers = settings.proxyServers.length > 0 || (dataForPopup.proxyServersSubscribed?.length ?? 0) > 0;
		dataForPopup.updateInfo = settings.updateInfo;
		dataForPopup.failedRequests = null;
		dataForPopup.notSupportedSetProxySettings = environment.notSupported.setProxySettings;
		dataForPopup.notAllowedSetProxySettings = environment.notAllowed.setProxySettings;
		dataForPopup.refreshTabOnConfigChanges = settings.options.refreshTabOnConfigChanges;
		dataForPopup.enableRating = settings.options.enableRating;
        dataForPopup.enableDirectIpDetection = settings.options.enableDirectIpDetection === true;
//console.log(`[Core] getPopupInitialData: enableDirectIpDetection = ${dataForPopup.enableDirectIpDetection}`)
		// English: stale hours from user preferences (staleHours)
		// Russian: время устаревания из пользовательских настроек (staleHours)
		dataForPopup.staleHours = settings.userPrefs?.staleHours ?? 6;
        dataForPopup.autoStatus = settings.autoStatus || {};
	   // 	console.log("[DEBUG] getPopupInitialData: settings.autoStatus =", JSON.stringify(settings.autoStatus));
        dataForPopup.proxyPriority = settings.proxyPriority || {};
//console.log("[Core] getPopupInitialData: autoStatus keys =", Object.keys(dataForPopup.autoStatus))
//console.log("[Core] getPopupInitialData: autoStatus sample =", JSON.stringify(dataForPopup.autoStatus).substring(0, 300))
		
		const themeData = new PartialThemeDataType();
		themeData.themeType = settings.options.themeType;
		themeData.themesLight = settings.options.themesLight;
		themeData.themesLightCustomUrl = settings.options.themesLightCustomUrl;
		themeData.themesDark = settings.options.themesDark;
		themeData.themesDarkCustomUrl = settings.options.themesDarkCustomUrl;
		dataForPopup.themeData = themeData;

		const currentTabData = TabManager.getCurrentTab();
		if (!currentTabData) return dataForPopup;

		dataForPopup.currentTabId = currentTabData.tabId;
		dataForPopup.currentTabIndex = currentTabData.index;
		dataForPopup.currentTabIsIncognito = currentTabData.incognito;
		dataForPopup.failedRequests = WebFailedRequestMonitor.convertFailedRequestsToArray(currentTabData.failedRequests);

		// English: Extract current site for status display (works for all profiles, even Direct/System)
		// Russian: Извлекаем текущий сайт для отображения статусов (работает для всех профилей, даже Direct/System)
		if (currentTabData.url) {
			const urlHost = Utils.extractHostFromUrl(currentTabData.url);
			if (urlHost && Utils.isNotInternalHostName(urlHost)) {
				dataForPopup.currentSite = urlHost;
			}
		}

		// English: If no active profile or profile doesn't support rules, return early (but currentSite is already set)
		// Russian: Если нет активного профиля или профиль не поддерживает правила, выходим раньше (но currentSite уже установлен)
		if (!settingsActive.activeProfile || !ProfileOperations.profileTypeSupportsRules(settingsActive.activeProfile.profileType)) {
			return dataForPopup;
		}

		const urlHost = Utils.extractHostFromUrl(currentTabData.url);
		if (!Utils.isNotInternalHostName(urlHost)) return dataForPopup;

		const proxyableDomainList = Utils.extractSubdomainListFromHost(urlHost);
		if (!proxyableDomainList?.length) return dataForPopup;

		const activeSmartProfile = settingsActive.activeProfile;
		const originalSmartProfile = settings.proxyProfiles.find(p => p.profileId === settings.activeProfileId);

		dataForPopup.proxyableDomains = Core.buildProxyableDomainsList(
			proxyableDomainList, 
			activeSmartProfile, 
			originalSmartProfile
		);
		
		// English: Ensure autoStatus and proxyPriority are included (already set above, but keep for clarity)
		// Russian: Убеждаемся, что autoStatus и proxyPriority включены (уже установлены выше, но оставляем для ясности)
		dataForPopup.autoStatus = settings.autoStatus || {};
		dataForPopup.proxyPriority = settings.proxyPriority || {};
		
		return dataForPopup;
	}

	private static buildProxyableDomainsList(
		domains: string[], 
		activeSmartProfile: any, 
		originalSmartProfile: any
	): any[] {
		const result: any[] = [];
		
		if (domains.length === 1) {
			const domain = domains[0];
			const testResult = ProxyRules.findMatchedDomainInRulesInfo(domain, activeSmartProfile.compiledRules);
			
			if (testResult) {
				const ruleIsWhitelist = testResult.matchedRuleSource === CompiledProxyRulesMatchedSource.WhitelistRules ||
					testResult.matchedRuleSource === CompiledProxyRulesMatchedSource.WhitelistSubscriptionRules;
				const actualRule = originalSmartProfile?.proxyRules.find((r: any) => r.ruleId === testResult.compiledRule.ruleId);
				
				result.push({
					ruleId: testResult.compiledRule.ruleId,
					domain: domain,
					ruleMatched: true,
					ruleMatchedThisHost: true,
					ruleSource: testResult.compiledRule.compiledRuleSource,
					ruleMatchSource: testResult.matchedRuleSource,
					ruleHasWhiteListMatch: ruleIsWhitelist,
					proxyServerId: actualRule?.proxyServerId ?? null,
					enableProxyPerOrigin: actualRule?.enableProxyPerOrigin ?? false,
				});
			} else {
				result.push({
					ruleId: null,
					domain: domain,
					ruleMatched: false,
					ruleMatchedThisHost: false,
					ruleSource: null,
					ruleMatchSource: null,
					ruleHasWhiteListMatch: false,
					proxyServerId: null,
				});
			}
		} else {
			const multiTestResultList = ProxyRules.findMatchedDomainListInRulesInfo(domains, activeSmartProfile.compiledRules);
			let anyMatchFound = false;
			
			for (let i = 0; i < multiTestResultList.length; i++) {
				const resultRuleInfo = multiTestResultList[i];
				const resultRule = resultRuleInfo?.compiledRule;
				const domain = domains[i];
				let ruleIsForThisHost = false;
				
				if (resultRule) {
					anyMatchFound = true;
					if (resultRule.hostName === domain) {
						ruleIsForThisHost = true;
					}
				}
				
				if (!ruleIsForThisHost && !anyMatchFound && resultRule?.hostName?.startsWith('www.')) {
					continue;
				}
				
				if (resultRuleInfo) {
					const ruleIsWhitelist = resultRuleInfo.matchedRuleSource === CompiledProxyRulesMatchedSource.WhitelistRules ||
						resultRuleInfo.matchedRuleSource === CompiledProxyRulesMatchedSource.WhitelistSubscriptionRules;
					const actualRule = originalSmartProfile?.proxyRules.find((r: any) => r.ruleId === resultRule.ruleId);
					
					result.push({
						ruleId: resultRule.ruleId,
						domain: domain,
						ruleMatched: true,
						ruleMatchedThisHost: ruleIsForThisHost,
						ruleSource: resultRule.compiledRuleSource,
						ruleMatchSource: resultRuleInfo.matchedRuleSource,
						ruleHasWhiteListMatch: ruleIsWhitelist,
						proxyServerId: actualRule?.proxyServerId ?? null,
						enableProxyPerOrigin: actualRule?.enableProxyPerOrigin ?? false,
					});
				} else {
					result.push({
						ruleId: null,
						domain: domain,
						ruleMatched: false,
						ruleMatchedThisHost: false,
						ruleSource: null,
						ruleMatchSource: null,
						ruleHasWhiteListMatch: false,
						proxyServerId: null,
					});
				}
			}
		}
		
		return result;
	}

	private static getProxyableInitialData(tabId: number): ProxyableInternalDataType | null {
		const tabData = TabManager.getOrSetTab(tabId, false);
		if (!tabData) return null;

		const settings = settingsLib.current;
		const result = new ProxyableInternalDataType();
		result.url = tabData.url;

		const themeData = new PartialThemeDataType();
		themeData.themeType = settings.options.themeType;
		themeData.themesLight = settings.options.themesLight;
		themeData.themesLightCustomUrl = settings.options.themesLightCustomUrl;
		themeData.themesDark = settings.options.themesDark;
		themeData.themesDarkCustomUrl = settings.options.themesDarkCustomUrl;
		result.themeData = themeData;

		return result;
	}

	public static setBrowserActionStatus(tabData?: TabDataType) {
		if (!settingsLib.active?.activeProfile) return;

        let actionIcon = iconsLib.getBrowserActionIcon(settingsLib.active.activeProfile.profileType, tabData);
        let actionTitle = iconsLib.getBrowserActionTitle(settingsLib.active.activeProfile.profileType);
        console.log('[Core] Setting browser action icon:', actionIcon);
        console.log('[Core] Setting browser action title:', actionTitle);

		if (!tabData) tabData = TabManager.getCurrentTab();

		if (tabData) {
			let failedCount = 0;

			if (tabData.incognito && settingsLib.active.activeIncognitoProfile) {
				actionIcon = iconsLib.getBrowserActionIcon(settingsLib.active.activeProfile.profileType, tabData);
				actionTitle = iconsLib.getBrowserActionTitle(settingsLib.active.activeIncognitoProfile.profileType);
				actionIcon["tabId"] = tabData.tabId;
			}

			if (settingsLib.current?.options?.displayFailedOnBadge === true) {
				failedCount = WebFailedRequestMonitor.failedRequestsNotProxifiedCount(tabData.failedRequests);
			}

			if (failedCount > 0) {
				PolyFill.browserActionSetBadgeBackgroundColor({ color: '#f0ad4e' });
				PolyFill.browserActionSetBadgeText({
					text: failedCount.toString(),
					tabId: tabData.tabId,
				});
			} else {
				PolyFill.browserActionSetBadgeText({
					text: '',
					tabId: tabData.tabId,
				});
			}

			if (settingsLib.current.options.displayAppliedProxyOnBadge && !environment.mobile) {
				if (tabData.proxified !== TabProxyStatus.None && tabData.proxyRuleHostName) {
					actionTitle += `\r\n${api.i18n.getMessage('toolbarTooltipEffectiveRule')}  ${tabData.proxyRuleHostName}`;
				} else if (tabData.proxified === TabProxyStatus.None) {
					actionTitle += `\r\n${api.i18n.getMessage('toolbarTooltipEffectiveRuleNone')}`;
				}
			}

			if (settingsLib.current.options.displayMatchedRuleOnBadge && !environment.mobile) {
				if (tabData.proxified !== TabProxyStatus.None && tabData.proxyMatchedRule) {
					actionTitle += `\r\n${api.i18n.getMessage('toolbarTooltipEffectiveRulePattern')}  ${tabData.proxyMatchedRule.ruleText}`;
				}
			}
		}

		const activeProxyServer = settingsLib.active.activeProfile?.profileProxyServer;
		if (activeProxyServer) {
			actionTitle += `\r\nProxy server: ${activeProxyServer.host} : ${activeProxyServer.port}`;
		}

        try {
            PolyFill.browserActionSetIcon(actionIcon);
        } catch (e) {
            console.warn('[Core] Failed to set browser action icon:', e);
        }
        try {
            api.browserAction.setTitle({ title: actionTitle });
        } catch (e) {
            console.warn('[Core] Failed to set browser action title:', e);
        }
	}

	private static onTabUpdatedUpdateActionStatus(tabData: TabDataType) {
		Core.setBrowserActionStatus(tabData);
	}

	private static registerMessageReader() {
		api.runtime.onMessage.addListener(Core.handleMessages.bind(Core));
	}

	private static dumpDiagnosticsInfo() {
		if (!DiagDebug) return;
		
		PolyFill.getExtensionVersion((version) => {
			const settings = Settings.current;
			const settingsActive = Settings.active;

			DiagDebug.info("DiagnosticsInfo", {
				smartProxyVersion: version,
				environmentName: environment.name,
				environmentVersion: environment.version,
				buildForBrowser: environment.browserConfig?.name,
				activeProfile: settingsActive?.activeProfile?.profileName,
				activeProfileRulesCount: settingsActive?.activeProfile?.compiledRules?.Rules?.length ?? 0,
				activeProfileWhiteRulesCount: settingsActive?.activeProfile?.compiledRules?.WhitelistRules?.length ?? 0,
				currentProxyServer: settingsActive?.currentProxyServer?.name,
				syncSettings: settings.options?.syncSettings,
				syncActiveProfile: settings.options?.syncActiveProfile,
				syncActiveProxy: settings.options?.syncActiveProxy,
				hasActiveRuleSubscription: settings?.proxyProfiles?.some(f => f.rulesSubscriptions.some((s: any) => s.enabled)) ?? false,
				hasActiveProxySubscription: settings?.proxyServerSubscriptions?.some((f: any) => f.enabled) ?? false,
			});
		});
	}

	/**
	 * English: Sends a test log step to the test log window (if open) and stores it in buffer.
	 * Russian: Отправляет шаг лога тестирования в окно лога (если открыто) и сохраняет в буфере.
	 */
private static _stopSent: boolean = false;
private static _completeSent: boolean = false;

public static sendTestLogStep(data: any): void {
    // English: Prevent duplicate stop/complete messages from multiple testers
    // Russian: Предотвращаем дублирование сообщений stop/complete от нескольких тестеров
    if (data.type === 'stop') {
        if (Core._stopSent) return;
        Core._stopSent = true;
        Core._completeSent = false;
    }
    if (data.type === 'complete') {
        if (Core._completeSent) return;
        Core._completeSent = true;
        Core._stopSent = false;
    }

    // Add to buffer
    Core._logBuffer.push(data);
    if (Core._logBuffer.length > Core.MAX_LOG_BUFFER) {
        Core._logBuffer.shift();
    }

    // English: Send to ALL listeners (including settings page embedded log and separate log window)
    // Russian: Отправляем ВСЕМ слушателям (включая встроенный лог на странице настроек и отдельное окно лога)
    try {
        api.runtime.sendMessage({
            command: 'PROXY_TEST_STEP',
            data: data
        });
    } catch (e) {
        // Ignore
    }

    // English: If test log window is open and pinned, bring it to front
    // Russian: Если окно лога открыто и закреплено, выводим его на передний план
    if (Core._testLogWindowId !== null && Core._testLogPinned) {
        try {
            api.windows.update(Core._testLogWindowId, { focused: true });
        } catch (e) {
            // Window was closed, reset ID
            Core._testLogWindowId = null;
            Core._testLogPinned = false;
        }
    }
}

	/**
	 * English: Handles clearing autoStatus for proxies from settings page
	 * Russian: Обрабатывает очистку autoStatus для прокси со страницы настроек
	 */
    private static async handleClearProxyAutoStatus(message: any, sendResponse: Function): Promise<void> {
        try {
            // English: Use AutoStatusService to replace the entire map
            // Russian: Используем AutoStatusService для замены всей карты
            const statusService = AutoStatusService.getInstance();
            if (message.autoStatus !== undefined) {
                statusService.replaceAllStatuses(message.autoStatus);
                if (sendResponse) sendResponse({ success: true });
            } else {
                console.warn("[Core] handleClearProxyAutoStatus: message.autoStatus отсутствует");
                if (sendResponse) sendResponse({ success: false, error: "No autoStatus data provided" });
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("[Core] handleClearProxyAutoStatus ошибка:", errorMessage);
            if (sendResponse) sendResponse({ success: false, error: errorMessage });
        }
    }
	
	    /**
     * English: Clears site lock and cache for a specific site.
     * Russian: Очищает блокировку и кэш для конкретного сайта.
     */
    private static handleClearProxyAutoStatusForSite(message: any, sendResponse: Function): boolean {
        const site = message.site;
        if (!site) {
            if (sendResponse) sendResponse({ success: false, error: 'No site' });
            return false;
        }
        // Clear dynamic override
        ProxyEngine.clearDynamicProxyForSite(site);
        // Clear site lock
        WebFailedRequestMonitor.clearSiteLock();
        // Clear successful proxy cache for this site
        WebFailedRequestMonitor.clearSuccessfulProxyCache();
//console.log(`[Core] Cleared lock and cache for site ${site}`)
        if (sendResponse) sendResponse({ success: true });
        return false;
    }
	
    /**
     * English: Handles removal of a proxy rule from popup.
     * Russian: Обрабатывает удаление правила прокси из попапа.
     */
    private static handlePopupRemoveProxyRule(message: any, sendResponse: Function): boolean {
//console.log("[Core] handlePopupRemoveProxyRule вызван, ruleId:", message.ruleId)
        if (!message.ruleId) {
            if (sendResponse) sendResponse({ success: false, error: 'Missing ruleId' });
            return false;
        }
        let found = false;
        for (const profile of Settings.current.proxyProfiles) {
            const index = profile.proxyRules?.findIndex(r => r.ruleId === message.ruleId);
            if (index !== undefined && index !== -1) {
//console.log("[Core] Найдено правило в профиле:", profile.profileId)
                profile.proxyRules.splice(index, 1);
                found = true;
                break;
            }
        }
        if (found) {
//console.log("[Core] Правило удалено, сохраняем настройки...")
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync();
            proxyEngineLib.notifyProxyRulesChanged();
            Core.setBrowserActionStatus();
            PolyFill.runtimeSendMessage({ command: "REFRESH_SETTINGS_PAGE_RELOAD" });
            if (sendResponse) sendResponse({ success: true });
        } else {
            console.warn("[Core] Правило не найдено!");
            if (sendResponse) sendResponse({ success: false, error: 'Rule not found' });
        }
        return false;
    }

    /**
     * English: Handles toggling enable state of a proxy rule from popup.
     * Russian: Обрабатывает переключение состояния правила прокси из попапа.
     */
    private static handlePopupDisableProxyRule(message: any, sendResponse: Function): boolean {
//console.log("[Core] handlePopupDisableProxyRule вызван, ruleId:", message.ruleId, "enabled:", message.enabled)
        if (!message.ruleId || message.enabled === undefined) {
            if (sendResponse) sendResponse({ success: false, error: 'Missing ruleId or enabled' });
            return false;
        }
        let found = false;
        for (const profile of Settings.current.proxyProfiles) {
            const rule = profile.proxyRules?.find(r => r.ruleId === message.ruleId);
            if (rule) {
//console.log("[Core] Найдено правило в профиле:", profile.profileId)
                rule.enabled = message.enabled;
                found = true;
                break;
            }
        }
        if (found) {
//console.log("[Core] Состояние правила изменено, сохраняем настройки...")
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync();
            proxyEngineLib.notifyProxyRulesChanged();
            Core.setBrowserActionStatus();
            PolyFill.runtimeSendMessage({ command: "REFRESH_SETTINGS_PAGE_RELOAD" });	
            if (sendResponse) sendResponse({ success: true });
        } else {
            console.warn("[Core] Правило не найдено!");
            if (sendResponse) sendResponse({ success: false, error: 'Rule not found' });
        }
        return false;
    }

    /**
     * English: Handles toggling proxy-per-origin mode for a specific rule from popup.
     * Russian: Обрабатывает переключение режима "прокси на вкладку" для конкретного правила из попапа.
     */
    private static handlePopupToggleProxyPerOriginForRule(message: any, sendResponse: Function): boolean {
//console.log("[Core] handlePopupToggleProxyPerOriginForRule вызван, ruleId:", message.ruleId, "enableProxyPerOrigin:", message.enableProxyPerOrigin)
        if (!message.ruleId || message.enableProxyPerOrigin === undefined) {
            if (sendResponse) sendResponse({ success: false, error: 'Missing ruleId or enableProxyPerOrigin' });
            return false;
        }
        let found = false;
        for (const profile of Settings.current.proxyProfiles) {
            const rule = profile.proxyRules?.find(r => r.ruleId === message.ruleId);
            if (rule) {
//console.log("[Core] Найдено правило в профиле:", profile.profileId)
                rule.enableProxyPerOrigin = message.enableProxyPerOrigin;
                found = true;
                break;
            }
        }
        if (found) {
//console.log("[Core] Режим per-origin изменён, сохраняем настройки...")
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync();
            proxyEngineLib.notifyProxyRulesChanged();
            Core.setBrowserActionStatus();
            if (sendResponse) sendResponse({ success: true });
        } else {
            console.warn("[Core] Правило не найдено!");
            if (sendResponse) sendResponse({ success: false, error: 'Rule not found' });
        }
        return false;
    }

    /**
     * English: Handles autoStatus update from popup (cycle tester)
     * Russian: Обрабатывает обновление autoStatus из попапа (циклический тестер)
     */
    private static async handleUpdateAutoStatus(message: any, sendResponse: Function): Promise<boolean> {
        const { proxyId, site, status, timestamp } = message;
        
        if (!proxyId || !site) {
            console.warn("[Core] handleUpdateAutoStatus: missing proxyId or site");
            if (sendResponse) sendResponse({ success: false, error: "Missing proxyId or site" });
            return false;
        }
        
        const normalizedSite = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
        
        try {
            // Use AutoStatusService to set the status
            const statusService = AutoStatusService.getInstance();
            statusService.setStatus(proxyId, normalizedSite, status, timestamp || Date.now());
            
            // Update rating based on status (success or indirect = +1, fail = -1)
            if (status === "success" || status === "indirect") {
                SettingsOperation.updateProxyRating(proxyId, 1);
            } else if (status === "fail") {
                SettingsOperation.updateProxyRating(proxyId, -1);
            }
            
            // Notify popup if open to refresh data
            PolyFill.runtimeSendMessage({ command: CommandMessages.PopupActiveTabChanged, tabId: -1 });
            
            if (sendResponse) sendResponse({ success: true });
        } catch (err) {
            console.error("[Core] handleUpdateAutoStatus error:", err);
            if (sendResponse) sendResponse({ success: false, error: String(err) });
        }
        
        return false;
    }

    /**
     * English: Adds a site to the SmartRules profile with mode='auto'.
     * Russian: Добавляет сайт в профиль SmartRules с режимом 'auto'.
     */
    private static handleAddSiteToAutoRules(message: any, sendResponse: Function): boolean {
        const site = message.site;
        if (!site) {
            if (sendResponse) sendResponse({ success: false, error: 'No site' });
            return false;
        }
        // English: Normalize site (remove www., protocol, trailing slash)
        // Russian: Нормализуем сайт (убираем www., протокол, завершающий слэш)
        const normalizedSite = Core.normalizeSite(site);
        if (!normalizedSite) {
            if (sendResponse) sendResponse({ success: false, error: 'Invalid site' });
            return false;
        }

        // Find SmartRules profile
        const smartRulesProfile = settingsLib.current.proxyProfiles.find(p => p.profileType === SmartProfileType.SmartRules);
        if (!smartRulesProfile) {
            if (sendResponse) sendResponse({ success: false, error: 'SmartRules profile not found' });
            return false;
        }
        // Check if rule already exists (using normalized host)
        let rule = smartRulesProfile.proxyRules.find(r => r.hostName === normalizedSite);
        if (!rule) {
            rule = new ProxyRule();
            rule.ruleType = ProxyRuleType.DomainSubdomain;
            rule.hostName = normalizedSite;
            rule.ruleSearch = normalizedSite;
            rule.enabled = true;
            rule.mode = 'auto';
            rule.isAuto = true;
            rule.proxyServerId = null;
            smartRulesProfile.proxyRules.push(rule);
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync(false);
            proxyEngineLib.notifyProxyRulesChanged();
        }
        // Switch to this profile if not already
        Core.ChangeActiveProfileId(smartRulesProfile.profileId);
        if (sendResponse) sendResponse({ success: true });
        return false;
    }

    /**
     * English: Forces refresh of AutoProxy for a site (clears dynamic override).
     * Russian: Принудительно обновляет AutoProxy для сайта (очищает динамическое переопределение).
     */
    private static handleForceAutoProxyRefresh(message: any, sendResponse: Function): boolean {
        const site = message.site;
        if (!site) {
            if (sendResponse) sendResponse({ success: false });
            return false;
        }
		// Clear dynamic override and force re-selection
		proxyEngineLib.clearDynamicProxyForSite(site);
		// Clear site lock and cache for this site
		WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
		WebFailedRequestMonitor.clearSiteLock();
//console.log(`[Core] Cleared lock and cache for site ${site} on force refresh`)
		// Reload tab if needed
		const tabData = TabManager.getCurrentTab();
		if (tabData && tabData.url && Utils.extractHostFromUrl(tabData.url) === site) {
			PolyFill.tabsReload(tabData.tabId);
		}
        if (sendResponse) sendResponse({ success: true });
        return false;
    }

    /**
     * English: Saves profile and refreshes proxy rules.
     * Russian: Сохраняет профиль и обновляет правила прокси.
     */
    private static handleSaveProfileAndRefresh(message: any, sendResponse: Function): boolean {
        const profileId = message.profileId;
        if (profileId) {
            settingsOperationLib.saveSmartProfiles();
            settingsOperationLib.saveAllSync(false);
            proxyEngineLib.notifyProxyRulesChanged();
        }
        if (sendResponse) sendResponse({ success: true });
        return false;
    }
	
    /**
     * English: Clears site lock and successful proxy cache for a specific site.
     * Russian: Очищает блокировку сайта и кэш успешных прокси для конкретного сайта.
     */
    private static handleClearSiteLockForSite(message: any, sendResponse: Function): boolean {
        const site = message.site;
        if (!site) {
            if (sendResponse) sendResponse({ success: false });
            return false;
        }
        // Clear site lock
        WebFailedRequestMonitor.clearSiteLock();
        // Clear successful proxy cache for this site
        // We need to access the static cache directly
        // Since it's private, we need a method in WebFailedRequestMonitor
        // We'll use a helper method
        WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
        // Also clear dynamic override
        ProxyEngine.clearDynamicProxyForSite(site);
//console.log(`[Core] Cleared lock and cache for site ${site}`)
        if (sendResponse) sendResponse({ success: true });
        return false;
    }	
	
	    /**
     * English: Handles setting user-selected proxy for a site
     * Russian: Обрабатывает установку выбранного пользователем прокси для сайта
     */
    private static handleSetUserSelectedProxy(message: any, sendResponse: Function): void {
        const { site, proxyId } = message;
        if (!site || !proxyId) {
            if (sendResponse) sendResponse({ success: false });
            return;
        }
        WebFailedRequestMonitor.setUserSelectedProxy(site, proxyId);
        if (sendResponse) sendResponse({ success: true });
    }
	
	    /**
     * English: Handles adding a proxy to the temp skip list
     * Russian: Обрабатывает добавление прокси во временный список пропуска
     */
    private static handleAddToTempSkipList(message: any, sendResponse: Function): void {
        const { site, proxyId } = message;
        if (!site || !proxyId) {
            if (sendResponse) sendResponse({ success: false });
            return;
        }
        WebFailedRequestMonitor.addToTempSkipList(site, proxyId);
        if (sendResponse) sendResponse({ success: true });
    }
	
    /**
     * English: Handles user response to auto-proxy dialog.
     * Russian: Обрабатывает ответ пользователя на диалог автопрокси.
     */
    private static handleAutoProxyDialogResponse(message: any, sendResponse: Function): boolean {
        const site = message.site;
        const response = message.response; // 'switch' or 'keep'
        if (!site || !response) {
            if (sendResponse) sendResponse({ success: false });
            return false;
        }
        
        if (response === 'switch') {
            // English: User wants to switch to a better proxy
            // Russian: Пользователь хочет сменить прокси
            const currentProxyId = ProxyEngine.getDynamicProxyForSite(site);
            const tabData = TabManager.getCurrentTab();
            const tabId = tabData ? tabData.tabId : -1;
            
            // Clear cache and lock
            WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
            WebFailedRequestMonitor.clearSiteLock();
            ProxyEngine.clearDynamicProxyForSite(site);
            
            // Trigger failover with next proxy
            WebFailedRequestMonitor.triggerFailoverForSite(site, currentProxyId, tabId);
            
//console.log(`[Core] User switched proxy for site ${site}, failover triggered`)
        } else {
            // English: User wants to keep current proxy
            // Russian: Пользователь хочет оставить текущий прокси
            // We can lock it if needed, but auto-pin may be disabled
            // Just log and do nothing
//console.log(`[Core] User kept current proxy for site ${site}`)
        }
        
        if (sendResponse) sendResponse({ success: true });
        return false;
    }	
    /**
     * English: Handles response from dialog window (pin, change, or add_site dialogs)
     * Russian: Обрабатывает ответ из окна диалога (диалоги закрепления, смены или добавления сайта)
     */
    private static handleDialogResponse(message: any, sendResponse: Function): boolean {
        const { type, site, proxyId, response, dontAsk } = message;
        if (!site || !type || !response) {
            if (sendResponse) sendResponse({ success: false, error: 'Missing parameters' });
            return false;
        }

//console.log(`[Core] Dialog response: type=${type}, site=${site}, proxyId=${proxyId}, response=${response}, dontAsk=${dontAsk}`)

        // English: Find the active SmartRules profile (if any)
        // Russian: Находим активный профиль SmartRules (если есть)
        const settings = Settings.current;
        const activeProfileId = settings?.activeProfileId;
        if (!activeProfileId) {
            if (sendResponse) sendResponse({ success: false, error: 'No active profile' });
            return false;
        }
        const profile = settings?.proxyProfiles?.find(p => p.profileId === activeProfileId);
        if (!profile) {
            if (sendResponse) sendResponse({ success: false, error: 'Profile not found' });
            return false;
        }
        if (profile.profileType !== SmartProfileType.SmartRules) {
            if (sendResponse) sendResponse({ success: false, error: 'Not a SmartRules profile' });
            return false;
        }

        // English: If user checked "don't ask again", store the site in appropriate list
        // Russian: Если пользователь отметил "больше не спрашивать", сохраняем сайт в соответствующий список
        if (dontAsk) {
            if (type === 'pin') {
                if (!profile.suppressPinDialogForSites) profile.suppressPinDialogForSites = [];
                if (!profile.suppressPinDialogForSites.includes(site)) {
                    profile.suppressPinDialogForSites.push(site);
                }
//console.log(`[Core] Added ${site} to suppressPinDialogForSites`)
            } else if (type === 'change') {
                if (!profile.suppressChangeDialogForSites) profile.suppressChangeDialogForSites = [];
                if (!profile.suppressChangeDialogForSites.includes(site)) {
                    profile.suppressChangeDialogForSites.push(site);
                }
//console.log(`[Core] Added ${site} to suppressChangeDialogForSites`)
            }
            // English: Also disable the global auto-dialog setting to suppress all future dialogs
            // Russian: Также отключаем глобальную настройку показа диалогов, чтобы подавить все будущие диалоги
            profile.showAutoDialog = false;
            // English: Save profile changes
            // Russian: Сохраняем изменения профиля
            SettingsOperation.saveSmartProfiles();
            SettingsOperation.saveAllSync(false);
        }

        // English: Handle the actual response
        // Russian: Обрабатываем фактический ответ
        if (type === 'pin') {
            if (response === 'yes') {
                // English: Pin the proxy for this site (session-only)
                // Russian: Закрепляем прокси для этого сайта (на сессию)
                const statusService = AutoStatusService.getInstance();
                statusService.pinProxy(site, proxyId);
                // English: Clear skip-auto-pin flag for this site
                // Russian: Очищаем флаг пропуска авто-закрепления для этого сайта
                WebFailedRequestMonitor.clearSkipAutoPinForSite(site);
//console.log(`[Core] Pinned proxy ${proxyId} for site ${site}`)

                // ===== Обновляем правило для этого сайта, чтобы отображать закреплённый прокси в таблице =====
                // English: Update the rule for this site to reflect the pinned proxy (keep mode='auto')
                // Russian: Обновляем правило для этого сайта, чтобы отображать закреплённый прокси (режим остаётся 'auto')
                const proxyServer = SettingsOperation.findProxyServerById(proxyId);
                if (proxyServer) {
                    const rule = profile.proxyRules?.find(r => r.hostName === site);
                    if (rule) {
                        // English: Set the proxyServerId and proxy object, but keep mode as 'auto'
                        // Russian: Устанавливаем proxyServerId и объект прокси, но оставляем режим 'auto'
                        rule.proxyServerId = proxyId;
                        rule.proxy = proxyServer;
                        // English: Ensure mode is 'auto' (just in case)
                        // Russian: Убеждаемся, что режим 'auto' (на всякий случай)
                        rule.mode = 'auto';
                        // English: Save profile changes
                        // Russian: Сохраняем изменения профиля
                        SettingsOperation.saveSmartProfiles();
                        SettingsOperation.saveAllSync(false);
                        // English: Notify settings page to refresh
                        // Russian: Уведомляем страницу настроек об обновлении
                        PolyFill.runtimeSendMessage({ command: "REFRESH_SETTINGS_PAGE_RELOAD" });
//console.log(`[Core] Updated rule for site ${site} with proxy ${proxyId} (mode auto)`)
                    } else {
                        console.warn(`[Core] Rule not found for site ${site}, cannot update proxyServerId`);
                    }
                } else {
                    console.warn(`[Core] Proxy ${proxyId} not found, cannot update rule`);
                }
                // ===== Конец обновления правила =====

                // English: Clear any failover in progress for this site
                // Russian: Очищаем любой выполняющийся failover для этого сайта
                WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
                WebFailedRequestMonitor.clearSiteLock();
                ProxyEngine.clearDynamicProxyForSite(site);
                // English: Ensure the pinned proxy is applied immediately
                // Russian: Убеждаемся, что закреплённый прокси применяется немедленно
                ProxyEngine.setDynamicProxyForSite(site, proxyId);
            } else {
                // English: User said "no" – start failover to next proxy (skip current)
                // Russian: Пользователь сказал "нет" – запускаем failover к следующему прокси (пропускаем текущий)
                const tabId = message.tabId || -1;
                // English: Clear cache and lock, then trigger failover
                // Russian: Очищаем кэш и блокировку, затем запускаем failover
                WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
                WebFailedRequestMonitor.clearSiteLock();
                ProxyEngine.clearDynamicProxyForSite(site);
                // English: Add current proxy to temp skip list so it's skipped in this cycle
                // Russian: Добавляем текущий прокси во временный список пропуска, чтобы он был пропущен в этом цикле
                WebFailedRequestMonitor.addToTempSkipList(site, proxyId);
                // English: Do NOT clear temp skip list – we want to continue from where we left off
                // Russian: НЕ очищаем временный список пропуска – мы хотим продолжить с того места, где остановились
                WebFailedRequestMonitor.triggerFailoverForSite(site, proxyId, tabId);
//console.log(`[Core] User rejected pin, starting failover for site ${site} (skipping ${proxyId})`)
            }
        } else if (type === 'change') {
            if (response === 'yes') {
                // English: User wants to change proxy – unpin and continue failover from next proxy
                // Russian: Пользователь хочет сменить прокси – снимаем закрепление и продолжаем failover со следующего прокси
                const statusService = AutoStatusService.getInstance();
                statusService.unpinProxy(site);
                // English: Mark that user initiated change via 🔄
                // Russian: Отмечаем, что пользователь инициировал смену через 🔄
                WebFailedRequestMonitor.setUserInitiatedChange(site);
//console.log(`[Core] Unpinned site ${site} before failover`)

                // ===== Сбрасываем proxyServerId в правиле при смене =====
                // English: Reset proxyServerId in the rule when user chooses to change
                // Russian: Сбрасываем proxyServerId в правиле, когда пользователь решает сменить
                const rule = profile.proxyRules?.find(r => r.hostName === site);
                if (rule) {
                    rule.proxyServerId = null;
                    rule.proxy = null;
                    // English: Keep mode as 'auto' (or we can set to 'auto' explicitly)
                    // Russian: Оставляем режим 'auto' (или явно устанавливаем)
                    rule.mode = 'auto';
                    SettingsOperation.saveSmartProfiles();
                    SettingsOperation.saveAllSync(false);
                    // English: Notify settings page to refresh
                    // Russian: Уведомляем страницу настроек об обновлении
                    PolyFill.runtimeSendMessage({ command: "REFRESH_SETTINGS_PAGE_RELOAD" });
//console.log(`[Core] Reset proxyServerId for rule of site ${site}`)
                } else {
                    console.warn(`[Core] Rule not found for site ${site}, cannot reset proxyServerId`);
                }
                // ===== Конец сброса правила =====

                const tabId = message.tabId || -1;
                WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
                WebFailedRequestMonitor.clearSiteLock();
                ProxyEngine.clearDynamicProxyForSite(site);
                // English: Do NOT reset failover state – we want to continue from where we left off
                // Russian: НЕ сбрасываем состояние failover – мы хотим продолжить с того места, где остановились
                // WebFailedRequestMonitor.resetFailoverStateForSite(site); // REMOVED
                // English: Add current proxy to temp skip list so it's skipped in the current cycle
                // Russian: Добавляем текущий прокси во временный список пропуска, чтобы он был пропущен в текущем цикле
                WebFailedRequestMonitor.addToTempSkipList(site, proxyId);
                // English: Pass current proxyId as the one to skip, failover will continue from the next index
                // Russian: Передаём текущий proxyId как тот, который нужно пропустить, failover продолжит со следующего индекса
                WebFailedRequestMonitor.triggerFailoverForSite(site, proxyId, tabId);
//console.log(`[Core] User requested change, continuing failover for site ${site}`)
            } else {
                // English: User wants to keep current proxy – do nothing, just log
                // Russian: Пользователь хочет оставить текущий прокси – ничего не делаем, просто логируем
//console.log(`[Core] User kept current proxy for site ${site}`)
            }
        } else if (type === 'add_site') {
            // English: User responded to "add unreachable site" dialog
            // Russian: Ответ пользователя на диалог добавления недоступного сайта
            if (response === 'yes') {
                // English: First, cancel any ongoing failover for this site
                // Russian: Сначала отменяем любой выполняющийся failover для этого сайта
                console.log(`[Core] Пользователь подтвердил добавление сайта ${site}, отменяем текущий failover`);
                WebFailedRequestMonitor.cancelFailoverForSite(site);
                // English: Also clear the temp skip list to start fresh
                // Russian: Также очищаем временный список пропуска, чтобы начать заново
                WebFailedRequestMonitor.clearTempSkipList(site);
                // English: Now add site to auto-proxy and trigger failover
                // Russian: Теперь добавляем сайт в автопрокси и запускаем failover
                const tabId = message.tabId || -1;
                Core.handleAddUnreachableSite({ site: site, tabId: tabId }, () => {});
            } else {
                // English: User declined – just log
                // Russian: Пользователь отказался – просто логируем
                console.log(`[Core] User declined to add site ${site} to auto-proxy`);
            }
            // English: For add_site we don't have a "dontAsk" checkbox, so ignore the flag
            // Russian: Для add_site у нас нет чекбокса "не спрашивать", поэтому игнорируем флаг
        }

        if (sendResponse) sendResponse({ success: true });
        return false;
    }	
	
    /**
     * English: Handles request to open change dialog from popup
     * Russian: Обрабатывает запрос на открытие диалога смены из попапа
     */
    private static handleOpenChangeDialog(message: any, sendResponse: Function): boolean {
        const { site, proxyId, proxyName } = message;
        if (!site || !proxyId) {
            if (sendResponse) sendResponse({ success: false, error: 'Missing parameters' });
            return false;
        }

        // English: Check if dialog is suppressed for this site or globally disabled
        // Russian: Проверяем, подавлен ли диалог для этого сайта или глобально отключён
        const settings = Settings.current;
        const activeProfileId = settings?.activeProfileId;
        if (activeProfileId) {
            const profile = settings?.proxyProfiles?.find(p => p.profileId === activeProfileId);
            if (profile) {
                const isGloballyDisabled = profile.showAutoDialog === false;
                const isSuppressedForSite = profile.suppressChangeDialogForSites && profile.suppressChangeDialogForSites.includes(site);
                if (isGloballyDisabled || isSuppressedForSite) {
                    // English: Dialog suppressed – directly trigger failover
                    // Russian: Диалог подавлен – сразу запускаем failover
                    const tabId = message.tabId || -1;
                    WebFailedRequestMonitor.clearSuccessfulProxyCacheForSite(site);
                    WebFailedRequestMonitor.clearSiteLock();
                    ProxyEngine.clearDynamicProxyForSite(site);
                    // English: Add current proxy to temp skip list so it's skipped in the first cycle
                    // Russian: Добавляем текущий прокси во временный список пропуска, чтобы он был пропущен в первом цикле
                    WebFailedRequestMonitor.addToTempSkipList(site, proxyId);
                    WebFailedRequestMonitor.triggerFailoverForSite(site, proxyId, tabId);
//console.log(`[Core] Change dialog suppressed (globally or for site) for ${site}, starting failover directly`)
                    if (sendResponse) sendResponse({ success: true, suppressed: true });
                    return false;
                }
            }
        }

        // English: Open change dialog
        // Russian: Открываем диалог смены
        Core.openDialog(
            'change',
            site,
            proxyId,
            proxyName || proxyId,
            'dialogChangeTitle',
            'dialogChangeMessage',
            'dialogChangeConfirm',
            'dialogChangeCancel',
            'dialogChangeCheckbox',
            'btn-danger' // красный для действия "сменить"
        );

        if (sendResponse) sendResponse({ success: true });
        return false;
    }
	
    /**
     * English: Opens a dialog window with the given parameters.
     * Russian: Открывает окно диалога с заданными параметрами.
     */
    /**
     * English: Opens a dialog window with the given parameters.
     * Russian: Открывает окно диалога с заданными параметрами.
     */
    public static openDialog(
        type: 'pin' | 'change' | 'add_site',
        site: string,
        proxyId: string | null,
        proxyName: string,
        titleKey: string,
        messageKey: string,
        confirmKey: string,
        cancelKey: string,
        checkboxKey: string,
        confirmClass: string = 'btn-primary',
        tabId: number = -1,
        showCheckbox: boolean = true
    ): void {
        // English: Get localized strings with parameter substitution
        // Russian: Получаем локализованные строки с подстановкой параметров
        const title = api.i18n.getMessage(titleKey) || titleKey;
        // English: Manually replace placeholders {0} and {1} with site and proxyName
        // Russian: Вручную заменяем плейсхолдеры {0} и {1} на site и proxyName
        let message = api.i18n.getMessage(messageKey) || messageKey;
        message = message.replace(/\{0\}/g, site).replace(/\{1\}/g, proxyName);
        const confirmText = api.i18n.getMessage(confirmKey) || confirmKey;
        const cancelText = api.i18n.getMessage(cancelKey) || cancelKey;
        const checkboxLabel = api.i18n.getMessage(checkboxKey) || checkboxKey;

        // English: Build URL parameters
        // Russian: Формируем параметры URL
        const params = new URLSearchParams({
            type: type,
            site: site,
            proxyId: proxyId,
            proxyName: proxyName,
            title: title,
            message: message,
            confirmText: confirmText,
            cancelText: cancelText,
            checkboxLabel: checkboxLabel,
            confirmClass: confirmClass,
            showCheckbox: String(showCheckbox),
            tabId: String(tabId)
        });

        const url = api.runtime.getURL('ui/dialog.html') + '?' + params.toString();

        // English: Check if dialog already open for this site and type
        // Russian: Проверяем, не открыт ли уже диалог для этого сайта и типа
        const dialogKey = `${type}_${site}`;
        if (Core._openDialogs.has(dialogKey)) {
            const existingWindowId = Core._openDialogs.get(dialogKey);
            if (existingWindowId) {
                // English: Focus existing dialog window
                // Russian: Фокусируем существующее окно диалога
                api.windows.update(existingWindowId, { focused: true }, () => {
                    if (api.runtime.lastError) {
                        // English: Window no longer exists, remove from tracking and open new
                        // Russian: Окно больше не существует, удаляем из отслеживания и открываем новое
                        Core._openDialogs.delete(dialogKey);
                        Core._createDialogWindow(url, dialogKey);
                    }
                });
                return;
            }
        }

        // ========== NEW: Defer dialog if tab is not active ==========
        // English: If tabId is valid, check if this tab is currently active
        // Russian: Если tabId корректен, проверяем, активна ли эта вкладка
        if (tabId > -1) {
            PolyFill.tabsQuery({ active: true, currentWindow: true }, (tabs: any[]) => {
                const activeTab = tabs && tabs[0];
                const isActive = activeTab && activeTab.id === tabId;
                if (!isActive) {
                    // English: Tab is not active – store dialog as pending
                    // Russian: Вкладка не активна – сохраняем диалог как ожидающий
                    console.log(`[Core] Диалог для вкладки ${tabId} (${site}) отложен, так как вкладка не активна`);
                    Core._pendingDialogs.set(tabId, {
                        site,
                        type,
                        proxyId,
                        proxyName,
                        tabId,
                        params: { url, dialogKey }
                    });
                    // English: Also remove any existing open dialog for this key to avoid duplication
                    // Russian: Также удаляем существующий открытый диалог для этого ключа, чтобы избежать дублирования
                    if (Core._openDialogs.has(dialogKey)) {
                        Core._openDialogs.delete(dialogKey);
                    }
                    return;
                }
                // English: Tab is active – open immediately
                // Russian: Вкладка активна – открываем сразу
                Core._createDialogWindow(url, dialogKey);
            });
        } else {
            // English: No tabId provided – open immediately (fallback)
            // Russian: tabId не указан – открываем сразу (запасной вариант)
            Core._createDialogWindow(url, dialogKey);
        }
        // ========== END NEW ==========
    }

    /**
     * English: Handles auto-refresh button click from popup
     * Russian: Обрабатывает нажатие кнопки автообновления из попапа
     */
    private static handleAutoRefresh(message: any, sendResponse: Function): boolean {
        const site = message.site;
        if (!site) {
            sendResponse({ success: false, error: 'No site provided' });
            return false;
        }

        // English: Find SmartRules profile
        // Russian: Находим профиль SmartRules
        const settings = Settings.current;
        if (!settings) {
            sendResponse({ success: false, error: 'Settings not initialized' });
            return false;
        }

        const smartRulesProfile = settings.proxyProfiles.find(p => p.profileType === SmartProfileType.SmartRules);
        if (!smartRulesProfile) {
            sendResponse({ success: false, error: 'SmartRules profile not found' });
            return false;
        }

        // English: Normalize site (remove www.)
        // Russian: Нормализуем сайт (убираем www.)
        let normalizedSite = site.toLowerCase();
        if (normalizedSite.startsWith('www.')) {
            normalizedSite = normalizedSite.substring(4);
        }

        // English: Find existing rule
        // Russian: Ищем существующее правило
        const existingRule = smartRulesProfile.proxyRules.find(r => r.hostName === normalizedSite);

        if (existingRule) {
            const currentMode = existingRule.mode || 'auto';
            if (currentMode === 'auto') {
                // English: Rule exists and mode is auto – return proxy info for change dialog
                // Russian: Правило существует и режим auto – возвращаем информацию о прокси для диалога смены
                let proxyId = existingRule.proxyServerId;
                if (!proxyId) {
                    // Try pinned or dynamic
                    const statusService = AutoStatusService.getInstance();
                    const pinned = statusService.getPinnedProxy(normalizedSite);
                    if (pinned) proxyId = pinned;
                    else {
                        const dynamic = ProxyEngine.getDynamicProxyForSite(normalizedSite);
                        if (dynamic) proxyId = dynamic;
                        else {
                            // fallback to default proxy
                            const defaultProxy = settings.defaultProxyServerId;
                            if (defaultProxy) proxyId = defaultProxy;
                        }
                    }
                }
                if (proxyId) {
                    const proxyServer = SettingsOperation.findProxyServerById(proxyId);
                    const proxyName = proxyServer ? (proxyServer.name || `${proxyServer.host}:${proxyServer.port}`) : proxyId;
                    sendResponse({
                        success: true,
                        action: 'changeDialog',
                        proxyId: proxyId,
                        proxyName: proxyName
                    });
                } else {
                    sendResponse({ success: false, error: 'No proxy found for this site' });
                }
                return false;
            } else {
                // English: Mode is manual – suggest switching to auto
                // Russian: Режим manual – предлагаем переключить на auto
                sendResponse({
                    success: true,
                    action: 'switchToAuto'
                });
                return false;
            }
        } else {
            // English: No rule – suggest adding
            // Russian: Нет правила – предлагаем добавить
            sendResponse({
                success: true,
                action: 'addRule'
            });
            return false;
        }
    }

    /**
     * English: Sets rule mode for a site
     * Russian: Устанавливает режим правила для сайта
     */
    private static handleSetRuleMode(message: any, sendResponse: Function): boolean {
        const { site, mode } = message;
        if (!site || !mode) {
            sendResponse({ success: false, error: 'Missing site or mode' });
            return false;
        }

        const settings = Settings.current;
        if (!settings) {
            sendResponse({ success: false, error: 'Settings not initialized' });
            return false;
        }

        const smartRulesProfile = settings.proxyProfiles.find(p => p.profileType === SmartProfileType.SmartRules);
        if (!smartRulesProfile) {
            sendResponse({ success: false, error: 'SmartRules profile not found' });
            return false;
        }

        let normalizedSite = site.toLowerCase();
        if (normalizedSite.startsWith('www.')) {
            normalizedSite = normalizedSite.substring(4);
        }

        const rule = smartRulesProfile.proxyRules.find(r => r.hostName === normalizedSite);
        if (!rule) {
            sendResponse({ success: false, error: 'Rule not found' });
            return false;
        }

        rule.mode = mode;
        SettingsOperation.saveSmartProfiles();
        SettingsOperation.saveAllSync(false);
        ProxyEngine.notifyProxyRulesChanged();

        sendResponse({ success: true });
        return false;
    }

    private static _createDialogWindow(url: string, dialogKey: string): void {
        const width = 480;
        const height = 320;
        // English: Delay creation to ensure the tab is fully active
        // Russian: Задержка создания, чтобы убедиться, что вкладка полностью активна
        setTimeout(() => {
            api.windows.create({
                url: url,
                type: 'popup',
                width: width,
                height: height,
                focused: true,
                state: 'normal'
            }, (win) => {
                if (win) {
                    Core._openDialogs.set(dialogKey, win.id);
                    // English: Force focus on the dialog window
                    // Russian: Принудительно фокусируем окно диалога
                    api.windows.update(win.id, { focused: true });
//console.log(`[Core] Dialog window opened (id: ${win.id}) for ${dialogKey}`)
                    // English: Listen for window removal to clean up tracking
                    // Russian: Слушаем удаление окна для очистки отслеживания
                    const removeListener = (windowId: number) => {
                        if (windowId === win.id) {
                            Core._openDialogs.delete(dialogKey);
                            api.windows.onRemoved.removeListener(removeListener);
//console.log(`[Core] Dialog window ${windowId} closed, removed from tracking`)
                        }
                    };
                    api.windows.onRemoved.addListener(removeListener);
                } else {
                    console.warn('[Core] Failed to open dialog window');
                }
            });
        }, 150); // small delay for tab activation
    }
}

// Start the extension
Core.initializeApp();