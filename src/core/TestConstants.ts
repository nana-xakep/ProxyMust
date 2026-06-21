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

/**
 * English: Shared constants for all proxy testers (IP services, error indicators)
 * Russian: Общие константы для всех тестеров прокси (IP-сервисы, индикаторы ошибок)
 */

export const IP_SERVICES: string[] = [
    'http://api.ipify.org?format=text',
    'http://ifconfig.me/ip',
    'http://checkip.amazonaws.com',
    'http://ipv4.icanhazip.com',
    'http://icanhazip.com',
	'http://ipecho.net/plain',
	'http://whatismyip.akamai.com',
    'http://l2.io/ip',
    'http://ip.tyk.nu',	
	'http://wtfismyip.com/text',
	'http://myexternalip.com/raw',
	'http://ip-api.com/line?fields=query',	
	'http://ipinfo.io/ip',
    'http://ip.brightfur.net/',	
];

export const ERROR_INDICATORS: string[] = [
	"Problem loading page", "chrome://favicon", "ERR_PROXY_CONNECTION_FAILED", "ERR_TIMED_OUT", "ERR_FAILED",
    "ERR_CONNECTION_TIMED_OUT", "ERR_FILE_NOT_FOUND", "ERR_CONNECTION_REFUSED",
    "ERR_TUNNEL_CONNECTION_FAILED", "ERR_SSL_PROTOCOL_ERROR", "ERR_NAME_NOT_RESOLVED",
    "ERR_NETWORK_ACCESS_DENIED", "ERR_INTERNET_DISCONNECTED", "ERR_NETWORK_CHANGED",
    "DNS_PROBE_FINISHED_NO_INTERNET", "DNS_PROBE_FINISHED_BAD_CONFIG",
    "ERR_PROXY_CERTIFICATE_INVALID", "ERR_SSL_PROXY_CERTIFICATE_INVALID",
    "Your file couldn’t be accessed", "Unable to connect", "This site can’t be reached",
    "No internet", "proxy server", "This page isn’t working", "Secure Connection Failed",
    "Proxy server is refusing connections", "Can't reach this page",
    "Hmm, we can't reach this page", "The connection has timed out",
    "Check your internet connection", "Please check your proxy settings",
    "Unable to find the proxy server", "Proxy connection failed",
    "The proxy server is refusing connections", "There is something wrong with the proxy server",
    "Нет интернета"
];

export const CERT_ERROR_INDICATORS: string[] = [
    "Privacy error", "Your connection is not private", "Your connection isn't private",
    "Secure Connection Failed", "Warning: Potential Security Risk Ahead", "Certificate Error",
    "This site is not secure", "This site can’t provide a secure connection",
    "Connection is not secure", "NET::ERR_CERT_AUTHORITY_INVALID",
    "NET::ERR_CERT_COMMON_NAME_INVALID", "NET::ERR_CERT_DATE_INVALID",
    "ERR_CERT_AUTHORITY_INVALID", "ERR_SSL_PROTOCOL_ERROR", "SEC_ERROR_UNKNOWN_ISSUER",
    "SEC_ERROR_EXPIRED_CERTIFICATE", "SEC_ERROR_OCSP_INVALID_SIGNING_CERT",
    "SEC_ERROR_REUSED_ISSUER_AND_SERIAL", "MOZILLA_PKIX_ERROR_MITM_DETECTED",
    "The certificate is not trusted", "This server could not prove that it is",
    "Software is Preventing Firefox From Safely Connecting to This Site",
    "Attackers might be trying to steal your information",
    "Ваше подключение не является конфиденциальным", "Ваше подключение не защищено",
    "Не удается подтвердить подлинность", "Ошибка сертификата",
    "Сайт угрожает безопасности вашего компьютера", "Ошибочный сертификат",
    "Ошибка в сертификате безопасности", "Это соединение является недоверенным"
];

/**
 * English: Timeout for automatic test lock release (10 minutes)
 * Russian: Таймаут автоматического сброса блокировки теста (10 минут)
 */
export const TEST_LOCK_TIMEOUT_MS = 10 * 60 * 1000;