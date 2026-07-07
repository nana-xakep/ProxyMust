// src/core/ExpressProxyChecker.ts

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

type QuickCheckResult = {
    alive: boolean;
    latencyMs: number;
    statusType: "success" | "indirect" | "ip-only" | "fail";
    ip?: string;
    error?: string;
};

/**
 * English: Quick (express) check of a single proxy.
 * Russian: Быстрая (экспресс) проверка одного прокси.
 */
export async function quickCheckProxy(
    proxy: ProxyServer,
    testUrl: string,
    retryForDirectIp: boolean = true
): Promise<QuickCheckResult> {
    const options: CheckerOptions = {
        mainTimeout: 8000,
        extendedTimeout: 20000,
        faviconInterval: 150,
        ipCheckDelay: 70,
        retryOnDirectIp: retryForDirectIp,
        useExpressMode: true,
        skipProtocolDetection: false
    };

    const result: CheckResult = await checkProxy(proxy, testUrl, options);
    const status = result.status;
    await saveResult(proxy.id, testUrl, status);

    return {
        alive: result.alive,
        latencyMs: result.latencyMs,
        statusType: status,
        ip: result.ip || undefined,
        error: result.error
    };
}

/**
 * English: Force close the hidden test window if it exists (no-op now, kept for API compatibility).
 * Russian: Принудительно закрыть скрытое тестовое окно, если оно существует (ничего не делает, оставлено для совместимости API).
 */
export async function forceCloseHiddenWindow(): Promise<void> {
    console.log(`[ExpressChecker] forceCloseHiddenWindow вызван, но скрытого окна нет`);
}