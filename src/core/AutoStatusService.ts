// src/core/AutoStatusService.ts
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
import { SettingsOperation } from './SettingsOperation';
import { AutoStatusMap, AutoStatusEntry } from './definitions';

/**
 * English: Centralized service for managing auto-statuses of proxies.
 * Russian: Централизованный сервис для управления авто-статусами прокси.
 */
export class AutoStatusService {
    private static instance: AutoStatusService;

    private constructor() {}

    public static getInstance(): AutoStatusService {
        if (!AutoStatusService.instance) {
            AutoStatusService.instance = new AutoStatusService();
        }
        return AutoStatusService.instance;
    }

    /**
     * English: Returns the entire autoStatus map (deep copy for immutability).
     * Russian: Возвращает всю карту автостатусов (глубокая копия для неизменяемости).
     */
    public getAllStatuses(): AutoStatusMap {
        return JSON.parse(JSON.stringify(Settings.current.autoStatus || {}));
    }

    /**
     * English: Returns status entry for a specific proxy and site, or null if not found.
     * Russian: Возвращает запись статуса для конкретного прокси и сайта, или null, если не найдено.
     */
    public getStatus(proxyId: string, site: string): AutoStatusEntry | null {
        const statusMap = Settings.current.autoStatus;
        if (!statusMap || !statusMap[proxyId]) {
            return null;
        }
        const normalizedSite = this.normalizeSite(site);
        return statusMap[proxyId][normalizedSite] || null;
    }

    /**
     * English: Sets status for a proxy and site, updates Settings.current and saves to storage.
     * Russian: Устанавливает статус для прокси и сайта, обновляет Settings.current и сохраняет в хранилище.
     */
    public setStatus(
        proxyId: string,
        site: string,
        status: 'success' | 'indirect' | 'ip-only' | 'fail',
        timestamp: number = Date.now()
    ): void {
        const normalizedSite = this.normalizeSite(site);
        console.log(`[AutoStatusService] Сохранение статуса: прокси=${proxyId}, сайт=${normalizedSite}, статус=${status}`);

        // Ensure autoStatus exists
        if (!Settings.current.autoStatus) {
            Settings.current.autoStatus = {};
        }
        if (!Settings.current.autoStatus[proxyId]) {
            Settings.current.autoStatus[proxyId] = {};
        }

        Settings.current.autoStatus[proxyId][normalizedSite] = {
            status,
            timestamp
        };

        // Сохраняем изменения в локальное хранилище (синхронно, но saveAllLocal асинхронный – вызываем без await)
        SettingsOperation.saveAllLocal(true).catch((err) => {
            console.error('[AutoStatusService] Ошибка сохранения autoStatus:', err);
        });
        // Также сохраняем в синхронизацию (если включена) – но обычно autoStatus не синхронизируется, оставляем saveAllSync(false)
        SettingsOperation.saveAllSync(false);
    }

    /**
     * English: Returns all statuses for a specific site.
     * Russian: Возвращает все статусы для конкретного сайта.
     */
    public getAllStatusesForSite(site: string): { proxyId: string; entry: AutoStatusEntry }[] {
        const normalizedSite = this.normalizeSite(site);
        const result: { proxyId: string; entry: AutoStatusEntry }[] = [];
        const map = Settings.current.autoStatus;
        if (!map) return result;

        for (const proxyId in map) {
            if (map[proxyId][normalizedSite]) {
                result.push({
                    proxyId,
                    entry: map[proxyId][normalizedSite]
                });
            }
        }
        return result;
    }

    /**
     * English: Returns all statuses for a specific proxy.
     * Russian: Возвращает все статусы для конкретного прокси.
     */
    public getAllStatusesForProxy(proxyId: string): { [site: string]: AutoStatusEntry } | null {
        const map = Settings.current.autoStatus;
        if (!map || !map[proxyId]) {
            return null;
        }
        return { ...map[proxyId] };
    }

    /**
     * English: Clears all statuses for a specific proxy.
     * Russian: Очищает все статусы для конкретного прокси.
     */
    public clearStatusesForProxy(proxyId: string): void {
        console.log(`[AutoStatusService] Очистка статусов для прокси ${proxyId}`);
        const map = Settings.current.autoStatus;
        if (map && map[proxyId]) {
            delete map[proxyId];
            this.save();
        }
    }

    /**
     * English: Clears all statuses for all proxies.
     * Russian: Очищает все статусы для всех прокси.
     */
    public clearAllStatuses(): void {
        console.log('[AutoStatusService] Очистка всех статусов');
        Settings.current.autoStatus = {};
        this.save();
    }

    /**
     * English: Checks if a status entry is fresh (not stale).
     * Russian: Проверяет, свежая ли запись статуса (не устаревшая).
     */
    public isFresh(entry: AutoStatusEntry, staleHours: number = 12): boolean {
        const staleMs = staleHours * 7200000;
        return (Date.now() - entry.timestamp) < staleMs;
    }

    /**
     * English: Replaces the entire autoStatus map with a new one (for bulk updates).
     * Russian: Заменяет всю карту автостатусов на новую (для массовых обновлений).
     */
    public replaceAllStatuses(newMap: AutoStatusMap): void {
        console.log('[AutoStatusService] Замена всей карты статусов');
        Settings.current.autoStatus = newMap || {};
        this.save();
    }

    /**
     * English: Saves current autoStatus to storage (local and sync).
     * Russian: Сохраняет текущий autoStatus в хранилище (локальное и синхронизацию).
     */
    private save(): void {
        SettingsOperation.saveAllLocal(true).catch((err) => {
            console.error('[AutoStatusService] Ошибка сохранения autoStatus при сохранении:', err);
        });
        SettingsOperation.saveAllSync(false);
    }

    // ========== Pinned proxies ==========

    /**
     * English: Pins a proxy for a site (session-only).
     * Russian: Закрепляет прокси для сайта (на сессию).
     */
    public pinProxy(site: string, proxyId: string): void {
        const normalizedSite = this.normalizeSite(site);
        if (!Settings.current.userPrefs) {
            Settings.current.userPrefs = { staleHours: 6, manualSites: [], pinnedProxies: {} };
        }
        if (!Settings.current.userPrefs.pinnedProxies) {
            Settings.current.userPrefs.pinnedProxies = {};
        }
        Settings.current.userPrefs.pinnedProxies[normalizedSite] = proxyId;
        console.log(`[AutoStatusService] Закреплён прокси ${proxyId} для сайта ${normalizedSite}`);
        // Сохраняем userPrefs локально (не синхронизируем)
        SettingsOperation.saveUserPreferences();
    }

    /**
     * English: Unpins a proxy for a site.
     * Russian: Открепляет прокси для сайта.
     */
    public unpinProxy(site: string): void {
        const normalizedSite = this.normalizeSite(site);
        if (Settings.current.userPrefs?.pinnedProxies) {
            delete Settings.current.userPrefs.pinnedProxies[normalizedSite];
            console.log(`[AutoStatusService] Откреплён прокси для сайта ${normalizedSite}`);
            SettingsOperation.saveUserPreferences();
        }
    }

    /**
     * English: Returns the pinned proxy ID for a site, or null if not pinned.
     * Russian: Возвращает закреплённый прокси для сайта, или null, если не закреплён.
     */
    public getPinnedProxy(site: string): string | null {
        const normalizedSite = this.normalizeSite(site);
        // English: Guard against undefined Settings.current
        // Russian: Защита от undefined Settings.current
        if (!Settings.current || !Settings.current.userPrefs) {
            return null;
        }
        const pinned = Settings.current.userPrefs?.pinnedProxies?.[normalizedSite];
        return pinned || null;
    }

    /**
     * English: Checks if a site has a pinned proxy.
     * Russian: Проверяет, есть ли закреплённый прокси для сайта.
     */
    public isPinned(site: string): boolean {
        return this.getPinnedProxy(site) !== null;
    }

    /**
     * English: Clears all pinned proxies (e.g., on browser restart or profile change).
     * Russian: Очищает все закреплённые прокси (например, при перезапуске браузера или смене профиля).
     */
    public clearAllPinned(): void {
        if (Settings.current.userPrefs) {
            Settings.current.userPrefs.pinnedProxies = {};
            SettingsOperation.saveUserPreferences();
            console.log('[AutoStatusService] Все закреплённые прокси очищены');
        }
    }

    /**
     * English: Normalizes site string (removes protocol and trailing slash).
     * Russian: Нормализует строку сайта (удаляет протокол и завершающий слэш).
     */
    private normalizeSite(site: string): string {
        if (!site) return '';
        let normalized = site.trim().toLowerCase();
        normalized = normalized.replace(/^https?:\/\//, '');
        normalized = normalized.replace(/\/$/, '');
        return normalized;
    }
}