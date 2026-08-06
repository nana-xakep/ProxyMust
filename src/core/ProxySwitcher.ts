// src/core/ProxySwitcher.ts
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

import { api } from '../lib/environment';
import { Settings } from './Settings';
import { SettingsOperation } from './SettingsOperation';
import { CommandMessages, SmartProfileTypeBuiltinIds } from './definitions';
import { ProxyEngine } from './ProxyEngine';

/**
 * English: Options for applying a proxy.
 * Russian: Опции для применения прокси.
 */
export interface ApplyProxyOptions {
    /** English: Override protocol (if not specified, uses proxy's current protocol). Russian: Переопределить протокол (если не указан, используется текущий протокол прокси). */
    protocol?: string;
    /** English: Profile ID to switch to before applying proxy (default: AlwaysEnabled). Russian: ID профиля для переключения перед применением прокси (по умолчанию: AlwaysEnabled). */
    profileId?: string;
    /** English: Whether to wait for proxy to be ready (default: true). Russian: Ожидать ли готовности прокси (по умолчанию: true). */
    waitForReady?: boolean;
}

/**
 * English: Core module for applying and restoring proxy settings.
 * Russian: Основной модуль для применения и восстановления настроек прокси.
 */
export class ProxySwitcher {

    private static _originalProfileId: string | null = null;
    private static _isProxyApplied: boolean = false;

    /**
     * English: Applies a proxy by ID, optionally switching profile and protocol.
     * Russian: Применяет прокси по ID, опционально переключая профиль и протокол.
     */
    public static async applyProxy(
        proxyId: string,
        options: ApplyProxyOptions = {}
    ): Promise<void> {
        console.log(`[ProxySwitcher] Применение прокси ${proxyId}`);

        // 1. Находим прокси
        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (!proxy) {
            throw new Error(`Proxy ${proxyId} not found`);
        }

        // 2. Сохраняем исходный профиль (если ещё не сохранён)
        if (ProxySwitcher._originalProfileId === null) {
            ProxySwitcher._originalProfileId = Settings.current?.activeProfileId || null;
            console.log(`[ProxySwitcher] Сохранён исходный профиль: ${ProxySwitcher._originalProfileId}`);
        }

        // 3. Определяем целевой профиль
        const targetProfileId = options.profileId || SmartProfileTypeBuiltinIds.AlwaysEnabled;
        const currentProfileId = Settings.current?.activeProfileId;

        // 4. Если профиль отличается – переключаем
        if (currentProfileId !== targetProfileId) {
            console.log(`[ProxySwitcher] Переключение на профиль ${targetProfileId}`);
            await ProxySwitcher._switchProfile(targetProfileId);
        }

        // 5. Применяем прокси через ProxyEngine
        const protocol = options.protocol || proxy.protocol;
        await ProxySwitcher._applyProxyDirectly(proxyId, protocol);

        // 6. Если нужно – ждём готовности
        if (options.waitForReady !== false) {
            await ProxySwitcher._waitForProxyReady(proxyId);
        }

        ProxySwitcher._isProxyApplied = true;
        console.log(`[ProxySwitcher] Прокси ${proxyId} применён`);
    }

    /**
     * English: Restores the original profile (if any) and clears dynamic overrides.
     * Russian: Восстанавливает исходный профиль (если был) и очищает динамические переопределения.
     */
    public static async restoreProxy(): Promise<void> {
        console.log('[ProxySwitcher] Восстановление исходного профиля');

        // Если есть сохранённый исходный профиль – восстанавливаем
        if (ProxySwitcher._originalProfileId !== null) {
            await ProxySwitcher._switchProfile(ProxySwitcher._originalProfileId);
            ProxySwitcher._originalProfileId = null;
        } else {
            // Если нет сохранённого – переключаемся на Direct
            console.log('[ProxySwitcher] Исходный профиль не сохранён, переключение на Direct');
            await ProxySwitcher._switchProfile(SmartProfileTypeBuiltinIds.Direct);
        }

        // Очищаем все динамические переопределения
        ProxyEngine.clearAllDynamicProxies();

        ProxySwitcher._isProxyApplied = false;
        console.log('[ProxySwitcher] Восстановление завершено');
    }

    /**
     * English: Checks if a proxy is currently applied.
     * Russian: Проверяет, применён ли прокси.
     */
    public static isProxyApplied(): boolean {
        return ProxySwitcher._isProxyApplied;
    }

    /**
     * English: Returns the original profile ID that was saved.
     * Russian: Возвращает сохранённый исходный профиль ID.
     */
    public static getOriginalProfileId(): string | null {
        return ProxySwitcher._originalProfileId;
    }

    // ==================== Private helpers ====================

    private static async _switchProfile(profileId: string): Promise<void> {
        // Обновляем настройки через Settings
        const profile = Settings.current?.proxyProfiles?.find(p => p.profileId === profileId);
        if (!profile) {
            console.warn(`[ProxySwitcher] Профиль ${profileId} не найден, пропускаем`);
            return;
        }

        Settings.current.activeProfileId = profileId;
        SettingsOperation.saveActiveProfile();
        SettingsOperation.saveAllSync(false);
        Settings.updateActiveSettings();
        ProxyEngine.updateBrowsersProxyConfig();

        // Отправляем сообщение в UI
        api.runtime.sendMessage({
            command: CommandMessages.PopupChangeActiveProfile,
            profileId: profileId
        });

        // Ждём применения
        await ProxySwitcher._waitForProfile(profileId);
    }

    private static async _applyProxyDirectly(proxyId: string, protocol: string): Promise<void> {
        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (!proxy) {
            throw new Error(`Proxy ${proxyId} not found`);
        }

        const proxyAPI = api.proxy;
        if (!proxyAPI) {
            console.warn('[ProxySwitcher] Proxy API not available, using fallback');
            // Fallback: меняем defaultProxyServerId и обновляем ProxyEngine
            Settings.current.defaultProxyServerId = proxyId;
            SettingsOperation.saveDefaultProxyServer();
            Settings.updateActiveSettings();
            ProxyEngine.updateBrowsersProxyConfig();
            return;
        }

        const usedProtocol = protocol || proxy.protocol;
        const scheme = usedProtocol.toLowerCase();
        const config = {
            mode: 'fixed_servers',
            rules: {
                singleProxy: {
                    scheme: scheme === 'socks' ? 'socks5' : scheme,
                    host: proxy.host,
                    port: proxy.port
                },
                bypassList: ['<local>']
            }
        };

        console.log(`[ProxySwitcher] Применение прокси ${proxy.host}:${proxy.port} (${usedProtocol}) через API`);

        await new Promise<void>((resolve, reject) => {
            proxyAPI.settings.set({ value: config, scope: 'regular' }, () => {
                if (api.runtime?.lastError) {
                    reject(new Error(api.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });

        // Также обновляем defaultProxyServerId для согласованности
        Settings.current.defaultProxyServerId = proxyId;
        SettingsOperation.saveDefaultProxyServer();
        Settings.updateActiveSettings();
    }

    private static async _waitForProfile(targetProfileId: string, maxAttempts: number = 15): Promise<void> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 300));
            Settings.updateActiveSettings();
            const currentProfile = Settings.current?.activeProfileId;
            if (currentProfile === targetProfileId) {
                console.log(`[ProxySwitcher] Профиль подтверждён: ${targetProfileId} (попытка ${attempt})`);
                return;
            }
            console.log(`[ProxySwitcher] Ожидание профиля: сейчас ${currentProfile}, ожидаем ${targetProfileId} (${attempt}/${maxAttempts})`);
        }
        console.warn(`[ProxySwitcher] Не удалось подтвердить профиль ${targetProfileId}`);
    }

    private static async _waitForProxyReady(proxyId: string, maxAttempts: number = 3): Promise<void> {
        const proxy = SettingsOperation.findProxyServerById(proxyId);
        if (!proxy) return;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                // Проверяем через IP-сервисы (импорт будет добавлен позже)
                // Пока просто ждём и проверяем, что прокси установлен
                const config = await new Promise<any>((resolve) => {
                    const proxyAPI = api.proxy;
                    if (!proxyAPI) { resolve(null); return; }
                    proxyAPI.settings.get({}, (d: any) => resolve(d?.value));
                });
                if (config && config.mode === 'fixed_servers') {
                    const singleProxy = config.rules?.singleProxy;
                    if (singleProxy && singleProxy.host === proxy.host && singleProxy.port === proxy.port) {
                        console.log(`[ProxySwitcher] Прокси ${proxyId} готов (попытка ${attempt})`);
                        return;
                    }
                }
            } catch (e) {
                // ignore
            }
            console.log(`[ProxySwitcher] Ожидание готовности прокси ${proxyId} (${attempt}/${maxAttempts})`);
        }
        console.warn(`[ProxySwitcher] Прокси ${proxyId} не готов после ${maxAttempts} попыток`);
    }
}