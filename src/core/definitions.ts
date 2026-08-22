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
 
import { Settings } from './Settings';
import { api, environment } from '../lib/environment';
import { Utils } from '../lib/Utils';
import { ProfileOperations } from './ProfileOperations';

export const DEFAULT_MAX_FAILOVER_ATTEMPTS = 3;
export const proxyServerProtocols = ['HTTP', 'HTTPS', 'SOCKS4', 'SOCKS5'];
export const proxyServerSubscriptionObfuscate = ['None', 'Base64'];
export const proxyServerSubscriptionFormat = ['PlainText', 'JSON', 'CSV'];
export const specialRequestApplyProxyModeKeys = ['NoProxy', 'CurrentProxy' /* , "SelectedProxy" */];
export const proxyRulesActionTypes = [
	api.i18n.getMessage('settingsRuleActionApplyProxy'),
	api.i18n.getMessage('settingsRuleActionWhitelist'),
];
export const monitorUrlsSchemaFilter = ['*://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'];
export const themesCustomType = "0";
export const themesDarkFix = "themes-darkfix.css";
export const themesDataTablesDarkFix = "themes-datatables-darkfix.css";

export enum SmartProfileType {
	Direct,
	SystemProxy,
	SmartRules,
	AlwaysEnabledBypassRules,
	IgnoreFailureRules,
}
export function getSmartProfileTypeIcon(profileType: SmartProfileType) {
	switch (profileType) {
		case SmartProfileType.Direct:
			return 'fas fa-ban text-danger';

		case SmartProfileType.SystemProxy:
			return 'fab fa-windows text-primary';

		case SmartProfileType.SmartRules:
			return 'fas fa-crosshairs text-primary';

		case SmartProfileType.AlwaysEnabledBypassRules:
			return 'fas fa-globe-europe text-success';

		case SmartProfileType.IgnoreFailureRules:
			return 'fas fa-scroll';

		default:
			return '';
	}
}
export enum SmartProfileTypeBuiltinIds {
	Direct = 'InternalProfile_Direct',
	SmartRules = 'InternalProfile_SmartRules',
	AlwaysEnabled = 'InternalProfile_AlwaysEnabled',
	SystemProxy = 'InternalProfile_SystemProxy',
	IgnoreRequestFailures = 'InternalProfile_IgnoreRequestFailures',
}
export enum ProxyRuleType {
	MatchPatternHost,
	MatchPatternUrl,
	RegexHost,
	RegexUrl,
	Exact,
	DomainSubdomain,
	DomainExact,
	DomainAndPath,
	DomainSubdomainAndPath,
	SearchUrl,
	IpCidrNotation
}
export enum CompiledProxyRuleType {
	RegexHost,
	RegexUrl,
	Exact,
	/** Url should be included from the start */
	SearchUrl,
	/** Domain should be a exact match */
	SearchDomain,
	/** Matches domain and its subdomains */
	SearchDomainSubdomain,
	/** Matches domain and path */
	SearchDomainAndPath,
	/** Matches domain and its subdomains including path in the end of each */
	SearchDomainSubdomainAndPath

	/*
	Note on how popular these rules are on a subscription
	{
		"1": 31,   // RegexUrl
		"3": 394,  // SearchUrl
		"5": 3326, // SearchDomainSubdomain
		"6": 1074, // SearchDomainAndPath
		"7": 2363  // SearchDomainSubdomainAndPath
	}
	*/
}
function convertCompiledToProxyRuleType(compiledRule: CompiledProxyRuleType): ProxyRuleType | null {
	switch (compiledRule) {
		case CompiledProxyRuleType.RegexHost:
			return ProxyRuleType.RegexHost;

		case CompiledProxyRuleType.RegexUrl:
			return ProxyRuleType.RegexUrl;

		case CompiledProxyRuleType.Exact:
			return ProxyRuleType.Exact;

		case CompiledProxyRuleType.SearchUrl:
			return ProxyRuleType.SearchUrl;

		case CompiledProxyRuleType.SearchDomain:
			return ProxyRuleType.DomainExact;

		case CompiledProxyRuleType.SearchDomainSubdomain:
			return ProxyRuleType.DomainSubdomain;

		case CompiledProxyRuleType.SearchDomainAndPath:
			return ProxyRuleType.DomainAndPath;

		case CompiledProxyRuleType.SearchDomainSubdomainAndPath:
			return ProxyRuleType.DomainSubdomainAndPath;

		default:
			return null;
	}
}

export enum CompiledProxyRuleSource {
	Rules,
	Subscriptions,
}
export enum ProxyServerForProtocol {
	Http,
	SSL,
	FTP,
	SOCKS,
}
export class CommandMessages {
	// Popup messages
	public static PopupGetInitialData = 'Popup_GetInitialData';
	//public static PopupChangeProxyMode = 'Popup_ChangeProxyMode';
	public static PopupChangeActiveProfile = 'Popup_ChangeActiveProfile';
	public static PopupChangeActiveProxyServer = 'Popup_ChangeActiveProxyServer';
	public static PopupToggleProxyForDomain = 'Popup_ToggleProxyForDomain';
	public static PopupChangeProxyForRule = 'Popup_ChangeProxyForRule';
	public static PopupAddDomainListToProxyRule = 'Popup_AddDomainListToProxyRule';
	public static PopupAddDomainListToIgnored = 'Popup_AddDomainListToIgnored';

	// Settings page
	public static SettingsPageGetInitialData = 'SettingsPage_GetInitialData';
	public static SettingsPageGetInitialDataResponse = 'SettingsPage_GetInitialData_Response';
	public static SettingsPageShowMessage = 'SettingsPage_ShowMessage';
	public static SettingsPageSaveOptions = 'SettingsPage_SaveOptions';
	public static SettingsPageSaveProxyServers = 'SettingsPage_SaveProxyServers';
	public static SettingsPageSaveProxySubscriptions = 'SettingsPage_SaveProxySubscriptions';
	public static SettingsPageSaveSmartProfile = 'SettingsPage_SaveSmartProfile';
	public static SettingsPageDeleteSmartProfile = 'SettingsPage_DeleteSmartProfile';
	public static SettingsPageRestoreSettings = 'SettingsPage_RestoreSettings';
	public static SettingsPageMakeRequestSpecial = 'SettingsPage_MakeRequestSpecial';
	public static SettingsPageSkipWelcome = 'SettingsPage_SkipWelcome';
	public static SettingsPageFactoryReset = 'SettingsPage_FactoryReset';
	public static SettingsPageWebDavBackupNow = 'SettingsPage_WebDavBackupNow';
	public static SettingsPageWebDavRestoreNow = 'SettingsPage_WebDavRestoreNow';
	public static SettingsPageSaveUiOption = 'SettingsPage_SaveUiOption';

	// Request Logger
	public static ProxyableRequestLog = 'Proxyable_RequestLog';
	public static ProxyableOriginTabRemoved = 'Proxyable_OriginTabRemoved';

	// Proxyable Resources
	public static ProxyableGetInitialData = 'Proxyable_GetInitialData';
	public static ProxyableGetInitialDataResponse = 'Proxyable_GetInitialData_Response';
	public static ProxyableRemoveProxyableLog = 'Proxyable_RemoveProxyableLog';
	public static ProxyableToggleProxyableDomain = 'Proxyable_ToggleProxyableDomain';

	// WebFailedRequest
	public static WebFailedRequestNotification = 'WebFailedRequest_Notification';

	// Debug
	public static DebugEnableDiagnostics = 'Debug_EnableDiagnostics';
	public static DebugGetDiagnosticsLogs = 'Debug_GetDiagnosticsLogs';
	// English: Popup active tab changed (used for dynamic updates)
    // Russian: Активная вкладка попапа изменена (используется для динамических обновлений)
    public static PopupActiveTabChanged = 'Popup_ActiveTabChanged';
    public static PopupRemoveProxyRule = 'Popup_RemoveProxyRule';
    public static PopupDisableProxyRule = 'Popup_DisableProxyRule';
    public static PopupToggleProxyPerOriginForRule = 'Popup_ToggleProxyPerOriginForRule';
    
    // English: Show auto-proxy change dialog for a site
    // Russian: Показать диалог смены автопрокси для сайта
    public static ShowAutoProxyDialog = 'ShowAutoProxyDialog';
    // English: User response to auto-proxy dialog (change/keep)
    // Russian: Ответ пользователя на диалог автопрокси (сменить/оставить)
    public static AutoProxyDialogResponse = 'AutoProxyDialogResponse';	
    // English: Dialog response from dialog window
    // Russian: Ответ диалога из окна диалога
    public static DialogResponse = 'DIALOG_RESPONSE';
    public static OpenChangeDialog = 'OPEN_CHANGE_DIALOG';	
	
}
export enum BrowserProxySettingsType {
	none = 'none',
	autoDetect = 'autoDetect',
	system = 'system',
	manual = 'manual',
	autoConfig = 'autoConfig',
}
export class ShortcutCommands {
	public static NextProxyServer = 'next-proxy-server';
	public static PreviousProxyServer = 'previous-proxy-server';
	public static BuiltinProfileNone = 'proxy-mode-none';
	public static BuiltinProfileSmart = 'proxy-mode-smart';
	public static BuiltinProfileAlways = 'proxy-mode-always';
	public static BuiltinProfileSystem = 'proxy-mode-system';
}

export class ResultHolder {
	public success: boolean;
	public message: string;
}

export class ResultHolderGeneric<T> implements ResultHolder {
	public success: boolean;
	public message: string;
	public value: T;
}

export class PopupInternalDataType {
	public proxyableDomains: ProxyableDomainType[];
	public proxyProfiles: SmartProfileBase[];
	public activeProfileId: string;
	public activeIncognitoProfileId: string;
	public hasProxyServers: boolean;
	public proxyServers: ProxyServer[];
	public currentProxyServerId: string;
	public currentTabId: number;
	public currentTabIndex: number;
	public currentTabIsIncognito: boolean;
	public proxyServersSubscribed: ProxyServerFromSubscription[];
	public updateInfo: UpdateInfo;
	public failedRequests: FailedRequestType[];
	public notSupportedSetProxySettings: boolean;
	public notAllowedSetProxySettings: boolean;
	public themeData: PartialThemeDataType;
	public refreshTabOnConfigChanges: boolean;
	public enableRating: boolean = false;
    // ProxyMust: direct IP detection setting for popup
    public enableDirectIpDetection: boolean = false;
	    // ProxyMust: auto-test statuses for each proxy and site
    public autoStatus: AutoStatusMap = {};

    // ProxyMust: priority for manual proxies (pin/star/null)
    public proxyPriority: { [proxyId: string]: 'pin' | 'star' | null } = {};

    // ProxyMust: current site from active tab
    public currentSite: string = '';

    // ProxyMust: stale hours for auto-status
    public staleHours: number = 6;
}
export class PartialThemeDataType {
	public themeType: ThemeType = ThemeType.Auto;
	public themesLight: string;
	public themesLightCustomUrl: string;
	public themesDark: string;
	public themesDarkCustomUrl: string;
}
export class FailedRequestType {
	hasRule: boolean;
	ruleId?: RuleId;
	url: string;
	domain: string;
	hitCount: number;
	isRuleForThisHost: boolean;
	isRootHost: boolean;
	ignored: boolean;
	_domainSortable: string;
}

export type ProxyableDomainType = {
	/**Most of the times no rule is defined */
	ruleId?: RuleId;
	domain: string;
	ruleMatched: boolean;
	ruleMatchedThisHost: boolean;
	ruleSource: CompiledProxyRuleSource;
	ruleMatchSource: CompiledProxyRulesMatchedSource;
	ruleHasWhiteListMatch?: boolean;
	proxyServerId?: string;
    enableProxyPerOrigin?: boolean;	
};

export type SettingsPageInternalDataType = {
	settings: SettingsConfig;
};
export class SettingsPageSmartProfile {
	smartProfile: SmartProfile;
	htmlProfileMenu: any;
	htmlProfileTab: any;
	grdRules: any;
	grdRulesSubscriptions: any;
	modalModifyRule: any;
	modalAddMultipleRules: any;
	modalRulesSubscription: any;
	modalImportRules: any;
};

export class ProxyableInternalDataType {
	url: string;
	themeData: PartialThemeDataType;
}

export enum ProxyableMatchedRuleStatus {
	NoneMatched,
	Special,
	ProxyPerOrigin,
	// SmartRules profile
	MatchedRule,
	Whitelisted,

	// AlwaysEnabled profile
	AlwaysEnabledByPassed/* whitelisted, rule matched */,
	AlwaysEnabledForcedByRules /* proxied, rule matched */

}
export enum ProxyableProxifiedStatus {
	NoProxy,
	Special,
	ProxyPerOrigin,
	MatchedRule,
	AlwaysEnabled /* proxied, no rule matched */,
	SystemProxyApplied /* unknown, system proxy will apply */
}

export class ProxyableLogDataType {
	public tabId: number;
	public url: string;
	public ruleId?: number;
	public ruleHostName: string;
	public rulePatternText: string;
	public ruleSource?: CompiledProxyRuleSource;
	public matchedRuleStatus: ProxyableMatchedRuleStatus;
	public proxifiedStatus: ProxyableProxifiedStatus;

	get matchedRuleStatusName(): string {
		return ProxyableMatchedRuleStatus[this.matchedRuleStatus];
	}

	get proxifiedStatusName(): string {
		return ProxyableProxifiedStatus[this.proxifiedStatus];
	}

	get proxified(): boolean {
		return this.proxifiedStatus != ProxyableProxifiedStatus.NoProxy;
	}

	applyFromRule(rule: CompiledProxyRule) {
		if (!rule)
			return;

		this.rulePatternText = rule.ruleText;
		this.ruleId = rule.ruleId;
		this.ruleSource = rule.compiledRuleSource;
		if (!this.ruleHostName)
			this.ruleHostName = rule.hostName;
	}
	removeRuleInfo() {
		this.rulePatternText = '';
		this.ruleId = null;
		this.ruleSource = null;
		this.ruleHostName = '';
	}
}

export class SettingsConfig implements Cloneable {
	constructor() { }
	public product: string = 'SmartProxy';
	public version: string = '';
	public configVersion: string = '';
	public syncHash: string = '';
	public proxyProfiles: SmartProfile[] = getBuiltinSmartProfiles();
	public activeProfileId: string = SmartProfileTypeBuiltinIds.Direct;
	public defaultProxyServerId: string;

	public proxyServers: ProxyServer[] = [];
	public proxyServerSubscriptions: ProxyServerSubscription[] = [];
	public options: GeneralOptions;
	public uiOptions: UIOptions;
	public firstEverInstallNotified: boolean = false;
	public updateInfo: UpdateInfo = null;
	    // ProxyMust: priority for manual proxies (pin/star/null)
    // Приоритет для ручных прокси (pin/star/null)
    public proxyPriority: { [proxyId: string]: 'pin' | 'star' | null } = {};

    // ProxyMust: auto-test results for each proxy and site
    // Результаты автотестов для каждого прокси и сайта
    public autoStatus: AutoStatusMap = {};

    // User preferences (not synced)
    // Пользовательские настройки (не синхронизируются)
    public userPrefs: UserPreferences = { staleHours: 6, manualSites: [] };
	
	CopyFrom(source: SettingsConfig): void {
		this.options = new GeneralOptions();
		this.options.CopyFrom(source.options);

		this.uiOptions = new UIOptions();
		this.uiOptions.CopyFrom(source.uiOptions);

		let copyProxyProfiles: SmartProfile[] = [];
		for (const sourceProfile of source.proxyProfiles) {
			let copyProfile = new SmartProfile();
			ProfileOperations.copySmartProfile(sourceProfile, copyProfile);

			copyProxyProfiles.push(copyProfile);
		}
		this.proxyProfiles = copyProxyProfiles;
		this.activeProfileId = source.activeProfileId;

		let copyProxyServers: ProxyServer[] = [];
		for (const sourceProxy of source.proxyProfiles) {
			let copyProxy = new ProxyServer();
			copyProxy.CopyFrom(sourceProxy);

			if (copyProxy.isValid())
				copyProxyServers.push(copyProxy);
		}
		this.proxyServers = copyProxyServers;
		this.defaultProxyServerId = source.defaultProxyServerId;

		let copyProxySubs: ProxyServerSubscription[] = [];
		for (const srcProxySub of source.proxyServerSubscriptions) {
			let copyProxySub = new ProxyServerSubscription();
			copyProxySub.CopyFrom(srcProxySub);

			if (copyProxySub.isValid())
				copyProxySubs.push(copyProxySub);
		}
		this.proxyServerSubscriptions = copyProxySubs;

		this.firstEverInstallNotified = source.firstEverInstallNotified;
		this.version = source.version;
		this.syncHash = source.syncHash;
		this.configVersion = source.configVersion;
				// Copy updateInfo (missing in original)
		// Копирование updateInfo (отсутствовало в оригинале)
		this.updateInfo = source.updateInfo;

		// ProxyMust fields copy
		// Копирование полей ProxyMust
		this.proxyPriority = source.proxyPriority ? { ...source.proxyPriority } : {};
		this.autoStatus = source.autoStatus ? JSON.parse(JSON.stringify(source.autoStatus)) : {};
		// Deprecated fields – no longer used
		// this.manualSites = source.manualSites ? [...source.manualSites] : [];
		// this.proxyMustSettings = source.proxyMustSettings ? { ...source.proxyMustSettings } : { staleHours: 6 };
	}
	
}

export class SettingsActive {
	public activeProfile: SmartProfileCompiled;
	public activeIncognitoProfile: SmartProfileCompiled;

	/** Current proxy server is derived from 
	 * Active Profile if it is set otherwise it is derived from Default Proxy Server */
	public currentProxyServer: ProxyServer;
	public currentIgnoreFailureProfile: SmartProfileCompiled;
}

export class SmartProfileTypeConfig {
	public editable: boolean;
	public selectable: boolean;
	public builtin: boolean;
	public supportsSubscriptions: boolean;
	/** Can have customer proxy on Profile */
	public supportsProfileProxy: boolean;
	/** Can have custom proxy for each rule */
	public customProxyPerRule: boolean;
	/**  Enabled/Disabled */
	public canBeDisabled: boolean;
	/** Rule action can be Apply Whitelist/Apply Proxy */
	public supportsRuleActionWhitelist: boolean;
	/** If rule action is supported what is the default action? Is it whitelist */
	public defaultRuleActionIsWhitelist?: boolean;
}

export class SmartProfileBase {
	public profileType: SmartProfileType;
	public profileTypeConfig: SmartProfileTypeConfig;
	public profileId: string;
	public profileName: string;
	public enabled: boolean = true;
	public profileProxyServerId: string;
}

export class SmartProfile extends SmartProfileBase {
	public proxyRules: ProxyRule[] = [];
	public rulesSubscriptions: ProxyRulesSubscription[] = [];
	// English: AutoProxy settings (selection mode, failover attempts, excluded proxies)
    // Russian: Настройки AutoProxy (режим выбора, попытки failover, исключённые прокси)
    public selectionMode?: 'manual' | 'auto' = 'manual';
    public autoProxySettings?: {
        maxFailoverAttempts?: number;   // по умолчанию 3
        excludedProxies?: string[];      // глобально исключённые
        excludedForSite?: { [site: string]: string[] }; // исключения для сайта
    };
    // English: Auto-pin on success (without confirmation)
    // Russian: Автоматически закреплять успешный прокси (без подтверждения)
    public autoPinSuccess: boolean = false;
    // English: Show dialog for auto-proxy change
    // Russian: Показывать диалог смены автопрокси
    public showAutoDialog: boolean = true;
    // English: Lists of sites for which pin/change dialogs should be suppressed
    // Russian: Списки сайтов, для которых диалоги закрепления/смены должны подавляться
    public suppressPinDialogForSites?: string[] = [];
    public suppressChangeDialogForSites?: string[] = [];	
    // English: List of sites for which add-site dialog should be suppressed
    // Russian: Список сайтов, для которых диалог добавления сайта должен подавляться
    public suppressAddSiteDialogForSites?: string[] = [];
    // English: Automatically suggest adding unreachable sites to auto-proxy rules
    // Russian: Автоматически предлагать добавлять недоступные сайты в правила автопрокси
    public autoAddUnreachableSites: boolean = true;	
}

export class SmartProfileCompiled extends SmartProfileBase {
	public compiledRules: CompiledProxyRulesInfo;
	public profileProxyServer: ProxyServer;
}
export function getUserSmartProfileTypeConfig(profileType: SmartProfileType): SmartProfileTypeConfig {
	let config = getSmartProfileTypeConfig(profileType);
	config.builtin = false;
	return config;
}
export function getSmartProfileTypeConfig(profileType: SmartProfileType): SmartProfileTypeConfig {
	switch (profileType) {
		case SmartProfileType.Direct:
			return {
				builtin: true,
				editable: false,
				selectable: true,
				supportsSubscriptions: false,
				supportsProfileProxy: false,
				customProxyPerRule: false,
				canBeDisabled: false,
				supportsRuleActionWhitelist: false,
				defaultRuleActionIsWhitelist: null,
			}
		case SmartProfileType.SmartRules:
			return {
				builtin: true,
				editable: true,
				selectable: true,
				supportsSubscriptions: true,
				supportsProfileProxy: true,
				customProxyPerRule: true,
				canBeDisabled: true,
				supportsRuleActionWhitelist: true,
				defaultRuleActionIsWhitelist: false,
			}
		case SmartProfileType.AlwaysEnabledBypassRules:
			return {
				builtin: true,
				editable: true,
				selectable: true,
				supportsSubscriptions: true,
				supportsProfileProxy: true,
				customProxyPerRule: true,
				canBeDisabled: true,
				supportsRuleActionWhitelist: true,
				defaultRuleActionIsWhitelist: true,
			}
		case SmartProfileType.SystemProxy:
			return {
				builtin: true,
				editable: false,
				selectable: true,
				supportsSubscriptions: false,
				supportsProfileProxy: false,
				customProxyPerRule: false,
				canBeDisabled: false,
				supportsRuleActionWhitelist: false,
				defaultRuleActionIsWhitelist: null,
			}
		case SmartProfileType.IgnoreFailureRules:
			return {
				builtin: true,
				editable: false,
				selectable: false,
				supportsSubscriptions: false,
				supportsProfileProxy: false,
				customProxyPerRule: false,
				canBeDisabled: false,
				supportsRuleActionWhitelist: false,
				defaultRuleActionIsWhitelist: null,
			}
		default:
			return null;
	}
}
export function getSmartProfileTypeName(profileType: SmartProfileType) {
	return api.i18n.getMessage(`settings_SmartProfileType_${SmartProfileType[profileType]}`);
}
export function getBuiltinSmartProfiles(): SmartProfile[] {
	return [
		{
			profileId: SmartProfileTypeBuiltinIds.Direct,
			profileType: SmartProfileType.Direct,
			profileTypeConfig: getSmartProfileTypeConfig(SmartProfileType.Direct),
			profileName: api.i18n.getMessage('popupNoProxy'),
			proxyRules: [],
			enabled: true,
			rulesSubscriptions: [],
			profileProxyServerId: null,
			autoPinSuccess: false,
			showAutoDialog: true,
			autoAddUnreachableSites: true
		},
		{
			profileId: SmartProfileTypeBuiltinIds.SmartRules,
			profileType: SmartProfileType.SmartRules,
			profileTypeConfig: getSmartProfileTypeConfig(SmartProfileType.SmartRules),
			profileName: api.i18n.getMessage('popupSmartProxy'),
			proxyRules: [],
			enabled: true,
			rulesSubscriptions: [],
			profileProxyServerId: null,
			autoPinSuccess: false,
			showAutoDialog: true,
			autoAddUnreachableSites: true
		},
		{
			profileId: SmartProfileTypeBuiltinIds.AlwaysEnabled,
			profileType: SmartProfileType.AlwaysEnabledBypassRules,
			profileTypeConfig: getSmartProfileTypeConfig(SmartProfileType.AlwaysEnabledBypassRules),
			profileName: api.i18n.getMessage('popupAlwaysEnable'),
			proxyRules: [
				// Whitelist localhost addresses
				Object.assign(new ProxyRule(), {
					ruleId: -10,
					enabled: true,
					ruleType: ProxyRuleType.DomainSubdomain,
					ruleSearch: "localhost",
					hostName: 'localhost',
					whiteList: true
				}),
				Object.assign(new ProxyRule(), {
					ruleId: -11,
					enabled: true,
					ruleType: ProxyRuleType.DomainSubdomain,
					ruleSearch: "127.0.0.1",
					hostName: "127.0.0.1",
					whiteList: true
				}),
				Object.assign(new ProxyRule(), {
					ruleId: -14,
					enabled: true,
					ruleType: ProxyRuleType.DomainSubdomain,
					ruleSearch: "[::1]",
					hostName: '[::1]',
					whiteList: true
				})
			],
			enabled: true,
			rulesSubscriptions: [],
			profileProxyServerId: null,
			autoPinSuccess: false,
			showAutoDialog: true,
			autoAddUnreachableSites: true
		},
		{
			profileId: SmartProfileTypeBuiltinIds.SystemProxy,
			profileType: SmartProfileType.SystemProxy,
			profileTypeConfig: getSmartProfileTypeConfig(SmartProfileType.SystemProxy),
			profileName: api.i18n.getMessage('popupSystemProxy'),
			proxyRules: [],
			enabled: true,
			rulesSubscriptions: [],
			profileProxyServerId: null,
			autoPinSuccess: false,
			showAutoDialog: true,
			autoAddUnreachableSites: true
		},
	];
}

export function getSmartProfileTypeDefaultId(profileType: SmartProfileType) {
	switch (profileType) {
		case SmartProfileType.Direct:
			return SmartProfileTypeBuiltinIds.Direct;

		case SmartProfileType.SystemProxy:
			return SmartProfileTypeBuiltinIds.SystemProxy;

		case SmartProfileType.SmartRules:
			return SmartProfileTypeBuiltinIds.SmartRules;

		case SmartProfileType.AlwaysEnabledBypassRules:
			return SmartProfileTypeBuiltinIds.AlwaysEnabled;

		case SmartProfileType.IgnoreFailureRules:
			return SmartProfileTypeBuiltinIds.IgnoreRequestFailures;

		default:
			return '';
	}
}

export enum ThemeType {
	Auto,
	Light,
	Dark
}

export class UIOptions implements Cloneable, Comparable {
	public proxyServersGridRows: number = 10;
	public serverSubscriptionsGridRows: number = 10;
	public smartRulesGridRows: number = 10;
	public rulesSubscriptionsGridRows: number = 10;

	CopyFrom(source: any) {
		if (source['proxyServersGridRows'] != null)
			this.proxyServersGridRows = parseInt(source['proxyServersGridRows']) || 10;
		if (source['serverSubscriptionsGridRows'] != null)
			this.serverSubscriptionsGridRows = parseInt(source['serverSubscriptionsGridRows']) || 10;
		if (source['smartRulesGridRows'] != null)
			this.smartRulesGridRows = parseInt(source['smartRulesGridRows']) || 10;
		if (source['rulesSubscriptionsGridRows'] != null)
			this.rulesSubscriptionsGridRows = parseInt(source['rulesSubscriptionsGridRows']) || 10;
	}

	Equals(other: UIOptions): Boolean {
		function neq(thisVal: any, thatVal: any): boolean {
			/** Not equal. Treating empty string as null and undefined */
			if (thisVal === "")
				thisVal = null;
			if (thatVal === "")
				thatVal = null;
			// null and undefined are treated as same
			return thisVal != thatVal;
		}

		if (neq(other.proxyServersGridRows, this.proxyServersGridRows)) return false;
		if (neq(other.serverSubscriptionsGridRows, this.serverSubscriptionsGridRows)) return false;
		if (neq(other.smartRulesGridRows, this.smartRulesGridRows)) return false;
		if (neq(other.rulesSubscriptionsGridRows, this.rulesSubscriptionsGridRows)) return false;
		return true;
	}
}

export class GeneralOptions implements Cloneable, Comparable {
    public static defaultDarkThemeName: string = "themes-cosmo-dark";

    public syncSettings: boolean = false;
    public syncActiveProfile: boolean = true;
    public syncActiveProxy: boolean = true;
    public syncWebDavServerEnabled: boolean = false;
    public syncWebDavServerUrl: string = null;
    public syncWebDavBackupFilename: string = 'smartproxy_settings.json';
    public syncWebDavServerUser: string = null;
    public syncWebDavServerPassword: string = null;
    public detectRequestFailures: boolean = true;
    public displayFailedOnBadge: boolean = true;
    public displayAppliedProxyOnBadge: boolean = environment.initialConfig.displayTooltipOnBadge;
    public displayMatchedRuleOnBadge: boolean = environment.initialConfig.displayTooltipOnBadge;
    public refreshTabOnConfigChanges: boolean = false;
    public enableRating: boolean = false;
    // Proxy Test settings
    // Настройки проверки прокси через тестовые сайты
    public enableProxyTest: boolean = false;
    public testUrls: string[] = [];
    // English: Enable direct IP detection for proxy testing (sends real IP to external services)
    // Russian: Включить определение прямого IP для проверки прокси (отправляет реальный IP внешним сервисам)
    public enableDirectIpDetection: boolean = false;
    // English: Automatically replace proxy protocol when a working one is detected during testing
    // Russian: Автоматически заменять протокол прокси при обнаружении работающего во время тестирования
    // English: Disabled by default to avoid slowing down tests; user can enable if needed.
    // Russian: Отключён по умолчанию, чтобы не замедлять тесты; пользователь может включить при необходимости.
    public autoDetectProtocol: boolean = false;
    // English: Protocol switch mode: 'probable' or 'full'
    // Russian: Режим перебора протоколов: 'probable' или 'full'
    public protocolSwitchMode: 'probable' | 'full' = 'probable';
    public enableProxyPerOriginRule: boolean = false;
    public proxyPerOrigin: boolean = true;
	public deleteRuleWhenDisabledFromPopup: boolean = false;
    public activeIncognitoProfileId: string;
    public enableShortcuts: boolean = true;
    public shortcutNotification: boolean = true;
    public themeType: ThemeType = ThemeType.Auto;
    public themesLight: string;
    public themesLightCustomUrl: string;
    public themesDark: string = GeneralOptions.defaultDarkThemeName;
    public themesDarkCustomUrl: string;

	CopyFrom(source: any) {
		if (source['syncSettings'] != null) this.syncSettings = source['syncSettings'] == true ? true : false;
		if (source['syncProxyMode'] != null) this.syncActiveProfile = source['syncProxyMode'] == true ? true : false;
		if (source['syncActiveProfile'] != null) this.syncActiveProfile = source['syncActiveProfile'] == true ? true : false;
		if (source['syncActiveProxy'] != null) this.syncActiveProxy = source['syncActiveProxy'] == true ? true : false;

		if (source['syncWebDavServerEnabled'] != null) this.syncWebDavServerEnabled = source['syncWebDavServerEnabled'] == true ? true : false;
		this.syncWebDavServerUrl = source['syncWebDavServerUrl'];
		this.syncWebDavBackupFilename = source['syncWebDavBackupFilename'];
		this.syncWebDavServerUser = source['syncWebDavServerUser'];
		this.syncWebDavServerPassword = source['syncWebDavServerPassword'];

		if (source['detectRequestFailures'] != null)
			this.detectRequestFailures = source['detectRequestFailures'] == true ? true : false;
		if (source['displayFailedOnBadge'] != null)
			this.displayFailedOnBadge = source['displayFailedOnBadge'] == true ? true : false;
		if (source['displayAppliedProxyOnBadge'] != null)
			this.displayAppliedProxyOnBadge = source['displayAppliedProxyOnBadge'] == true ? true : false;
		if (source['displayMatchedRuleOnBadge'] != null)
			this.displayMatchedRuleOnBadge = source['displayMatchedRuleOnBadge'] == true ? true : false;
		if (source['refreshTabOnConfigChanges'] != null)
			this.refreshTabOnConfigChanges = source['refreshTabOnConfigChanges'] == true ? true : false;
		if (source['enableRating'] != null) this.enableRating = source['enableRating'] == true ? true : false;
		if (source['enableDirectIpDetection'] != null) this.enableDirectIpDetection = source['enableDirectIpDetection'] == true ? true : false;
		// English: Protocol auto-detection settings
		// Russian: Настройки автоопределения протокола
		if (source['autoDetectProtocol'] != null) {
			this.autoDetectProtocol = source['autoDetectProtocol'] === true;
		}
		if (source['protocolSwitchMode'] === 'full' || source['protocolSwitchMode'] === 'probable') {
			this.protocolSwitchMode = source['protocolSwitchMode'];
		}
		if (source['proxyPerOrigin'] != null) this.proxyPerOrigin = source['proxyPerOrigin'] == true ? true : false;
		if (source['enableShortcuts'] != null) this.enableShortcuts = source['enableShortcuts'] == true ? true : false;
		if (source['shortcutNotification'] != null)
			this.shortcutNotification = source['shortcutNotification'] == true ? true : false;
		this.themeType = source['themeType'] || ThemeType.Auto;
		this.themesLight = source['themesLight'];
		this.themesLightCustomUrl = source['themesLightCustomUrl'];
		this.themesDark = source['themesDark'];
		this.themesDarkCustomUrl = source['themesDarkCustomUrl'];
				// Proxy Test settings
		// Настройки проверки прокси через тестовые сайты
		this.enableProxyTest = !!source?.enableProxyTest;
		this.testUrls = Array.isArray(source?.testUrls) ? source.testUrls.slice(0, 5) : [];
	}

	Equals(other: GeneralOptions): Boolean {
		if (neq(other.syncSettings, this.syncSettings)) return false;
		if (neq(other.syncActiveProfile, this.syncActiveProfile)) return false;
		if (neq(other.syncActiveProxy, this.syncActiveProxy)) return false;
		if (neq(other.syncWebDavServerEnabled, this.syncWebDavServerEnabled)) return false;
		if (neq(other.syncWebDavServerUrl, this.syncWebDavServerUrl)) return false;
		if (neq(other.syncWebDavBackupFilename, this.syncWebDavBackupFilename)) return false;
		if (neq(other.syncWebDavServerUser, this.syncWebDavServerUser)) return false;
		if (neq(other.syncWebDavServerPassword, this.syncWebDavServerPassword)) return false;
		if (neq(other.detectRequestFailures, this.detectRequestFailures)) return false;
		if (neq(other.displayFailedOnBadge, this.displayFailedOnBadge)) return false;
		if (neq(other.displayAppliedProxyOnBadge, this.displayAppliedProxyOnBadge)) return false;
		if (neq(other.displayMatchedRuleOnBadge, this.displayMatchedRuleOnBadge)) return false;
		if (neq(other.refreshTabOnConfigChanges, this.refreshTabOnConfigChanges)) return false;
		if (neq(other.enableRating, this.enableRating)) return false;
		if (neq(other.enableDirectIpDetection, this.enableDirectIpDetection)) return false;
		// English: Protocol auto-detection settings
		// Russian: Настройки автоопределения протокола
		if (neq(other.autoDetectProtocol, this.autoDetectProtocol)) return false;
		if (neq(other.protocolSwitchMode, this.protocolSwitchMode)) return false;
		if (neq(other.proxyPerOrigin, this.proxyPerOrigin)) return false;
		if (neq(other.activeIncognitoProfileId, this.activeIncognitoProfileId)) return false;
		if (neq(other.enableShortcuts, this.enableShortcuts)) return false;
		if (neq(other.shortcutNotification, this.shortcutNotification)) return false;
		if (neq(other.themeType, this.themeType)) return false;
		if (neq(other.themesLight, this.themesLight)) return false;
		if (neq(other.themesLightCustomUrl, this.themesLightCustomUrl)) return false;
		if (neq(other.themesDark, this.themesDark)) return false;
		if (neq(other.themesDarkCustomUrl, this.themesDarkCustomUrl)) return false;

		function neq(thisVal: any, thatVal: any): boolean {
			/** Not equal. Treating empty string as null and undefined */
			if (thisVal === "")
				thisVal = null;
			if (thatVal === "")
				thatVal = null;
			// null and undefined are treated as same
			return thisVal != thatVal;
		}

		return true;
	}
}

interface Cloneable {
	CopyFrom(source: any): void;
}

interface Comparable {
	Equals(other: any): Boolean;
}

class ProxyServerConnectDetails {
	public order: number;
	public host: string;
	public port: number;
	public protocol: string;
	public username: string;
	public password: string;
	public proxyDNS: boolean;
}

export class ProxyServer extends ProxyServerConnectDetails implements Cloneable {
    public id: string;
    public name: string = '';
    public failoverTimeout: number;
    public countryCode: string;
    //public countryFlagEmoji: string;

    public rating: number = 0;

    // ProxyMust: priority (pin, star, null)
    // Приоритет (pin, star, null)
    public priority?: "pin" | "star" | null = null;

    public createdAt?: number; // English: Timestamp when proxy was added / Russian: Время добавления прокси

    constructor() {
        super();
        this.id = Utils.getNewUniqueIdString();
        this.order = 0;
    }

    CopyFrom(source: any) {
        this.id = source['id'] || Utils.getNewUniqueIdString();
        this.order = source['order'] ?? 0;
        this.name = source['name'];
        this.host = source['host'];
        this.port = +source['port'];

        // Normalize protocol to uppercase and validate
        // Нормализуем протокол в верхний регистр и проверяем валидность
        let protocol = source['protocol'];
        if (protocol) {
            protocol = protocol.toUpperCase();
            if (proxyServerProtocols.indexOf(protocol) !== -1) {
                this.protocol = protocol;
            } else {
                this.protocol = 'HTTP';
            }
        } else {
            this.protocol = 'HTTP';
        }

        this.username = source['username'];
        this.password = source['password'];
        if (source['proxyDNS'] != null) this.proxyDNS = source['proxyDNS'] == true ? true : false;
        this.failoverTimeout = source['failoverTimeout'] > 0 ? source['failoverTimeout'] : null;
        this.countryCode = source['countryCode'];
        this.rating = source['rating'] ?? 0;

        // Priority handling (pin / star / null)
        // Обработка приоритета (pin / star / null)
        const prio = source['priority'];
        this.priority = (prio === "pin" || prio === "star") ? prio : null;
		this.priority = source['priority'] ?? null;

        this.createdAt = source['createdAt'] ?? null;
    }

    public isValid(): boolean {
        if (!this.name || !this.protocol)
            return false;
        if (!this.port || this.port <= 0 || this.port > 65535)
            return false;
        if (!this.host || !Utils.isNotInternalHostName(this.host))
            return false;
        return true;
    }
}

export type RuleId = number;

export enum ProxyRuleSpecialProxyServer {
	DefaultGeneral = "-1",
	ProfileProxy = "-2",
	Block = "-3"
}

// English: Special proxy ID for the built-in "Block" proxy
// Russian: Специальный ID для встроенного прокси "Блокировка"
export const BLOCK_PROXY_ID = "block-proxy-builtin";

export class ProxyRule implements Cloneable {

	constructor() {
		this.ruleId = Utils.getNewUniqueIdNumber();
	}

	public ruleId: RuleId;
	public ruleType: ProxyRuleType;
	public hostName: string;
	public autoGeneratePattern: boolean;
	public rulePattern: string;
	public ruleRegex: string;
	public ruleExact: string;
	/** Used with DomainSubdomain */
	public ruleSearch: string;
	public proxy: ProxyServer;
	public proxyServerId: string;
	public enabled: boolean = true;
	public whiteList: boolean = false;
	public isAuto?: boolean = false;
    public enableProxyPerOrigin: boolean = false;
    // English: AutoProxy mode for this rule: 'auto' or 'manual' (default 'auto')
    // Russian: Режим AutoProxy для этого правила: 'auto' или 'manual' (по умолчанию 'auto')
    public mode: 'auto' | 'manual' = 'auto';

	
	get ruleTypeName(): string {
		return ProxyRuleType[this.ruleType];
	}

	get rule(): string {
		// why ruleType is string? converting to int
		switch (+this.ruleType) {
			case ProxyRuleType.MatchPatternHost:
			case ProxyRuleType.MatchPatternUrl:
				return this.rulePattern;

			case ProxyRuleType.RegexHost:
			case ProxyRuleType.RegexUrl:
				return this.ruleRegex;

			case ProxyRuleType.DomainSubdomain:
			case ProxyRuleType.DomainSubdomainAndPath:
			case ProxyRuleType.DomainAndPath:
			case ProxyRuleType.DomainExact:
			case ProxyRuleType.SearchUrl:
				return this.ruleSearch;

			case ProxyRuleType.Exact:
				return this.ruleExact;

			case ProxyRuleType.IpCidrNotation:
				{
					let ipAddress = this.ruleSearch;
					let prefixLength = this.rulePattern;
					return `${ipAddress}/${prefixLength}`;
				}
		}
		return '';
	}
	get proxyName(): string {
		if (this.whiteList) {
			return '-';
		}
		if (!this.proxy) {
			if (this.proxyServerId == ProxyRuleSpecialProxyServer.DefaultGeneral)
				return api.i18n.getMessage("settingsRulesProxyDefault");

			if (this.proxyServerId == ProxyRuleSpecialProxyServer.ProfileProxy)
				return api.i18n.getMessage("settingsRulesProxyFromProfile");

			if (this.proxyServerId == ProxyRuleSpecialProxyServer.Block)
				return api.i18n.getMessage("settingsRuleActionBlock");

			return null;
		}

		return this.proxy.name;
	}
	public static assignArray(rules: any[]): ProxyRule[] {
		if (!rules || !rules.length) return [];
		let result: ProxyRule[] = [];

		for (let index = 0; index < rules.length; index++) {
			const r = rules[index];
			let rule = new ProxyRule();

			Object.assign(rule, r);
			result.push(rule);
		}

		return result;
	}

	CopyFrom(source: any) {
		this.ruleType = source['ruleType'];
		if (source['ruleType'] == null)
			this.ruleType = ProxyRuleType.DomainSubdomain;
		this.hostName = source['hostName'] || '';
		this.autoGeneratePattern = source['autoGeneratePattern'] == true ? true : false;
		this.rulePattern = source['rulePattern'];
		this.ruleRegex = source['ruleRegex'];
		this.ruleExact = source['ruleExact'];
		this.ruleSearch = source['ruleSearch'];
		this.proxy = source['proxy'];
		this.proxyServerId = source['proxyServerId'];
		if (source['enabled'] != null)
			this.enabled = source['enabled'] == true ? true : false;

		if (source['whiteList'] != null)
			this.whiteList = source['whiteList'] == true ? true : false;
		
		if (source['isAuto'] != null) this.isAuto = source['isAuto'] == true ? true : false;

		if (this.proxy) {
			if (!Settings.validateProxyServer(this.proxy, false, true).success) {
				this.proxy = null;
			}
		}

		// supporting old version
		if (source['pattern']) {
			this.rulePattern = source['rulePattern'] || source['pattern'];
			this.hostName = source['hostName'] || source['source'] || source['sourceDomain'];
			if (this.ruleType == null)
				this.ruleType = ProxyRuleType.MatchPatternUrl;
			if (this.autoGeneratePattern == null)
				this.autoGeneratePattern = false;
		}
	}

	public isValid(): boolean {
		if (!this.rule || this.ruleType == null)
			return false;

		if ((!this.ruleSearch || !this.hostName) &&
			(this.ruleType == ProxyRuleType.DomainSubdomain ||
				this.ruleType == ProxyRuleType.DomainAndPath ||
				this.ruleType == ProxyRuleType.DomainSubdomainAndPath ||
				this.ruleType == ProxyRuleType.DomainExact ||
				this.ruleType == ProxyRuleType.SearchUrl)) {
			return false;
		}
		if (!this.ruleExact && this.ruleType == ProxyRuleType.Exact) {
			return false;
		}
		if (!this.ruleRegex && (this.ruleType == ProxyRuleType.RegexHost || this.ruleType == ProxyRuleType.RegexUrl)) {
			return false;
		}
		if (!this.rulePattern && (this.ruleType == ProxyRuleType.MatchPatternHost || this.ruleType == ProxyRuleType.MatchPatternUrl)) {
			return false;
		}
		return true;
	}
}

export class CompiledProxyRule {
	public ruleId: RuleId;
	public compiledRuleType: CompiledProxyRuleType;
	public compiledRuleSource: CompiledProxyRuleSource;
	public regex?: RegExp;
	public search?: string;
	public hostName: string;
	public proxy: ProxyServer;
	public whiteList: boolean = false;
	public enableProxyPerOrigin: boolean = false;

	/**getting rule text */
	get ruleText(): string {
		// why ruleType is string? converting to int
		switch (+this.compiledRuleType) {
			case CompiledProxyRuleType.RegexHost:
			case CompiledProxyRuleType.RegexUrl:
				return this.regex.toString();

			case CompiledProxyRuleType.Exact:
			case CompiledProxyRuleType.SearchUrl:
			case CompiledProxyRuleType.SearchDomain:
			case CompiledProxyRuleType.SearchDomainAndPath:
			case CompiledProxyRuleType.SearchDomainSubdomain:
			case CompiledProxyRuleType.SearchDomainSubdomainAndPath:
				return this.search;
		}
		return '';
	}
}

export class ImportedProxyRule {
	/** Imported from subscription or UI */
	public name: string;
	public regex?: string;
	public search?: string;
	public importedRuleType?: CompiledProxyRuleType;

	public getProxyRule(): ProxyRule {
		let newRule = new ProxyRule();
		newRule.enabled = true;
		newRule.hostName = this.name || this.search;
		newRule.ruleRegex = this.regex;
		newRule.ruleSearch = this.search;
		newRule.ruleType =
			convertCompiledToProxyRuleType(this.importedRuleType) ?? (this.regex ? ProxyRuleType.RegexUrl : ProxyRuleType.DomainSubdomain);
		return newRule;
	}

	public getSubscriptionProxyRule(): SubscriptionProxyRule {
		return this;
	}
}

export type SubscriptionProxyRule = ImportedProxyRule;

/** Compiled rules, separated by type and Priority */
export class CompiledProxyRulesInfo {
	/** User defined whitelist rules. P2 */
	public WhitelistRules: CompiledProxyRule[] = [];
	/** User defined rules. P1 */
	public Rules: CompiledProxyRule[] = [];
	/** Subscription whitelist rules. P3  */
	public WhitelistSubscriptionRules: CompiledProxyRule[] = [];
	/** Subscription rules. P4 */
	public SubscriptionRules: CompiledProxyRule[] = [];
}
export enum CompiledProxyRulesMatchedSource {
	WhitelistRules,
	Rules,
	WhitelistSubscriptionRules,
	SubscriptionRules
}

export enum SpecialRequestApplyProxyMode {
	NoProxy,
	CurrentProxy,
	SelectedProxy,
}
export enum ProxyServerSubscriptionFormat {
    PlainText,
    Json,
    Csv,
}

export class SubscriptionStats {
	lastSuccessDate: string;
	lastTryDate: string;
	lastTryIsoDate: string;
	lastStatus: boolean;
	lastStatusMessage: string;
	lastStatusProxyServerName: string;

	public static updateStats(stats: SubscriptionStats, success: boolean, errorResult?: any) {
		let now = new Date();
		stats.lastTryIsoDate = now.toISOString();
		stats.lastTryDate = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
		if (success) {
			stats.lastStatus = true;
			stats.lastStatusMessage = null;
			stats.lastSuccessDate = stats.lastTryDate;
		}
		else {
			stats.lastStatus = false;
			stats.lastStatusMessage = errorResult?.message ?? errorResult?.toString();
		}
		stats.lastStatusProxyServerName = Settings.active?.currentProxyServer?.name;
	}
	public static ToString(stats: SubscriptionStats): string {
		let status = `Status: ${stats.lastStatus ? 'Success' : 'Fail'}`;
		if (stats.lastStatus) {
			status = api.i18n.getMessage("settingsSubscriptionStatsStatusSuccess");
		}
		else {
			status = api.i18n.getMessage("settingsSubscriptionStatsStatusFail");
		}

		if (!stats.lastStatus) {
			if (stats.lastTryDate) {
				status += `\r\n${api.i18n.getMessage("settingsSubscriptionStatsLastTry")} ${stats.lastTryDate}`
			}
			else {
				status += `\r\n${api.i18n.getMessage("settingsSubscriptionStatsLastTry")} -`
			}
			if (stats.lastStatusMessage) {
				status += `\r\n${api.i18n.getMessage("settingsSubscriptionStatsMessage")} ${stats.lastStatusMessage}`
			}
		}
		if (stats.lastStatusProxyServerName) {
			status += `\r\n${api.i18n.getMessage("settingsRulesGridColProxy")}: ${stats.lastStatusProxyServerName}`
		}
		if (stats.lastSuccessDate) {
			status += `\r\n${api.i18n.getMessage("settingsSubscriptionStatsLastSuccess")} ${stats.lastSuccessDate}`
		}
		return status;
	}
}
export class ProxyServerFromSubscription extends ProxyServer {
	public subscriptionName: string;
}

export class ProxyServerSubscription implements Cloneable {
	public name: string;
	public url: string;
	public enabled: boolean = false;

	// same as proxyServerProtocols
	public proxyProtocol: string = null;

	// in minutes
	public refreshRate: number = 0;

	// types stored in proxyServerSubscriptionObfuscate
	public obfuscation: string;

	public format: ProxyServerSubscriptionFormat;

	// number of proxies in the list
	public totalCount: number = 0;

	public username: string;
	public password: string;
	// the loaded proxies
	public proxies: ProxyServer[];

	public applyProxy: SpecialRequestApplyProxyMode;

	public stats: SubscriptionStats;

	// Auto-detection settings / Настройки автоопределения
	public autoDetectProtocol: boolean = true;
	public debugMode: boolean = false;
	public csvFormat: 'auto' | 'semicolon' | 'comma' = 'auto';

	CopyFrom(source: any) {
		if (source['name'] != null) this.name = source['name'] || '';
		if (source['url'] != null) this.url = source['url'] || '';
		if (source['enabled'] != null) this.enabled = source['enabled'] == true ? true : false;
		if (source['proxyProtocol'] != null) this.proxyProtocol = source['proxyProtocol'] || null;
		this.refreshRate = +source['refreshRate'] > 0 ? +source['refreshRate'] : 0;
		if (source['obfuscation'] != null) this.obfuscation = source['obfuscation'] || null;
		this.format = ProxyServerSubscriptionFormat.PlainText;
		if (source['format'] != null)
			if (+source['format'] in ProxyServerSubscriptionFormat) {
				this.format = +source['format'];
			}
		this.totalCount = +source['totalCount'];
		if (source['username'] != null) this.username = source['username'] || '';
		if (source['password'] != null) this.password = source['password'] || '';

		this.applyProxy = SpecialRequestApplyProxyMode.CurrentProxy;
		if (source['applyProxy'] != null)
			if (+source['applyProxy'] in SpecialRequestApplyProxyMode) {
				this.applyProxy = +source['applyProxy'];
			}
		this.proxies = [];
		if (source['proxies'] != null && Array.isArray(source['proxies']))
			for (const sourceServer of source['proxies']) {
				var server = new ProxyServer();
				server.CopyFrom(sourceServer);

				if (server.isValid())
					this.proxies.push(server);
			}
		this.stats = new SubscriptionStats();
		if (source.stats) {
			Object.assign(this.stats, source.stats);
		}
		
		// Load auto-detection settings / Загрузка настроек автоопределения
		if (source['autoDetectProtocol'] != null) {
			this.autoDetectProtocol = source['autoDetectProtocol'] === true;
		}
		if (source['debugMode'] != null) {
			this.debugMode = source['debugMode'] === true;
		}
		if (source['csvFormat'] != null) {
			const format = source['csvFormat'];
			if (format === 'semicolon' || format === 'comma') {
				this.csvFormat = format;
			} else {
				this.csvFormat = 'auto';
			}
		}
	}

	public isValid(): boolean {
		if (!this.name || !this.url || !this.proxyProtocol || !this.format)
			return false;
		return true;
	}
}

export enum ExternalRulesFormat {
	AutoProxy,
	SwitchyOmega,
	Universal, 
	// English: Extract domains from any text (ignore syntax)
	// Russian: Извлечь домены из любого текста (игнорировать синтаксис)
}

export interface IExternalRulesConfig {
	url: string;

	username: string;
	password: string;

	// types stored in proxyServerSubscriptionObfuscate
	obfuscation: string;

	format: ExternalRulesFormat;

	applyProxy: SpecialRequestApplyProxyMode;
}

export class ProxyRulesSubscription implements IExternalRulesConfig {
	constructor() {
		this.id = Utils.getNewUniqueIdString();
	}
	public id: string;
	public name: string;
	public url: string;
	public enabled: boolean = false;

	// in minutes
	public refreshRate: number = 0;

	// types stored in proxyServerSubscriptionObfuscate
	public obfuscation: string;

	public format: ExternalRulesFormat;

	// number of rules in the list
	public totalCount: number = 0;

	public username: string;
	public password: string;

	// the loaded rules
	public proxyRules: SubscriptionProxyRule[];
	public whitelistRules: SubscriptionProxyRule[];

	public applyProxy: SpecialRequestApplyProxyMode;

	public stats: SubscriptionStats;

	CopyFrom(source: any) {
		if (source['name'] != null) this.name = source['name'] || '';
		if (source['url'] != null) this.url = source['url'] || '';
		if (source['enabled'] != null) this.enabled = source['enabled'] == true ? true : false;

		this.refreshRate = +source['refreshRate'] > 0 ? +source['refreshRate'] : 0;
		if (source['obfuscation'] != null) this.obfuscation = source['obfuscation'] || null;
		this.format = ExternalRulesFormat.AutoProxy;
		if (source['format'] != null)
			if (+source['format'] in ProxyServerSubscriptionFormat) {
				this.format = +source['format'];
			}
		this.totalCount = +source['totalCount'];
		if (source['username'] != null) this.username = source['username'] || '';
		if (source['password'] != null) this.password = source['password'] || '';

		this.applyProxy = SpecialRequestApplyProxyMode.CurrentProxy;
		if (source['applyProxy'] != null)
			if (+source['applyProxy'] in SpecialRequestApplyProxyMode) {
				this.applyProxy = +source['applyProxy'];
			}
		this.proxyRules = [];
		this.whitelistRules = [];
		if (source['proxyRules'] != null && Array.isArray(source['proxyRules']))
			this.proxyRules = source['proxyRules'];
		if (source['whitelistRules'] != null && Array.isArray(source['whitelistRules']))
			this.whitelistRules = source['whitelistRules'];
		this.stats = new SubscriptionStats();
		if (source.stats) {
			Object.assign(this.stats, source.stats);
		}
	}

	public isValid(): boolean {
		if (!this.name || !this.url)
			return false;

		return true;
	}
}

export class ProxyRulesImportFromUI implements IExternalRulesConfig {
	url: string;
	username: string;
	password: string;
	obfuscation: string;
	format: ExternalRulesFormat;
	applyProxy: SpecialRequestApplyProxyMode;

	constructor() {
		this.url = null;
		this.obfuscation = null;
		this.format = ExternalRulesFormat.AutoProxy;
		this.applyProxy = SpecialRequestApplyProxyMode.CurrentProxy;
		this.username = null;
		this.password = null;
	}
}

export class UpdateInfo {
	public updateIsAvailable: boolean = false;
	public isBrowserSpecific: boolean = false;
	public version: string;
	public versionName: string;
	public downloadPage: URL;
}

/*
 * This file is part of SmartProxy (ProxyMust fork)
 * Copyright (C) 2025-2026 nana-xakep
 */
 
 // ========================
// English: Test log step types for logging proxy test progress
// Russian: Типы шагов лога для логирования прогресса тестирования прокси
// ========================

/**
 * English: Types of log steps for proxy testing progress
 * Russian: Типы шагов лога для прогресса тестирования прокси
 */
export type TestLogStepType = 
    | 'info'           // English: Informational message / Russian: Информационное сообщение
    | 'direct-ip'      // English: Direct IP detection result / Russian: Результат определения прямого IP
    | 'start'          // English: Proxy test started / Russian: Начало теста прокси
    | 'ip'             // English: IP detection result / Russian: Результат определения IP
    | 'page'           // English: Page loading result / Russian: Результат загрузки страницы
    | 'status'         // English: Final status / Russian: Финальный статус
    | 'next'           // English: Moving to next proxy / Russian: Переход к следующему прокси
    | 'stop'           // English: Test stopped / Russian: Тест остановлен
    | 'complete'       // English: Test completed / Russian: Тест завершён
    | 'protocol-retry' // English: Protocol retry attempt / Russian: Попытка смены протокола
    | 'protocol-changed' // English: Protocol changed / Russian: Протокол изменён
    | 'readiness';     // English: Readiness check results / Russian: Результаты проверки готовности

// ========================
// ProxyMust additions: auto‑test statuses, priorities, manual sites, settings
// ========================

/**
 * Auto‑test status for a specific proxy and site
 * Статус автотеста для конкретного прокси и сайта
 */
export interface AutoStatusEntry {
    // English: status can be 'success' (direct success ✅), 'indirect' (indirect success ☑️), 'ip-only' (IP received but page not loaded ❔), 'fail' (⛔), or null (no data)
    // Russian: статус может быть 'success' (прямой успех ✅), 'indirect' (косвенный успех ☑️), 'ip-only' (IP получен, страница не загружена ❔), 'fail' (⛔) или null (нет данных)
    status: 'success' | 'indirect' | 'ip-only' | 'fail' | null;
    timestamp: number;                    // last test time in ms since epoch
}

/**
 * Map: proxyId -> site -> AutoStatusEntry
 * Хранилище результатов автотестов
 */
export interface AutoStatusMap {
    [proxyId: string]: {
        [site: string]: AutoStatusEntry;
    };
}

/**
 * Manually added sites for testing (not from Smart Profiles)
 * Ручной список сайтов для проверки (не из Smart Profiles)
 */
export type ManualSites = string[];

/**
 * Extension settings for ProxyMust features
 * Настройки расширения для функций ProxyMust
 */
export interface ProxyMustSettings {
    /** Hours after which auto‑status data is considered stale (default 6) */
    staleHours: number;
}
/**
 * User preferences that are not synced across browsers
 * Пользовательские настройки, не синхронизируемые между браузерами
 */
export interface UserPreferences {
    /** Hours after which auto‑status data is considered stale (default 6) */
    staleHours: number;
    /** Manually added sites for testing (not from Smart Profiles) */
    manualSites: string[];
    /** English: Temporarily pinned proxies per site (session-only, cleared on browser restart)
        Russian: Временно закреплённые прокси для сайтов (на сессию, сбрасываются при перезапуске браузера) */
    pinnedProxies?: { [site: string]: string };
}
// Adding fields to SettingsConfig (will be merged in Settings.ts)
// Эти поля будут добавлены в класс SettingsConfig (см. Settings.ts)

export enum TabProxyStatus {
	None,
	Proxified,
	Whitelisted
}