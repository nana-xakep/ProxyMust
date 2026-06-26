/*
 * This file is part of ProxyMust.
 * Copyright (C) 2026 nana-xakep <xakep.nana@gmail.com>
 * English: Test log window controller – receives messages from background and displays them.
 * Russian: Контроллер окна лога тестирования – получает сообщения из фона и отображает их.
 */

import { api } from "../../lib/environment";
import { PolyFill } from "../../lib/PolyFill";

type LogEntry = {
    type: 'start' | 'ip' | 'page' | 'status' | 'next' | 'stop' | 'complete';
    timestamp?: number;
    [key: string]: any;
};

class TestLogController {
    private container: HTMLElement;
    private emptyState: HTMLElement;
    private history: LogEntry[] = [];

    constructor() {
        this.container = document.getElementById('logContainer') as HTMLElement;
        this.emptyState = document.getElementById('emptyState') as HTMLElement;

        this.bindEvents();
        this.requestHistory();

        // English: Localize the page / Russian: Локализация страницы
        this.localizePage();
    }

    private localizePage(): void {
        const elements = document.querySelectorAll('[data-localize]');
        elements.forEach(el => {
            const key = el.getAttribute('data-localize');
            if (key) {
                const msg = api.i18n.getMessage(key) || key;
                el.textContent = msg;
            }
        });
        // Update title
        const title = document.querySelector('title');
        if (title) {
            const msg = api.i18n.getMessage('testLogTitle') || 'Proxy Test Log';
            title.textContent = msg;
        }
    }

    private bindEvents(): void {
        // English: Clear button / Russian: Кнопка очистки
        document.getElementById('clearLogBtn')?.addEventListener('click', () => {
            this.clearLog();
        });

        // English: Close button / Russian: Кнопка закрытия
        document.getElementById('closeLogBtn')?.addEventListener('click', () => {
            this.closeWindow();
        });

        // English: Pin button / Russian: Кнопка закрепления
        const pinBtn = document.getElementById('pinLogBtn');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => {
                this.togglePin();
            });
        }

        // English: Listen to messages from background / Russian: Слушаем сообщения из фона
        api.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message && message.command === 'PROXY_TEST_STEP') {
                this.renderMessage(message.data);
                sendResponse({ success: true });
                return true;
            }
            // Direct data (without command wrapper)
            if (message && message.type) {
                this.renderMessage(message);
                sendResponse({ success: true });
                return true;
            }
            return false;
        });
    }

    private togglePin(): void {
        console.log('[TestLog] Toggle pin clicked');
        PolyFill.runtimeSendMessage({ command: 'TOGGLE_TEST_LOG_PIN' }, (response: any) => {
            console.log('[TestLog] Toggle pin response:', response);
            if (response && response.success) {
                const pinBtn = document.getElementById('pinLogBtn');
                if (pinBtn) {
                    if (response.pinned) {
                        pinBtn.classList.add('pinned');
                        pinBtn.querySelector('span')!.textContent = api.i18n.getMessage('settingsContextMenuUnpin') || 'Unpin';
                    } else {
                        pinBtn.classList.remove('pinned');
                        pinBtn.querySelector('span')!.textContent = api.i18n.getMessage('settingsContextMenuSetPin') || 'Pin';
                    }
                }
            }
        });
    }

    private requestHistory(): void {
        PolyFill.runtimeSendMessage({ command: 'GET_TEST_LOG_HISTORY' }, (response: any) => {
            if (response && response.history && response.history.length) {
                // English: Render historical messages / Russian: Отображаем исторические сообщения
                this.history = response.history;
                this.history.forEach(msg => this.renderMessage(msg, true));
            } else {
                // Show waiting message
                if (this.emptyState) this.emptyState.style.display = 'block';
            }
        });
    }

    private renderMessage(msg: LogEntry, isHistory: boolean = false): void {
        const ts = msg.timestamp || Date.now();
        const timeStr = this.formatTime(ts);

        let messageHtml = '';
        let entryClass = '';

        switch (msg.type) {
            case 'start': {
                const proxyLabel = msg.proxyLabel || `${msg.host}:${msg.port}`;
                const countryCode = msg.countryCode ? msg.countryCode.toUpperCase() : '';
                const flag = countryCode ? this.getFlagEmoji(countryCode) : '';
                const flagHtml = flag ? `<span class="flag-emoji">${flag}</span> <span class="color-start">${this.escapeHtml(countryCode)}</span>` : '';
                const proto = msg.protocol || 'HTTP';
                const progress = msg.total ? ` (${msg.current}/${msg.total})` : '';
                const labelProxy = this.t('testLogLabelProxy');
                messageHtml = `<span class="action-label color-start">${this.escapeHtml(labelProxy)}</span> <span class="color-start">${this.escapeHtml(proxyLabel)}</span>${flagHtml ? ` <span class="color-start">${flagHtml}</span>` : ''}<span class="color-progress"> ${this.escapeHtml(proto)}</span><span class="color-progress">${this.escapeHtml(progress)}</span>`;
                break;
            }
            case 'ip': {
                if (msg.ip) {
                    messageHtml = `<span class="color-ip-success">${this.escapeHtml(this.t('testLogIpSuccess', msg.ip))}</span>`;
                } else {
                    messageHtml = `<span class="color-ip-fail">${this.escapeHtml(this.t('testLogIpFail'))}</span>`;
                }
                break;
            }
            case 'page': {
                const site = msg.site ? msg.site.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
                const labelSite = this.t('testLogLabelSite');
                if (msg.pageSuccess) {
                    messageHtml = `<span class="action-label color-page-success">${this.escapeHtml(labelSite)}</span> <span class="color-page-success">${this.escapeHtml(site)} — ${this.escapeHtml(this.t('testLogPageAvailable'))}</span>`;
                } else {
                    messageHtml = `<span class="action-label color-page-fail">${this.escapeHtml(labelSite)}</span> <span class="color-page-fail">${this.escapeHtml(site)} — ${this.escapeHtml(this.t('testLogPageUnavailable'))}</span>`;
                }
                break;
            }
            case 'status': {
                const localizedStatus = this.getStatusText(msg.status);
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
                const labelStatus = this.t('testLogLabelStatus');
                messageHtml = `<span class="action-label ${colorClass}">${this.escapeHtml(labelStatus)}</span> <span class="${colorClass}">${icon} ${this.escapeHtml(localizedStatus)}</span>`;
                break;
            }
            case 'next': {
                messageHtml = `<span class="action-label color-progress">→</span> <span class="color-progress">${this.escapeHtml(this.t('testLogNext'))}</span>`;
                break;
            }
            case 'stop': {
                entryClass = 'stop-message';
                messageHtml = `<span class="color-stop">⏹ ${this.escapeHtml(this.t('testLogStop'))}</span>`;
                break;
            }
            case 'complete': {
                entryClass = 'complete-message';
                messageHtml = `<span class="color-complete">🏁 ${this.escapeHtml(this.t('testLogComplete'))}</span>`;
                break;
            }
            default: {
                messageHtml = `<span>${this.escapeHtml(msg.message || '')}</span>`;
            }
        }

        const fullHtml = `
            <span class="log-time">${timeStr}</span>
            <span class="log-message">${messageHtml}</span>
        `;

        this.addLogEntry(fullHtml, entryClass, isHistory);
    }

    private addLogEntry(html: string, className: string = '', isHistory: boolean = false): void {
        // Remove empty state if present
        if (this.emptyState) this.emptyState.style.display = 'none';

        const entry = document.createElement('div');
        entry.className = 'log-entry' + (className ? ' ' + className : '');
        entry.innerHTML = html;
        this.container.appendChild(entry);

        // Auto-scroll to bottom (skip for history to avoid jumping)
        if (!isHistory) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }

    private clearLog(): void {
        this.container.innerHTML = '';
        // Re-add empty state
        if (this.emptyState) {
            this.container.appendChild(this.emptyState);
            this.emptyState.style.display = 'block';
        }
        // Also clear history in background
        PolyFill.runtimeSendMessage({ command: 'CLEAR_TEST_LOG_HISTORY' });
    }

    private closeWindow(): void {
        PolyFill.runtimeSendMessage({ command: 'CLOSE_TEST_LOG' }, () => {
            window.close();
        });
    }

    // ===== Helpers =====

    private formatTime(ts: number): string {
        const d = new Date(ts);
        return d.toTimeString().slice(0, 8);
    }

    private escapeHtml(str: string): string {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    private getFlagEmoji(countryCode: string): string {
        if (!countryCode) return '';
        const code = countryCode.toUpperCase();
        if (code.length !== 2) return '';
        const base = 0x1F1E6;
        return String.fromCodePoint(
            base + code.charCodeAt(0) - 65,
            base + code.charCodeAt(1) - 65
        );
    }

    private t(key: string, ...args: any[]): string {
        let msg = api.i18n.getMessage(key) || key;
        if (args.length) {
            msg = msg.replace(/\{(\d+)\}/g, (match, num) => {
                const idx = parseInt(num, 10);
                return args[idx] !== undefined ? String(args[idx]) : match;
            });
        }
        return msg;
    }
	    private getStatusText(status: string): string {
        switch (status) {
            case 'success': return this.t('testLogStatusSuccess');
            case 'indirect': return this.t('testLogStatusIndirect');
            case 'fail': return this.t('testLogStatusFail');
            case 'ip-only': return this.t('testLogStatusIpOnly');
            default: return this.t('testLogStatusUnknown');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TestLogController();
});