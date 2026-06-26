// src/core/LocalProxyChecker.ts

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

import { ProxyServer } from "./definitions";
import { checkProxy, CheckResult, CheckerOptions } from "./ProxyCheckerCore";
import { saveResult } from "./ResultSaver";
import { api } from "../lib/environment";

type CheckResultExtended = {
    alive: boolean;
    latencyMs: number;
    statusType: "success" | "indirect" | "ip-only" | "fail";
    error?: string;
};

export const LocalProxyChecker = {
    /**
     * English: Performs a thorough (precise) check of a single proxy.
     * Russian: Выполняет тщательную (точную) проверку одного прокси.
     */
    async checkProxy(
        proxy: ProxyServer,
        testUrls: string[],
        requireAll: boolean = false,
        _timeoutMs: number = 20000,
        retryForDirectIp: boolean = true
    ): Promise<CheckResultExtended> {
        const testUrl = testUrls[0]?.trim() || "";
        if (!testUrl) {
            return { alive: false, latencyMs: 0, statusType: "fail", error: api.i18n.getMessage('proxyCheckerEmptyUrl') };
        }

        const options: CheckerOptions = {
            mainTimeout: 20000,
            extendedTimeout: 30000,
            faviconInterval: 300,
            ipCheckDelay: 70,
            retryOnDirectIp: retryForDirectIp,
            useExpressMode: false
        };

        const result: CheckResult = await checkProxy(proxy, testUrl, options);
        const status = result.status; // use status directly from checkProxy
        await saveResult(proxy.id, testUrl, status);

        return {
            alive: result.alive,
            latencyMs: result.latencyMs,
            statusType: status,
            error: result.error
        };
    },

    /**
     * English: Force close the hidden test window if it exists (no-op now, kept for API compatibility).
     * Russian: Принудительно закрыть скрытое тестовое окно, если оно существует (ничего не делает, оставлено для совместимости API).
     */
    async forceCloseHiddenWindow(): Promise<void> {
        console.log(`[LocalProxyChecker] forceCloseHiddenWindow вызван, но скрытого окна нет`);
    }
};