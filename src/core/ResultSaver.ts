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

    // Update autoStatus
    if (!Settings.current.autoStatus) Settings.current.autoStatus = {};
    if (!Settings.current.autoStatus[proxyId]) Settings.current.autoStatus[proxyId] = {};
    Settings.current.autoStatus[proxyId][normalizedSite] = {
        status: status,
        timestamp: timestamp
    };

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