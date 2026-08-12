// src/core/ProxySelector.ts
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

import { Settings } from './Settings';
import { ProxyServer, AutoStatusMap } from './definitions';
import { getProxyStatus } from './statusUtils';
import { AutoStatusService } from './AutoStatusService';
import { SettingsOperation } from './SettingsOperation';


/**
 * English: Options for selecting a proxy.
 * Russian: Опции для выбора прокси.
 */
export interface SelectorOptions {
    /** English: Exclude these proxy IDs globally. Russian: Исключить эти ID прокси глобально. */
    excludedProxyIds?: string[];
    /** English: Exclude these proxy IDs for the specific site. Russian: Исключить эти ID прокси для конкретного сайта. */
    excludedForSite?: string[];
    /** English: Override stale hours (default from userPrefs). Russian: Переопределить время устаревания (по умолчанию из userPrefs). */
    staleHours?: number;
    /** English: Auto-status map (optional, for UI use). Russian: Карта автостатусов (опционально, для UI). */
    autoStatus?: AutoStatusMap;
    /** English: Optional list of proxies (for UI, to avoid using global Settings). Russian: Опциональный список прокси (для UI, чтобы не использовать глобальные Settings). */
    proxyList?: ProxyServer[];
}

/**
 * English: Result of selection.
 * Russian: Результат выбора.
 */
export interface SelectorResult {
    proxy: ProxyServer | null;
    reason: 'success' | 'indirect' | 'ip-only' | 'fail' | 'unknown' | 'excluded' | 'none';
}

/**
 * English: Core selector for choosing the best proxy for a site,
 * based on statuses, priority, rating, and freshness.
 * Russian: Основной селектор для выбора лучшего прокси для сайта,
 * на основе статусов, приоритета, рейтинга и свежести.
 */
export class ProxySelector {
    /**
     * English: Gets the best proxy for a given site.
     * Russian: Возвращает лучший прокси для заданного сайта.
     */
    public static getBestProxyForSite(
        site: string,
        options?: SelectorOptions
    ): SelectorResult {
        console.log(`[ProxySelector] Поиск лучшего прокси для сайта "${site}"`);

        // English: Check if there is a pinned proxy for this site
        // Russian: Проверяем, есть ли закреплённый прокси для этого сайта
        const statusService = AutoStatusService.getInstance();
        const pinnedProxyId = statusService.getPinnedProxy(site);
        if (pinnedProxyId) {
            const pinnedProxy = SettingsOperation.findProxyServerById(pinnedProxyId);
            if (pinnedProxy) {
                const autoStatus = options?.autoStatus ?? Settings.current?.autoStatus ?? {};
                const staleHours = options?.staleHours ?? Settings.current?.userPrefs?.staleHours ?? 6;
                const statusInfo = getProxyStatus(pinnedProxyId, site, autoStatus, staleHours);
                // English: If pinned proxy is not fail, use it immediately
                // Russian: Если закреплённый прокси не в статусе fail, используем его сразу
                if (statusInfo.type !== 'direct-fail' && statusInfo.type !== 'indirect-fail') {
                    console.log(`[ProxySelector] Используем закреплённый прокси ${pinnedProxyId} для ${site}`);
                    return { proxy: pinnedProxy, reason: 'success' };
                } else {
                    // English: Pinned proxy is failing, remove pin
                    // Russian: Закреплённый прокси не работает, снимаем закрепление
                    statusService.unpinProxy(site);
                    console.log(`[ProxySelector] Закреплённый прокси ${pinnedProxyId} не работает, закрепление снято`);
                }
            }
        }

        // 1. Получаем все прокси (ручные + подписочные) – используем переданный список или глобальный
        const allProxies = options?.proxyList ?? this.getAllProxies();
        console.log(`[ProxySelector] Всего прокси: ${allProxies.length}`);
        if (!allProxies.length) {
            return { proxy: null, reason: 'none' };
        }

        // 2. Получаем настройки устаревания
        const staleHours = options?.staleHours ?? Settings.current?.userPrefs?.staleHours ?? 6;

        // 3. Получаем карту статусов (используем переданную или глобальную)
        const autoStatus = options?.autoStatus ?? Settings.current?.autoStatus ?? {};
        console.log(`[ProxySelector] autoStatus keys:`, Object.keys(autoStatus));

        // 4. Отфильтровываем исключённые прокси
        const excluded = new Set<string>();
        if (options?.excludedProxyIds) {
            options.excludedProxyIds.forEach(id => excluded.add(id));
        }
        if (options?.excludedForSite) {
            options.excludedForSite.forEach(id => excluded.add(id));
        }

        // 5. Сортируем прокси по весу (приоритет, статус, рейтинг)
        const sorted = this.sortProxiesByPriority(allProxies, site, autoStatus, staleHours, excluded);
        console.log(`[ProxySelector] Отсортировано прокси: ${sorted.length}`);
        if (sorted.length > 0) {
            console.log(`[ProxySelector] Первый в списке: ${sorted[0].id} (${sorted[0].host}:${sorted[0].port})`);
        }

        if (sorted.length === 0) {
            return { proxy: null, reason: 'excluded' };
        }

        // 6. Берём первый (лучший)
        const best = sorted[0];
        const statusInfo = getProxyStatus(best.id, site, autoStatus, staleHours);
        const reason = this.mapStatusToReason(statusInfo.type);

        console.log(`[ProxySelector] Лучший прокси: ${best.host}:${best.port} (${reason})`);
        return { proxy: best, reason };
    }

    /**
     * English: Gets the next proxy for failover (after the current one) for a given site.
     * Russian: Возвращает следующий прокси для failover (после текущего) для заданного сайта.
     */
    public static getNextProxyForSite(
        site: string,
        currentProxyId: string,
        options?: SelectorOptions
    ): SelectorResult {
        console.log(`[ProxySelector] Поиск следующего прокси для сайта "${site}" после ${currentProxyId}`);

        const allProxies = options?.proxyList ?? this.getAllProxies();
        if (!allProxies.length) {
            return { proxy: null, reason: 'none' };
        }

        const staleHours = options?.staleHours ?? Settings.current?.userPrefs?.staleHours ?? 6;
        const autoStatus = options?.autoStatus ?? Settings.current?.autoStatus ?? {};

        const excluded = new Set<string>();
        if (options?.excludedProxyIds) {
            options.excludedProxyIds.forEach(id => excluded.add(id));
        }
        if (options?.excludedForSite) {
            options.excludedForSite.forEach(id => excluded.add(id));
        }

        // Сортируем все прокси
        const sorted = this.sortProxiesByPriority(allProxies, site, autoStatus, staleHours, excluded);

        // Находим индекс текущего прокси в отсортированном списке
        const currentIndex = sorted.findIndex(p => p.id === currentProxyId);
        if (currentIndex === -1) {
            // Если текущий прокси не найден, возвращаем лучший
            return this.getBestProxyForSite(site, options);
        }

        // Ищем следующий прокси после текущего (с учётом одинакового веса, можно пропустить)
        for (let i = currentIndex + 1; i < sorted.length; i++) {
            const candidate = sorted[i];
            // Можно пропускать прокси с очень низким статусом? Пока берём любой следующий
            const statusInfo = getProxyStatus(candidate.id, site, autoStatus, staleHours);
            // Если прокси имеет статус "fail" и нет других, может быть выбран как fallback
            // Но если есть другой с лучшим статусом, он будет раньше в списке
            if (!excluded.has(candidate.id)) {
                const reason = this.mapStatusToReason(statusInfo.type);
                console.log(`[ProxySelector] Следующий прокси: ${candidate.host}:${candidate.port} (${reason})`);
                return { proxy: candidate, reason };
            }
        }

        // Если не нашли следующего, пробуем вернуть лучший (зацикливание)
        console.log('[ProxySelector] Следующий прокси не найден, возвращаем лучший');
        return this.getBestProxyForSite(site, options);
    }

    /**
     * English: Sorts proxies by priority (pin > star > none), status weight, then rating.
     * Russian: Сортирует прокси по приоритету (pin > star > none), весу статуса, затем рейтингу.
     * Made public for use in UI (settings page and popup).
     */
    public static sortProxiesByPriority(
        proxies: ProxyServer[],
        site: string,
        autoStatus: AutoStatusMap,
        staleHours: number,
        excluded: Set<string>
    ): ProxyServer[] {
        // English: Filter excluded proxies
        // Russian: Отфильтровываем исключённые прокси
        const filtered = proxies.filter(p => !excluded.has(p.id));

        // English: Sort by descending weight
        // Russian: Сортируем по убыванию веса
        return filtered.sort((a, b) => {
            const weightA = this.calculateWeight(a, site, autoStatus, staleHours);
            const weightB = this.calculateWeight(b, site, autoStatus, staleHours);
            return weightB - weightA;
        });
    }

    /**
     * English: Calculates sorting weight for a single proxy.
     * Russian: Вычисляет вес сортировки для одного прокси.
     */
    public static calculateWeight(
        proxy: ProxyServer,
        site: string,
        autoStatus: AutoStatusMap,
        staleHours: number
    ): number {
        // Нормализуем сайт (удаляем www., протокол, завершающий слэш)
        const normalizedSite = ProxySelector.normalizeSite(site) || site;

        // Приоритет: pin=3, star=2, none=1
        let priorityWeight = 1;
        if (proxy.priority === 'pin') priorityWeight = 3;
        else if (proxy.priority === 'star') priorityWeight = 2;

        // Статус: success=5, indirect=4, ip-only=3, unknown=2, fail=1
        const statusInfo = getProxyStatus(proxy.id, normalizedSite, autoStatus, staleHours);
        let statusWeight = 3; // unknown by default
        switch (statusInfo.type) {
            case 'direct-success':
                statusWeight = 5;
                break;
            case 'indirect-success':
                statusWeight = 4;
                break;
            case 'ip-only':
                statusWeight = 3;
                break;
            case 'unknown':
                statusWeight = 2;
                break;
            case 'direct-fail':
            case 'indirect-fail':
                statusWeight = 1;
                break;
        }

        // Рейтинг (может быть отрицательным)
        const rating = proxy.rating ?? 0;

        // Комбинированный вес: приоритет доминирует, затем статус, затем рейтинг
        return (priorityWeight * 10000) + (statusWeight * 1000) + rating;
    }

    /**
     * English: Maps status type to selector reason.
     * Russian: Преобразует тип статуса в причину выбора.
     */
    private static mapStatusToReason(statusType: string): SelectorResult['reason'] {
        switch (statusType) {
            case 'direct-success':
            case 'indirect-success':
                return 'success';
            case 'ip-only':
                return 'ip-only';
            case 'unknown':
                return 'unknown';
            case 'direct-fail':
            case 'indirect-fail':
                return 'fail';
            default:
                return 'unknown';
        }
    }

    /**
     * English: Returns the sorted list of all available proxies for a site.
     * Russian: Возвращает отсортированный список всех доступных прокси для сайта.
     */
    public static getAllProxiesForSite(
        site: string,
        options?: SelectorOptions
    ): ProxyServer[] {
        const allProxies = this.getAllProxies();
        if (!allProxies.length) return [];

        const staleHours = options?.staleHours ?? Settings.current?.userPrefs?.staleHours ?? 6;
        const autoStatus = Settings.current?.autoStatus || {};

        const excluded = new Set<string>();
        if (options?.excludedProxyIds) {
            options.excludedProxyIds.forEach(id => excluded.add(id));
        }
        if (options?.excludedForSite) {
            options.excludedForSite.forEach(id => excluded.add(id));
        }

        return this.sortProxiesByPriority(allProxies, site, autoStatus, staleHours, excluded);
    }

    /**
     * English: Returns all available proxies (manual + from enabled subscriptions).
     * Russian: Возвращает все доступные прокси (ручные + из включённых подписок).
     */
    public static getAllProxies(): ProxyServer[] {
        const result: ProxyServer[] = [];

        // Ручные прокси
        if (Settings.current?.proxyServers) {
            result.push(...Settings.current.proxyServers);
        }

        // Прокси из подписок
        if (Settings.current?.proxyServerSubscriptions) {
            for (const sub of Settings.current.proxyServerSubscriptions) {
                if (sub.enabled && sub.proxies) {
                    result.push(...sub.proxies);
                }
            }
        }

        return result;
    }

    /**
     * English: Normalizes site domain (removes protocol, www., trailing slash)
     * Russian: Нормализует домен сайта (удаляет протокол, www., завершающий слэш)
     */
    private static normalizeSite(site: string): string | null {
        if (!site) return null;
        let normalized = site.trim().toLowerCase();
        normalized = normalized.replace(/^https?:\/\//, '');
        normalized = normalized.replace(/\/$/, '');
        if (normalized.startsWith('www.')) {
            normalized = normalized.substring(4);
        }
        // Validate that it's a valid domain
        if (!normalized.includes('.') || normalized.includes('/') || normalized.includes(':')) {
            return null;
        }
        return normalized;
    }

    /**
     * English: Returns a sorted list of proxies for a specific site, using the same logic as popup.
     * Russian: Возвращает отсортированный список прокси для конкретного сайта, используя ту же логику, что и в попапе.
     * @param site - Site domain (e.g., "youtube.com")
     * @param excludeFail - If true, proxies with fail status are excluded (default: true)
     * @returns Sorted array of ProxyServer
     */
    public static getSortedProxiesForSite(site: string, excludeFail: boolean = true): ProxyServer[] {
        const allProxies = this.getAllProxies();
        if (!allProxies.length) return [];

        const staleHours = Settings.current?.userPrefs?.staleHours ?? 6;
        const autoStatus = Settings.current?.autoStatus || {};

        // English: Filter out fail proxies if requested
        // Russian: Исключаем прокси со статусом fail, если запрошено
        let filtered = allProxies;
        if (excludeFail) {
            filtered = allProxies.filter(p => {
                const statusInfo = getProxyStatus(p.id, site, autoStatus, staleHours);
                return statusInfo.type !== 'direct-fail' && statusInfo.type !== 'indirect-fail';
            });
        }

        // English: Use the same sorting logic as popup
        // Russian: Используем ту же логику сортировки, что и в попапе
        return this.sortProxiesByPriority(filtered, site, autoStatus, staleHours, new Set());
    }
}