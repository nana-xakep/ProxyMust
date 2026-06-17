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
import { Utils } from "./Utils";
import { api } from "./environment";
import { ProxyServerSubscription, ProxyServer, ProxyServerSubscriptionFormat } from "../core/definitions";
import { Debug } from "./Debug";
import { ProxyEngineSpecialRequests } from "../core/ProxyEngineSpecialRequests";

export const ProxyImporter = {
    /**
     * Read proxy list from server / Чтение списка прокси с сервера
     * Cross-browser: Works in Chrome, Firefox, Edge, Safari, Opera
     */
    readFromServer(serverDetail: ProxyServerSubscription, success?: Function, fail?: Function) {
        if (!serverDetail || !serverDetail.url) {
            if (fail) fail();
            return;
        }
        if (!success) throw "onSuccess callback is mandatory";

        function ajaxSuccess(response: any) {
            if (!response) {
                if (fail) fail();
                return;
            }
            ProxyImporter.importText(response,
                null,
                false,
                null,
                (importResult: { success: boolean, message: string, result: ProxyServer[] }) => {
                    if (!importResult.success) {
                        if (fail) fail(importResult);
                        return;
                    }
                    if (success) success(importResult);
                },
                (error: Error) => {
                    if (fail) fail(error);
                },
                serverDetail);
        }

        if (serverDetail.applyProxy !== null)
            ProxyEngineSpecialRequests.setSpecialUrl(serverDetail.url, serverDetail.applyProxy);

        // Cross-browser request headers / Кроссбраузерные заголовки запроса
        let headers: HeadersInit = {};
        if (serverDetail.username) {
            headers['Authorization'] = 'Basic ' + btoa(serverDetail.username + ':' + atob(serverDetail.password));
        }

        // Try fetch first (modern browsers) / Пробуем fetch сначала (современные браузеры)
        // fetch support: Chrome 40+, Firefox 39+, Edge 14+, Safari 10.1+, Opera 27+
        if (typeof fetch !== 'undefined') {
            fetch(serverDetail.url, {
                method: "GET",
                cache: 'no-store',
                headers: headers
            })
            .then(async res => {
                if (res.status === 200) {
                    ajaxSuccess(await res.text());
                } else if (fail) {
                    fail(new Error(`${res.status}, ${res.statusText}`));
                }
            })
            .catch(err => {
                // Fallback to XMLHttpRequest for older browsers
                // Запасной вариант для старых браузеров
                if (typeof XMLHttpRequest !== 'undefined') {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', serverDetail.url, true);
                    if (serverDetail.username) {
                        xhr.setRequestHeader('Authorization', 'Basic ' + btoa(serverDetail.username + ':' + atob(serverDetail.password)));
                    }
                    xhr.onload = function() {
                        if (xhr.status === 200) {
                            ajaxSuccess(xhr.responseText);
                        } else if (fail) {
                            fail(new Error(`${xhr.status}, ${xhr.statusText}`));
                        }
                    };
                    xhr.onerror = function() {
                        if (fail) fail(new Error('Network request failed'));
                    };
                    xhr.send();
                } else if (fail) {
                    fail(err);
                }
            });
        } 
        // Fallback for very old browsers without fetch
        // Запасной вариант для очень старых браузеров без fetch
        else if (typeof XMLHttpRequest !== 'undefined') {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', serverDetail.url, true);
            if (serverDetail.username) {
                xhr.setRequestHeader('Authorization', 'Basic ' + btoa(serverDetail.username + ':' + atob(serverDetail.password)));
            }
            xhr.onload = function() {
                if (xhr.status === 200) {
                    ajaxSuccess(xhr.responseText);
                } else if (fail) {
                    fail(new Error(`${xhr.status}, ${xhr.statusText}`));
                }
            };
            xhr.onerror = function() {
                if (fail) fail(new Error('Network request failed'));
            };
            xhr.send();
        } else if (fail) {
            fail(new Error('No HTTP request API available'));
        }
    },

    /**
     * Import proxy from text or file / Импорт прокси из текста или файла
     * Cross-browser: Works in all browsers with FileReader support
     */
    importText(text: string | ArrayBuffer, file: any, append: boolean, currentProxies: ProxyServer[], success: Function, fail?: Function, options?: ProxyServerSubscription) {
        if (!file && !text) {
            if (fail) fail();
            return;
        }

        if (text) {
            doImport(text as string, options);
        } else {
            // Cross-browser FileReader / Кроссбраузерный FileReader
            if (typeof FileReader === 'undefined') {
                if (fail) fail(new Error('FileReader not supported in this browser'));
                return;
            }
            
            let reader = new FileReader();
            reader.onerror = event => { if (fail) fail(event); };
            reader.onload = () => {
                doImport(reader.result as string, options);
            };
            reader.readAsText(file);
        }

        function doImport(text: string, options?: ProxyServerSubscription) {
            let parsedProxies: ProxyServer[] = (options && options.format === ProxyServerSubscriptionFormat.Json)
                ? ProxyImporter.parseJson(text, options)
                : ProxyImporter.parseText(text, options);

            if (parsedProxies == null) {
                if (fail) fail();
                return;
            }

            let importedProxies: ProxyServer[] = Utils.removeDuplicatesFunc(parsedProxies,
                (item1: ProxyServer, item2: ProxyServer) =>
                    item1.host === item2.host &&
                    item1.port === item2.port &&
                    item1.username === item2.username &&
                    item1.password === item2.password);

            if (append) {
                if (!currentProxies) currentProxies = [];
                let appendedProxyList: ProxyServer[] = currentProxies.slice();
                let appendedProxyCount = 0;

                for (let importedProxy of importedProxies) {
                    let exists = currentProxies.some(cp =>
                        cp.host === importedProxy.host &&
                        cp.port === importedProxy.port &&
                        cp.username === importedProxy.username &&
                        cp.password === importedProxy.password);
                    if (exists) continue;

                    appendedProxyList.push(importedProxy);
                    appendedProxyCount++;
                }

                let message = api.i18n.getMessage("importerImportProxySuccess")
                    .replace("{0}", appendedProxyCount.toString())
                    .replace("{1}", importedProxies.length.toString());

                success({ success: true, message: message, result: appendedProxyList });
            } else {
                let message = api.i18n.getMessage("importerImportProxySuccess")
                    .replace("{0}", importedProxies.length.toString())
                    .replace("{1}", parsedProxies.length.toString());

                success({ success: true, message: message, result: importedProxies });
            }
        }
    },

    /**
     * Detect proxy protocol by port number / Определение протокола прокси по номеру порта
     * Auto-detection is always ON for manual imports
     * Cross-browser: Pure JavaScript, works everywhere
     * 
     * Port 4145 -> SOCKS5 (your proxies)
     * Port 1080 -> SOCKS5
     * Port 8080 -> HTTP
     * etc.
     */
    detectProtocolByPort: (port: number, explicitProtocol?: string | null): string => {
        // If protocol explicitly specified, use it / Если протокол явно указан, используем его
        if (explicitProtocol) {
            let proto = explicitProtocol.toUpperCase();
            return proto === 'SOCKS' ? 'SOCKS5' : proto;
        }

        // Comprehensive port to protocol mapping / Полный маппинг портов к протоколам
        const portProtocolMap: { [key: number]: string } = {
            // SOCKS ports / SOCKS порты
            1080: 'SOCKS5', 1081: 'SOCKS4', 1082: 'SOCKS4', 1085: 'SOCKS5',
            1086: 'SOCKS5', 1087: 'SOCKS5', 1088: 'SOCKS5', 1089: 'SOCKS5',
            4145: 'SOCKS5', 4146: 'SOCKS5', 4147: 'SOCKS5', 4148: 'SOCKS5',
            4149: 'SOCKS5', 4150: 'SOCKS5', 9050: 'SOCKS5', 9051: 'SOCKS5',
            9150: 'SOCKS5', 9151: 'SOCKS5', 10800: 'SOCKS5', 10801: 'SOCKS5',
            
            // HTTP ports / HTTP порты
            80: 'HTTP', 8080: 'HTTP', 8081: 'HTTP', 8082: 'HTTP', 8085: 'HTTP',
            8088: 'HTTP', 8090: 'HTTP', 3128: 'HTTP', 3129: 'HTTP', 3130: 'HTTP',
            8118: 'HTTP', 8123: 'HTTP', 8888: 'HTTP', 8889: 'HTTP', 8890: 'HTTP',
            9000: 'HTTP', 9001: 'HTTP', 9002: 'HTTP', 9999: 'HTTP', 10000: 'HTTP',
            
            // HTTPS ports / HTTPS порты
            443: 'HTTPS', 8443: 'HTTPS', 8444: 'HTTPS', 9443: 'HTTPS',
            
            // Custom ports from your proxy list / Пользовательские порты из вашего списка прокси
            11288: 'SOCKS5', 15303: 'SOCKS5', 15291: 'SOCKS5', 18762: 'SOCKS5',
            18765: 'SOCKS5', 39078: 'SOCKS5', 15864: 'SOCKS5', 16894: 'SOCKS5',
            25283: 'SOCKS5', 31034: 'SOCKS5', 36181: 'SOCKS5', 41679: 'SOCKS5',
            58208: 'SOCKS5', 41450: 'SOCKS5', 41451: 'SOCKS5', 41452: 'SOCKS5',
            41453: 'SOCKS5', 41454: 'SOCKS5', 41455: 'SOCKS5'
        };

        if (portProtocolMap[port]) {
            return portProtocolMap[port];
        }

        // Default to HTTP for unknown ports / По умолчанию HTTP для неизвестных портов
        return 'HTTP';
    },

    /**
     * Parse text proxy list with AUTO-DETECTION
     * Парсинг текстового списка прокси с АВТООПРЕДЕЛЕНИЕМ
     * For MANUAL import: auto-detection works immediately without UI changes
     * Для РУЧНОГО импорта: автоопределение работает сразу без изменения интерфейса
     * Cross-browser: Works in all browsers
     */
    parseText: (proxyListText: string, options?: ProxyServerSubscription): ProxyServer[] => {
        if (!proxyListText || typeof proxyListText !== "string") return null;

        // Handle base64 obfuscation / Обработка base64 обфускации
        if (options?.obfuscation?.toLowerCase() === "base64") {
            try {
                proxyListText = atob(proxyListText);
            } catch (e) {
                return null;
            }
        }

        const lines = proxyListText.split(/\r?\n/);
        const parsedProxies: ProxyServer[] = [];
        
        // Default protocol from options (used ONLY if no port detection possible)
        // Протокол по умолчанию из опций (используется ТОЛЬКО если невозможно определить по порту)
        const defaultProtocol = (options?.proxyProtocol || "HTTP").toUpperCase();
        
        // AUTO-DETECTION IS ALWAYS ON for manual import (can't be disabled)
        // АВТООПРЕДЕЛЕНИЕ ВСЕГДА ВКЛЮЧЕНО для ручного импорта
        // For subscriptions, respect the setting / Для подписок, учитываем настройку
        const autoDetectProtocol = options?.autoDetectProtocol !== false;

        for (let line of lines) {
            line = line.trim();
            // Skip empty lines and comments / Пропускаем пустые строки и комментарии
            if (line.length < 4 || line.startsWith('#') || line.startsWith('//')) continue;

            let explicitProtocol: string | null = null;
            let name: string | null = null;
            let username = '';
            let password = '';
            let host = '';
            let port = 0;
            let workingLine = line;

            // 1. Protocol prefix (http://, https://, socks4://, socks5://, socks://)
            // Префикс протокола
            const prefixMatch = workingLine.match(/^(https?|socks[45]?):\/\//i);
            if (prefixMatch) {
                let p = prefixMatch[1].toUpperCase();
                explicitProtocol = (p === 'SOCKS') ? 'SOCKS5' : p;
                workingLine = workingLine.replace(prefixMatch[0], '').trim();
            }

            // 2. Protocol in square brackets [HTTP], [HTTPS], [SOCKS4], [SOCKS5]
            // Протокол в квадратных скобках
            const protoBracket = workingLine.match(/\[(HTTP|HTTPS|SOCKS4|SOCKS5|SOCKS)\]/i);
            if (protoBracket) {
                let p = protoBracket[1].toUpperCase();
                explicitProtocol = (p === 'SOCKS') ? 'SOCKS5' : p;
                workingLine = workingLine.replace(protoBracket[0], '').trim();
            }

            // 3. Name in square brackets [My Proxy Name]
            // Имя в квадратных скобках
            const nameBracket = workingLine.match(/\[([^\]]+)\]/);
            if (nameBracket) {
                name = nameBracket[1].trim();
                workingLine = workingLine.replace(nameBracket[0], '').trim();
            }

            // IMPORTANT: Do NOT remove all remaining square brackets - this would break IPv6!
            // ВАЖНО: НЕ удаляем все оставшиеся квадратные скобки - это ломает IPv6!

            // 4. Parse host and port / Парсинг хоста и порта
            let addressPart = workingLine;
            let authPart = '';

            // Separate user:pass@ (use last @) / Отделяем user:pass@ (используем последний @)
            const atIndex = workingLine.lastIndexOf('@');
            if (atIndex !== -1) {
                authPart = workingLine.substring(0, atIndex);
                addressPart = workingLine.substring(atIndex + 1).trim();

                const colonIndex = authPart.indexOf(':');
                if (colonIndex !== -1) {
                    username = authPart.substring(0, colonIndex).trim();
                    password = authPart.substring(colonIndex + 1).trim();
                } else {
                    username = authPart.trim();
                }
            }

            // Parse host:port or [IPv6]:port / Парсим host:port или [IPv6]:port
            let portSeparatorIndex = -1;

            // IPv6 in brackets - look for ']:' marker / IPv6 в скобках — ищем маркер ']:'
            if (addressPart.startsWith('[')) {
                const closingBracket = addressPart.indexOf(']');
                if (closingBracket !== -1 && addressPart[closingBracket + 1] === ':') {
                    portSeparatorIndex = closingBracket + 1;
                }
            }

            // Normal case - last colon / Обычный случай — последнее двоеточие
            if (portSeparatorIndex === -1) {
                portSeparatorIndex = addressPart.lastIndexOf(':');
            }

            // Fallback - space as separator / Запасной вариант — пробел как разделитель
            if (portSeparatorIndex === -1) {
                const partsBySpace = addressPart.split(/\s+/);
                if (partsBySpace.length >= 2) {
                    host = partsBySpace[0].trim();
                    port = parseInt(partsBySpace[1], 10);
                }
            } else {
                host = addressPart.substring(0, portSeparatorIndex).trim();
                port = parseInt(addressPart.substring(portSeparatorIndex + 1), 10);
            }

            // Remove square brackets around IPv6 / Убираем квадратные скобки вокруг IPv6
            if (host.startsWith('[') && host.endsWith(']')) {
                host = host.slice(1, -1);
            }

            // Validate host and port / Валидация хоста и порта
            if (!host || !port || isNaN(port) || port < 1 || port > 65535) continue;

            // 5. AUTO-DETECTION PROTOCOL / АВТООПРЕДЕЛЕНИЕ ПРОТОКОЛА
            let finalProtocol: string;
            
            if (explicitProtocol) {
                // User explicitly specified protocol / Пользователь явно указал протокол
                finalProtocol = explicitProtocol;
            } else if (autoDetectProtocol) {
                // AUTO-DETECT BY PORT - WORKS FOR 4145, 1080, etc.
                // АВТООПРЕДЕЛЕНИЕ ПО ПОРТУ - РАБОТАЕТ ДЛЯ 4145, 1080 И Т.Д.
                finalProtocol = ProxyImporter.detectProtocolByPort(port);
            } else {
                // Use default protocol / Используем протокол по умолчанию
                finalProtocol = defaultProtocol;
            }

            // Create proxy object / Создаем объект прокси
            const proxy = new ProxyServer();
            proxy.CopyFrom({
                name: name || `${host}:${port}`,
                host: host,
                port: port,
                protocol: finalProtocol,
                username: username,
                password: password,
                rating: 0,
                order: 999999
            });

            parsedProxies.push(proxy);
        }

        return parsedProxies;
    },

    /**
     * Parse JSON proxy list / Парсинг JSON списка прокси
     * Cross-browser: Standard JSON.parse works everywhere
     */
    parseJson: (jsonText: string, options?: ProxyServerSubscription): ProxyServer[] => {
        try {
            const data = JSON.parse(jsonText);
            if (!Array.isArray(data)) return null;

            const proxies: ProxyServer[] = [];
            for (const item of data) {
                if (typeof item === 'object' && item !== null) {
                    const proxy = new ProxyServer();
                    proxy.CopyFrom({
                        ...item,
                        rating: item.rating ?? 0,
                        order: item.order ?? 999999
                    });
                    proxies.push(proxy);
                }
            }
            return proxies;
        } catch (e) {
            Debug.error("ProxyImporter.parseJson failed", e);
            return null;
        }
    }
};