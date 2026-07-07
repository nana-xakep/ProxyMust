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

import { AutoStatusMap } from "./definitions";

/**
 * English: Normalizes site string by removing protocol (http://, https://) and trailing slash.
 * Russian: Нормализует строку сайта, удаляя протокол (http://, https://) и завершающий слэш.
 */
export function normalizeSite(site: string): string {
    if (!site) return "";
    let normalized = site.trim().toLowerCase();
    normalized = normalized.replace(/^https?:\/\//, '');
    normalized = normalized.replace(/\/$/, '');
    return normalized;
}

/**
 * English: Available status types with associated display symbol and CSS class.
 * Russian: Доступные типы статусов с соответствующим символом и CSS-классом.
 */
export type ProxyStatusType = 
    | "direct-success"    // ✅ green - fresh success for this site
    | "direct-fail"       // ⛔ red - fresh failure for this site (now same as fail)
    | "indirect-success"  // ☑️ blue - stale success or success on other sites
    | "indirect-fail"     // ⛔ gray - stale failure or only failures on other sites (now same as fail)
    | "ip-only"           // ❔ white question - IP received, page not loaded
    | "unknown";          // ❓ gray - no data

/**
 * English: Structure returned by getProxyStatus.
 * Russian: Структура, возвращаемая getProxyStatus.
 */
export interface ProxyStatusInfo {
    type: ProxyStatusType;
    symbol: string;      // English: Display symbol (✅, ☑️, ⛔, ❓) / Russian: Символ для отображения
    cssClass: string;    // English: CSS class for coloring / Russian: CSS-класс для окрашивания
    weight: number;      // English: Sorting weight (higher = better) / Russian: Вес для сортировки (выше = лучше)
}

/**
 * English: Determines proxy status for a specific site based on autoStatus and stale hours.
 * Russian: Определяет статус прокси для конкретного сайта на основе autoStatus и времени устаревания.
 * 
 * @param proxyId - ID of the proxy / ID прокси
 * @param site - Site domain (e.g., "youtube.com") / Сайт (например, "youtube.com")
 * @param autoStatus - AutoStatusMap from settings / Карта автостатусов из настроек
 * @param staleHours - Hours after which data is considered stale / Часы, после которых данные считаются устаревшими
 * @returns ProxyStatusInfo object / Объект с информацией о статусе
 */
export function getProxyStatus(
    proxyId: string,
    site: string,
    autoStatus: AutoStatusMap | undefined,
    staleHours: number = 6
): ProxyStatusInfo {
    // English: Normalize site key for consistent lookup
    // Russian: Нормализуем ключ сайта для единообразного поиска
    const normalizedSite = normalizeSite(site);
    
//    console.log(`[statusUtils] getProxyStatus: proxyId=${proxyId}, site=${normalizedSite}, autoStatus keys:`, Object.keys(autoStatus || {}));

    // English: If no autoStatus data for this proxy, return unknown
    // Russian: Если нет данных autoStatus для этого прокси, возвращаем unknown
    if (!autoStatus || !autoStatus[proxyId]) {
//        console.log(`[statusUtils] Нет данных для прокси ${proxyId}, возвращаем unknown`);
        return { type: "unknown", symbol: "❓", cssClass: "status-unknown", weight: 3 };
    }

    const proxyData = autoStatus[proxyId];
    const now = Date.now();
    const staleMs = staleHours * 3600000;

    // English: Check direct entry for the requested site (using normalized key)
    // Russian: Проверяем прямую запись для запрошенного сайта (используя нормализованный ключ)
    const directEntry = proxyData[normalizedSite];
    const isDirectFresh = directEntry && (now - directEntry.timestamp) < staleMs;

    if (directEntry) {
        if (isDirectFresh) {
            // English: Fresh success, indirect, or failure for this exact site
            // Russian: Свежий успех, косвенный успех или провал для этого сайта
            if (directEntry.status === "success") {
                return { type: "direct-success", symbol: "✅", cssClass: "status-direct-success", weight: 5 };
            } else if (directEntry.status === "indirect") {
                return { type: "indirect-success", symbol: "☑️", cssClass: "status-indirect-success", weight: 4 };
            } else if (directEntry.status === "ip-only") {
                return { type: "ip-only", symbol: "❔", cssClass: "status-ip-only", weight: 3 };
            } else {
                return { type: "direct-fail", symbol: "⛔", cssClass: "status-direct-fail", weight: 1 };
            }
        } else {
            // English: Stale direct entry - use indirect logic
            // Russian: Устаревшая прямая запись - используем косвенную логику
            // Fall through to indirect checks
        }
    }

    // English: Indirect check: look at all other sites for this proxy
    // Russian: Косвенная проверка: смотрим все другие сайты для этого прокси
    let hasFreshSuccess = false;
    let hasFreshIpOnly = false;
    let hasFreshFail = false;
    let hasAnyStaleSuccess = false;
    let hasAnyStaleIpOnly = false;
    let hasAnyStaleFail = false;

    for (const otherSite in proxyData) {
        if (otherSite === normalizedSite) continue; // English: Skip the requested site / Пропускаем запрошенный сайт
        const entry = proxyData[otherSite];
        const isFresh = (now - entry.timestamp) < staleMs;
        // English: Treat "indirect" as success for indirect checks
        // Russian: Считаем "indirect" успехом для косвенных проверок
        if (entry.status === "success" || entry.status === "indirect") {
            if (isFresh) hasFreshSuccess = true;
            else hasAnyStaleSuccess = true;
        } else if (entry.status === "ip-only") {
            if (isFresh) hasFreshIpOnly = true;
            else hasAnyStaleIpOnly = true;
        } else if (entry.status === "fail") {
            if (isFresh) hasFreshFail = true;
            else hasAnyStaleFail = true;
        }
    }

    // English: Priority 1: at least one fresh success on another site -> indirect success
    // Russian: Приоритет 1: хотя бы один свежий успех на другом сайте -> косвенный успех
    if (hasFreshSuccess) {
        return { type: "indirect-success", symbol: "☑️", cssClass: "status-indirect-success", weight: 4 };
    }

    // English: Priority 2: at least one fresh ip-only on another site -> ip-only (unknown)
    // Russian: Приоритет 2: хотя бы один свежий ip-only на другом сайте -> ip-only (неизвестно)
    if (hasFreshIpOnly) {
        console.log(`[statusUtils] Возвращаем ip-only (свежий ip-only на другом сайте) для прокси ${proxyId}`);
        return { type: "ip-only", symbol: "❔", cssClass: "status-ip-only", weight: 3 };
    }

    // English: Priority 3: no fresh success or ip-only, but have fresh fail -> indirect fail
    // Russian: Приоритет 3: нет свежих успехов или ip-only, но есть свежий провал -> косвенный провал
    if (hasFreshFail) {
        return { type: "indirect-fail", symbol: "⛔", cssClass: "status-indirect-fail", weight: 1 };
    }

    // English: Priority 4: only stale entries - prefer success over ip-only over fail
    // Russian: Приоритет 4: только устаревшие записи - предпочитаем успех, затем ip-only, затем провал
    if (hasAnyStaleSuccess) {
        return { type: "indirect-success", symbol: "☑️", cssClass: "status-indirect-success", weight: 4 };
    }
    if (hasAnyStaleIpOnly) {
        return { type: "ip-only", symbol: "❔", cssClass: "status-ip-only", weight: 3 };
    }
    if (hasAnyStaleFail) {
        return { type: "indirect-fail", symbol: "⛔", cssClass: "status-indirect-fail", weight: 1 };
    }

    // English: If we have a direct stale entry but no other sites, treat as indirect based on its status
    // Russian: Если есть прямая устаревшая запись, но нет других сайтов, рассматриваем её как косвенную
    if (directEntry) {
        if (directEntry.status === "success" || directEntry.status === "indirect") {
            return { type: "indirect-success", symbol: "☑️", cssClass: "status-indirect-success", weight: 4 };
        } else if (directEntry.status === "ip-only") {
            return { type: "ip-only", symbol: "❔", cssClass: "status-ip-only", weight: 3 };
        } else {
            return { type: "indirect-fail", symbol: "⛔", cssClass: "status-indirect-fail", weight: 1 };
        }
    }

    // English: No data at all
    // Russian: Вообще нет данных
    console.log(`[statusUtils] Нет данных для прокси ${proxyId}, возвращаем unknown`);
    return { type: "unknown", symbol: "❓", cssClass: "status-unknown", weight: 2 };
}

/**
 * English: Returns sorting weight for a proxy status (higher = better).
 * Russian: Возвращает вес сортировки для статуса прокси (выше = лучше).
 * @param statusInfo ProxyStatusInfo object / Объект статуса
 * @returns number weight / числовой вес
 */
export function getStatusWeight(statusInfo: ProxyStatusInfo): number {
    return statusInfo.weight;
}