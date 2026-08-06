// src/core/ResultSaver.ts

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

import { Settings } from "./Settings";
import { SettingsOperation } from "./SettingsOperation";
import { api } from "../lib/environment";
import { AutoStatusService } from './AutoStatusService';
import { SmartProfileType, ProxyRule, ProxyRuleType } from './definitions';
import { ProxyEngine } from './ProxyEngine';
import { Core } from "./Core";

// ==================== Types ====================

export type ProxyStatusType = "success" | "indirect" | "ip-only" | "fail";

export interface ProxyResult {
    alive: boolean;          // true if proxy responded (direct or indirect)
    exact: boolean;          // true if exact success (200 OK or favicon)
    error?: string;          // error message if any
    ip?: string | null;      // IP detected through proxy, if any
}

export interface CycleProxyResult {
    status: ProxyStatusType; // already determined by cycle checker
    error?: string;
}

// ==================== Core functions ====================

/**
 * English: Determines the final status from a test result.
 * Russian: Определяет финальный статус из результата теста.
 */
export function determineStatus(result: ProxyResult): ProxyStatusType {
    if (result.alive && result.exact) {
        return "success";
    } else if (result.alive && !result.exact) {
        return "indirect";
    } else {
        return "fail";
    }
}

/**
 * English: Saves the test result for a proxy and site.
 * Russian: Сохраняет результат теста для прокси и сайта.
 */
export async function saveResult(
    proxyId: string,
    site: string,
    status: ProxyStatusType,
    timestamp: number = Date.now()
): Promise<void> {
    // Normalize site (remove protocol and trailing slash)
    const normalizedSite = site.replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log(`[ResultSaver] Сохранение результата для прокси ${proxyId}, сайт ${normalizedSite}, статус: ${status}`);

    // Update rating (skip for 'ip-only' – unknown status)
    // Обновляем рейтинг (пропускаем для 'ip-only' – неизвестный статус)
    if (status === "success" || status === "indirect") {
        SettingsOperation.updateProxyRating(proxyId, 1);
    } else if (status === "fail") {
        SettingsOperation.updateProxyRating(proxyId, -1);
    }
    // 'ip-only' – no rating change

    // Update autoStatus via central service
    const statusService = AutoStatusService.getInstance();
    statusService.setStatus(proxyId, normalizedSite, status, timestamp);
	
    // English: Auto-create rule for SmartRules profile regardless of active profile.
    // Russian: Авто-создание правила в профиле SmartRules независимо от активного профиля.
    if (status === "success" || status === "indirect" || status === "ip-only") {
                // Find the SmartRules profile (it's built-in, should always exist)
                const smartRulesProfile = Settings.current?.proxyProfiles?.find(p => p.profileType === SmartProfileType.SmartRules);
                if (!smartRulesProfile) {
                    console.warn("[ResultSaver] SmartRules profile not found, cannot auto-create rule");
                } else {
                    // English: Normalize site using Core.normalizeSite to ensure consistency (removes www.)
                    // Russian: Нормализуем сайт через Core.normalizeSite для единообразия (удаляет www.)
                    const coreNormalizedSite = Core.normalizeSite(normalizedSite);
                    const siteToUse = coreNormalizedSite || normalizedSite;
                    
                    // Check if rule already exists for this site (use normalized host)
                    const existingRule = smartRulesProfile.proxyRules?.find(r => r.hostName === siteToUse);
                    if (!existingRule) {
                        // Create new rule (disabled by default)
                        const newRule = new ProxyRule();
                        newRule.ruleType = ProxyRuleType.DomainSubdomain;
                        newRule.hostName = siteToUse;
                        newRule.ruleSearch = siteToUse;
                        newRule.enabled = false; // disabled until auto mode is active
                        newRule.whiteList = false;
                        newRule.proxyServerId = null;
                        newRule.autoGeneratePattern = true;
                        newRule.isAuto = true;
                        if (!smartRulesProfile.proxyRules) smartRulesProfile.proxyRules = [];
                        smartRulesProfile.proxyRules.push(newRule);
                        // Save profile and apply changes immediately
                        SettingsOperation.saveSmartProfiles();
                        SettingsOperation.saveAllSync(false);
                        // English: Update active settings and notify ProxyEngine so the rule is compiled immediately
                        // Russian: Обновляем активные настройки и уведомляем ProxyEngine, чтобы правило скомпилировалось сразу
                        Settings.updateActiveSettings();
                        ProxyEngine.notifyProxyRulesChanged();
                        console.log(`[ResultSaver] Auto-created rule for site ${siteToUse} (disabled by default)`);
                    }

            // Now, if active profile is SmartRules and auto mode is enabled, enable the rule
            const activeProfile = Settings.active?.activeProfile;
            if (activeProfile && activeProfile.profileType === SmartProfileType.SmartRules) {
                const profile = Settings.current?.proxyProfiles?.find(p => p.profileId === activeProfile.profileId);
                if (profile && (profile as any).selectionMode === 'auto') {
                    // Find the rule and enable it
                    const rule = smartRulesProfile.proxyRules?.find(r => r.hostName === normalizedSite);
                    if (rule && !rule.enabled) {
                        rule.enabled = true;
                        SettingsOperation.saveSmartProfiles();
                        SettingsOperation.saveAllSync(false);
                        // English: Also update active settings and notify ProxyEngine
                        // Russian: Также обновляем активные настройки и уведомляем ProxyEngine
                        Settings.updateActiveSettings();
                        ProxyEngine.notifyProxyRulesChanged();
                        console.log(`[ResultSaver] Enabled auto-created rule for site ${normalizedSite} (auto mode active)`);
                    }
                }
            }
        }
    }

    console.log(`[ResultSaver] autoStatus после сохранения:`, JSON.stringify(Settings.current.autoStatus[proxyId]));

    // Save to storage (local only, sync will happen later)
    await SettingsOperation.saveAllLocal(true);
    SettingsOperation.saveAllSync(false);

    // Notify popup if open
    api.runtime.sendMessage({
        command: "UPDATE_AUTO_STATUS",
        proxyId: proxyId,
        site: normalizedSite,
        status: status,
        timestamp: timestamp
    }).catch(() => { /* ignore */ });
}

/**
 * English: Sends a progress update message to the UI.
 * Russian: Отправляет сообщение о прогрессе в интерфейс.
 */
export function sendProgress(
    proxyId: string,
    proxyHost: string,
    site: string,
    status: ProxyStatusType,
    completed: number,
    total: number,
    testType: string = "standard"
): void {
    const alive = status === "success" || status === "indirect";
    api.runtime.sendMessage({
        command: "CHECK_PROGRESS",
        completed: completed,
        total: total,
        proxyHost: proxyHost,
        alive: alive,
        proxyId: proxyId,
        site: site,
        statusType: status,
        testType: testType
    });
}