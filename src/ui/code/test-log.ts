/*
 * This file is part of ProxyMust.
 * Copyright (C) 2026 nana-xakep <xakep.nana@gmail.com>
 * English: Test log window controller – receives messages from background and displays them.
 * Russian: Контроллер окна лога тестирования – получает сообщения из фона и отображает их.
 */

import { renderLogMessage, resetAntiDuplicate } from "./logRenderer";
import { api } from "../../lib/environment";

(function() {
    'use strict';

    const container = document.getElementById('logContainer');
    const emptyState = document.getElementById('emptyState');

    // English: Clear log / Russian: Очистить лог
    document.getElementById('clearLogBtn').addEventListener('click', () => {
        if (container) {
            container.innerHTML = '';
            resetAntiDuplicate();
            if (emptyState) {
                container.appendChild(emptyState);
                emptyState.style.display = 'block';
            }
        }
    });

    // English: Close window / Russian: Закрыть окно
    document.getElementById('closeLogBtn').addEventListener('click', () => {
        api.runtime.sendMessage({ command: 'CLOSE_TEST_LOG' }, () => {
            window.close();
        });
    });

    // English: Pin button / Russian: Кнопка закрепления
    document.getElementById('pinLogBtn').addEventListener('click', () => {
        api.runtime.sendMessage({ command: 'TOGGLE_TEST_LOG_PIN' }, (response) => {
            if (response && response.success) {
                const pinBtn = document.getElementById('pinLogBtn');
                if (pinBtn) {
                    if (response.pinned) {
                        pinBtn.classList.add('pinned');
                        pinBtn.querySelector('span').textContent = api.i18n.getMessage('settingsContextMenuUnpin') || 'Unpin';
                    } else {
                        pinBtn.classList.remove('pinned');
                        pinBtn.querySelector('span').textContent = api.i18n.getMessage('settingsContextMenuSetPin') || 'Pin';
                    }
                }
            }
        });
    });

    // English: Listen to messages from background / Russian: Слушаем сообщения из фона
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.command === 'PROXY_TEST_STEP') {
            if (container) {
                renderLogMessage(container, message.data);
            }
            sendResponse({ success: true });
            return true;
        }
        if (message && message.type) {
            if (container) {
                renderLogMessage(container, message);
            }
            sendResponse({ success: true });
            return true;
        }
        return false;
    });

    // English: On load, request the history from background / Russian: При загрузке запросить историю из фона
    api.runtime.sendMessage({ command: 'GET_TEST_LOG_HISTORY' }, (response) => {
        if (response && response.history && response.history.length) {
            if (container) {
                response.history.forEach(msg => renderLogMessage(container, msg));
                if (emptyState) emptyState.style.display = 'none';
            }
        } else {
            if (emptyState) emptyState.style.display = 'block';
        }
    });
})();