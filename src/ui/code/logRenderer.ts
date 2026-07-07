/*
 * This file is part of ProxyMust.
 * Copyright (C) 2026 nana-xakep <xakep.nana@gmail.com>
 * English: Unified log message renderer for both embedded and floating log windows.
 * Russian: Унифицированный рендерер сообщений лога для встроенного и плавающего окон.
 */

import { api } from "../../lib/environment";

// ==================== Helpers ====================

/**
 * Format timestamp to HH:MM:SS
 */
export function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8);
}

/**
 * Escape HTML entities
 */
export function escapeHtml(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Get flag emoji from country code
 */
export function getFlagEmoji(countryCode: string): string {
    if (!countryCode) return '';
    const code = countryCode.toUpperCase();
    if (code.length !== 2) return '';
    const base = 0x1F1E6;
    return String.fromCodePoint(
        base + code.charCodeAt(0) - 65,
        base + code.charCodeAt(1) - 65
    );
}

/**
 * Get localized status text
 */
export function getStatusText(status: string): string {
    switch (status) {
        case 'success': return api.i18n.getMessage('testLogStatusSuccess') || 'SUCCESS';
        case 'indirect': return api.i18n.getMessage('testLogStatusIndirect') || 'INDIRECT SUCCESS';
        case 'fail': return api.i18n.getMessage('testLogStatusFail') || 'FAIL';
        case 'ip-only': return api.i18n.getMessage('testLogStatusIpOnly') || 'IP ONLY';
        default: return api.i18n.getMessage('testLogStatusUnknown') || 'UNKNOWN';
    }
}

/**
 * Localization helper with parameter substitution
 */
export function t(key: string, ...args: any[]): string {
    let msg = api.i18n.getMessage(key) || key;
    if (args.length) {
        msg = msg.replace(/\{(\d+)\}/g, (match, num) => {
            const idx = parseInt(num, 10);
            return args[idx] !== undefined ? String(args[idx]) : match;
        });
    }
    return msg;
}

// ==================== Anti-duplicate logic (new) ====================

// English: Store the last rendered HTML string to detect duplicates.
// Russian: Храним последнюю отрендеренную HTML-строку для обнаружения дублей.
let lastRenderedHtml: string | null = null;

/**
 * English: Resets the anti-duplicate cache (call when clearing log or starting new test).
 * Russian: Сбрасывает кэш антидубля (вызывать при очистке лога или старте нового теста).
 */
export function resetAntiDuplicate(): void {
    lastRenderedHtml = null;
}

// ==================== Main renderer ====================

export function renderLogMessage(container: HTMLElement, msg: any): void {
    if (!container) {
        console.warn('[logRenderer] container not found');
        return;
    }

    const emptyState = container.querySelector('#emptyState');
    if (emptyState) emptyState.remove();

    const timeStr = formatTime(msg.timestamp || Date.now());
    let messageHtml = '';
    let entryClass = '';

    // --- Generate HTML for the message (same as before) ---
    switch (msg.type) {
        case 'info': {
            const icon = '🔍';
            const text = escapeHtml(msg.message || '');
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-progress">${icon} ${text}</span></span>`;
            break;
        }
        case 'direct-ip': {
            const directIp = msg.ip || 'unknown';
            const label = t('testLogDirectIp', directIp);
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-direct-ip">🌐 ${escapeHtml(label)}</span></span>`;
            break;
        }
        case 'start': {
            const proxyLabel = `${msg.host}:${msg.port}`;
            const countryCode = msg.countryCode ? msg.countryCode.toUpperCase() : '';
            const flag = countryCode ? getFlagEmoji(countryCode) : '';
            const flagHtml = flag ? `<span class="flag-emoji">${flag}</span> <span class="color-start">${escapeHtml(countryCode)}</span>` : '';
            const proto = msg.protocol || 'HTTP';
            const progress = msg.total ? ` (${msg.current}/${msg.total})` : '';
            const labelProxy = t('testLogLabelProxy');
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="action-label color-start">${escapeHtml(labelProxy)}</span><span class="color-start">${escapeHtml(proxyLabel)}</span>${flagHtml ? `<span class="color-start"> ${flagHtml}</span>` : ''}<span class="color-progress"> ${escapeHtml(proto)}</span><span class="color-progress">${escapeHtml(progress)}</span></span>`;
            break;
        }
        case 'ip': {
            let extraHtml = '';
            if (msg.ip) {
                const ipText = escapeHtml(msg.ip);
                if (msg.directIp && msg.isMatch !== undefined) {
                    if (msg.isMatch) {
                        extraHtml = ` <span class="color-ip-match">⚠️ ${escapeHtml(t('testLogIpMatch'))}</span>`;
                    } else {
                        extraHtml = ` <span class="color-ip-mismatch">☑️ ${escapeHtml(t('testLogIpMismatch', msg.directIp))}</span>`;
                    }
                }
                messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-ip-success">${escapeHtml(t('testLogIpSuccess', ipText))}</span>${extraHtml}</span>`;
            } else {
                messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-ip-fail">${escapeHtml(t('testLogIpFail'))}</span></span>`;
            }
            break;
        }
        case 'page': {
            const site = msg.site ? msg.site.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
            const labelSite = t('testLogLabelSite');
            if (msg.pageSuccess) {
                messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="action-label color-page-success">${escapeHtml(labelSite)}</span><span class="color-page-success">${escapeHtml(site)} — ${escapeHtml(t('testLogPageAvailable'))}</span></span>`;
            } else {
                messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="action-label color-page-fail">${escapeHtml(labelSite)}</span><span class="color-page-fail">${escapeHtml(site)} — ${escapeHtml(t('testLogPageUnavailable'))}</span></span>`;
            }
            break;
        }
        case 'status': {
            const localizedStatus = getStatusText(msg.status);
            let colorClass = 'color-status-unknown';
            let icon = '❔';
            if (msg.status === 'success') {
                colorClass = 'color-status-success';
                icon = '✅';
            } else if (msg.status === 'indirect') {
                colorClass = 'color-status-indirect';
                icon = '☑️';
            } else if (msg.status === 'fail') {
                colorClass = 'color-status-fail';
                icon = '❌';
            } else {
                colorClass = 'color-status-unknown';
                icon = '❔';
            }
            const labelStatus = t('testLogLabelStatus');
            let hostInfo = '';
            if (msg.host && msg.port) {
                const flag = msg.countryCode ? getFlagEmoji(msg.countryCode) : '';
                const flagHtml = flag ? `<span class="flag-emoji">${flag}</span> ` : '';
                hostInfo = ` ${flagHtml}${escapeHtml(msg.host)}:${msg.port}`;
                if (msg.protocol) {
                    hostInfo += ` ${escapeHtml(msg.protocol)}`;
                }
            }
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="action-label ${colorClass}">${escapeHtml(labelStatus)}</span><span class="${colorClass}">${icon} ${escapeHtml(localizedStatus)}</span>${hostInfo}</span>`;
            break;
        }
        case 'next': {
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="action-label color-progress">→</span><span class="color-progress">${escapeHtml(t('testLogNext'))}</span></span>`;
            break;
        }
        case 'stop': {
            entryClass = 'stop-message';
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-stop">⏹ ${escapeHtml(t('testLogStop'))}</span></span>`;
            break;
        }
        case 'complete': {
            entryClass = 'complete-message';
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-complete">🏁 ${escapeHtml(t('testLogComplete'))}</span></span>`;
            break;
        }
        case 'protocol-retry': {
            const host = msg.host || 'unknown';
            const port = msg.port || '?';
            const original = msg.originalProtocol || 'unknown';
            const newProto = msg.newProtocol || 'unknown';
            let label: string;
            if (msg.isFirstAttempt) {
                label = t('testLogProtocolRetry', host, String(port), original, newProto);
            } else {
                label = t('testLogProtocolRetryFull', newProto, host, String(port));
            }
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-protocol-retry">${escapeHtml(label)}</span></span>`;
            break;
        }
        case 'readiness': {
            let proxyLabel = msg.proxyId || 'unknown';
            if (msg.host && msg.port) {
                const flag = msg.countryCode ? getFlagEmoji(msg.countryCode) : '';
                const flagHtml = flag ? `<span class="flag-emoji">${flag}</span> ` : '';
                const protocol = msg.protocol ? ` <strong style="font-size:1.1em;">${escapeHtml(msg.protocol)}</strong>` : '';
                proxyLabel = `${flagHtml}${escapeHtml(msg.host)}:${msg.port}${protocol}`;
            }
            const relevantChecks = (msg.checks || []).filter((c: any) =>
                ['active_profile', 'ip_request', 'browser_action'].includes(c.name)
            );
            const passed = relevantChecks.filter(c => c.passed).length;
            const total = relevantChecks.length;
            const overall = passed === total && total > 0;

            const checksText = relevantChecks.map((c: any) =>
                `${c.passed ? '✅' : '❌'} ${c.name} (${c.duration}ms)`
            ).join(' | ');

            const overallText = overall ? '✅ READY' : '❌ NOT READY';
            let label = t('testLogReadiness', proxyLabel, String(passed), String(total), overallText);
            // Обёртываем статус в цветной span
            if (overall) {
                label = label.replace('✅ READY', '<span class="color-readiness-ready">✅ READY</span>');
            } else {
                label = label.replace('❌ NOT READY', '<span class="color-readiness-notready">❌ NOT READY</span>');
            }
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-readiness">🔬 ${label}</span>` +
                (checksText ? `<span class="color-readiness-details"> | ${escapeHtml(checksText)}</span>` : '') + `</span>`;
            break;
        }
        case 'protocol-changed': {
            const host = msg.host || 'unknown';
            const port = msg.port || '?';
            if (msg.success) {
                const newProtocol = msg.detectedProtocol || 'unknown';
                let label = t('testLogProtocolChanged', newProtocol, host, String(port));
                if (msg.ip) {
                    label += ` (IP: ${escapeHtml(msg.ip)})`;
                }
                messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-protocol-changed-success">${escapeHtml(label)}</span></span>`;
            } else {
                const failedProtocols = (msg.failedProtocols || []).join(', ');
                const label = t('testLogProtocolChangeFailed', host, String(port), failedProtocols);
                messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message"><span class="color-protocol-changed-fail">❌ ${escapeHtml(label)}</span></span>`;
            }
            break;
        }
        default: {
            // Fallback for unknown types
            messageHtml = `<span class="log-time">${timeStr}</span><span class="log-message">${escapeHtml(msg.message || JSON.stringify(msg))}</span>`;
        }
    }

    // --- Anti-duplicate check: compare with last rendered HTML ---
    // English: Debug logging for duplicate detection
    // Russian: Отладочное логирование для обнаружения дублей
 //   console.log('[logRenderer] New message:', messageHtml);
 //   console.log('[logRenderer] Last message:', lastRenderedHtml);
    if (lastRenderedHtml === messageHtml) {
 //       console.log('[logRenderer] Duplicate detected, skipping.');
        return;
    }

    // English: Update last rendered HTML and add to DOM
    // Russian: Обновляем последнюю отрендеренную HTML-строку и добавляем в DOM
    lastRenderedHtml = messageHtml;

    const entry = document.createElement('div');
    entry.className = 'log-entry' + (entryClass ? ' ' + entryClass : '');
    entry.innerHTML = messageHtml;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}