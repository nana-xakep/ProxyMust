/*
 * This file is part of SmartProxy <https://github.com/salarcode/SmartProxy>,
 * Copyright (C) 2024 Salar Khalilzadeh <salar2k@gmail.com>
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
 * - Added Universal domain extractor import format.
 * - Added informative error messages for Universal import.
 * - Added debug logging.
 */
import { Utils } from './Utils';
import { api } from './environment';
import {
	IExternalRulesConfig,
	ExternalRulesFormat,
	SubscriptionProxyRule,
	ProxyRule,
	CompiledProxyRuleType,
	ImportedProxyRule,
} from '../core/definitions';
import { ProxyEngineSpecialRequests } from '../core/ProxyEngineSpecialRequests';
import * as ruleImporterSwitchyScript from './RuleImporterSwitchy';

/**
 * English: Extracts domains from any text, ignoring syntax and formatting.
 * Russian: Извлекает домены из любого текста, игнорируя синтаксис и форматирование.
 */
function extractDomainsFromText(text: string): string[] {
    console.log('[RuleImporter] extractDomainsFromText вызван, длина текста:', text.length);
    const lines = text.split(/\r?\n/);
    const domains: string[] = [];
    // English: Regular expression to find domains (at least two levels, without ports and paths).
    // Russian: Регулярка для поиска доменов (как минимум два уровня, без портов и путей).
    const domainRegex = /(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/.*)?/g;
    // English: For strings with || (GFWList style).
    // Russian: Для строк с || (стиль GFWList).
    const pipeRegex = /\|\|([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

    for (const line of lines) {
        const trimmed = line.trim();
        // English: Skip empty lines and comments.
        // Russian: Пропускаем пустые строки и комментарии.
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#') || trimmed.startsWith('//')) {
            continue;
        }
        let domain: string | null = null;
        // English: Check for ||domain.com pattern.
        // Russian: Проверяем на шаблон ||domain.com.
        const pipeMatch = pipeRegex.exec(trimmed);
        if (pipeMatch) {
            domain = pipeMatch[1];
            // English: Clean domain from www. and validate.
            // Russian: Очищаем домен от www. и проверяем валидность.
            if (domain.startsWith('www.')) {
                domain = domain.substring(4);
            }
            if (domain.includes('.') && !/\s/.test(domain)) {
                domains.push(domain);
                console.log(`[RuleImporter] Извлечён домен (||): ${domain}`);
            }
        } else {
            // English: Find all domains in the line.
            // Russian: Ищем все домены в строке.
            const matches = trimmed.match(domainRegex);
            if (matches && matches.length > 0) {
                // English: Process each found domain.
                // Russian: Обрабатываем каждый найденный домен.
                for (const match of matches) {
                    let candidate = match;
                    // English: Remove protocol.
                    // Russian: Убираем протокол.
                    candidate = candidate.replace(/^https?:\/\//, '');
                    // English: Remove port.
                    // Russian: Убираем порт.
                    candidate = candidate.replace(/:\d+/, '');
                    // English: Remove path.
                    // Russian: Убираем путь.
                    candidate = candidate.split('/')[0];
                    let domain = candidate;
                    // English: Remove www. prefix.
                    // Russian: Убираем префикс www.
                    if (domain.startsWith('www.')) {
                        domain = domain.substring(4);
                    }
                    // English: Validate that the domain looks valid (contains a dot and no spaces).
                    // Russian: Проверяем, что домен выглядит валидным (содержит точку и не содержит пробелов).
                    if (domain.includes('.') && !/\s/.test(domain)) {
                        domains.push(domain);
                        console.log(`[RuleImporter] Извлечён домен: ${domain}`);
                    }
                }
            }
        }
    }
    // English: Remove duplicates.
    // Russian: Убираем дубликаты.
    const unique = Array.from(new Set(domains));
    console.log(`[RuleImporter] Извлечено ${unique.length} уникальных доменов.`);
    return unique;
}

export const RuleImporter = {
	readFromServerAndImport(rulesConfig: IExternalRulesConfig, success?: Function, fail?: Function) {
		if (!rulesConfig || !rulesConfig.url) {
			if (fail) fail();
			return;
		}
		if (!success) throw 'onSuccess callback is mandatory';

		function ajaxSuccess(response: any) {
			if (!response) {
				if (fail)
					fail();
				return;
			}
			RuleImporter.importRulesBatch(
				rulesConfig,
				response,
				null,
				false,
				null,
				(importResult: {
					success: boolean;
					message: string;
					rules: {
						whiteList: ImportedProxyRule[];
						blackList: ImportedProxyRule[];
					};
				}) => {
					if (!importResult.success) {
						if (fail) fail(importResult);
						return;
					}
					if (success) success(importResult);
				},
				(error: Error) => {
					if (fail) fail(error);
				},
			);
		}

		if (rulesConfig.applyProxy !== null) {
			// English: Mark this request as special.
			// Russian: Отмечаем этот запрос как специальный.
			ProxyEngineSpecialRequests.setSpecialUrl(rulesConfig.url, rulesConfig.applyProxy);
		}

		let fetchRequest: RequestInit = {
			method: 'GET',
			cache: 'no-store'
		};
		if (rulesConfig.username) {
			let pass = atob(rulesConfig.password);
			fetchRequest.headers =
			{
				'Authorization': 'Basic ' + btoa(rulesConfig.username + ':' + pass)
			};
		}
		fetch(rulesConfig.url, fetchRequest)
			.then((response) => response.text())
			.then((result) => {
				ajaxSuccess(result);
			})
			.catch((error) => {
				if (fail) fail(error);
			});
	},
	importRulesBatch(
		rulesConfig: IExternalRulesConfig,
		text: string | ArrayBuffer,
		file: any,
		noDuplicates: boolean,
		currentRules: ProxyRule[],
		success: Function,
		fail?: Function
	) {
		if (!file && !text) {
			if (fail) fail();
			return;
		}

		if (text) {
			try {
				doImport(text as string, rulesConfig);
			} catch (e) {
				if (fail) fail(e);
			}
		} else {
			let reader = new FileReader();
			reader.onerror = (event) => {
				if (fail) fail(event);
			};
			reader.onload = (event) => {
				let fileText = reader.result;
				try {
					doImport(fileText as string, rulesConfig);
				} catch (e) {
					if (fail) fail(e);
				}
			};
			reader.readAsText(file);
		}
		function doImport(text: string, rulesConfig: IExternalRulesConfig) {
			if (rulesConfig.obfuscation?.toLowerCase() == 'base64') {
				// English: Decode base64.
				// Russian: Декодируем base64.
				text = Utils.b64DecodeUnicode(text);
			}

			let rules: {
				whiteList: ImportedProxyRule[];
				blackList: ImportedProxyRule[];
			};

			// English: Universal domain extraction – ignores format and extracts all domains.
			// Russian: Универсальное извлечение доменов – игнорирует формат и извлекает все домены.
			if (rulesConfig && rulesConfig.format == ExternalRulesFormat.Universal) {
				const domains = extractDomainsFromText(text);
				if (domains.length === 0) {
					// English: No domains found – inform the user.
					// Russian: Домены не найдены – сообщаем пользователю.
					const msg = api.i18n.getMessage('settingsImportRulesUniversalNoDomains') || 'No domains could be extracted from the text.';
					if (fail) fail(new Error(msg));
					return;
				}
				const blackList: ImportedProxyRule[] = domains.map(d => {
					const rule = new ImportedProxyRule();
					rule.search = d;
					rule.name = d;
					rule.importedRuleType = CompiledProxyRuleType.SearchDomainSubdomain;
					return rule;
				});
				rules = {
					whiteList: [],
					blackList: blackList,
				};
				console.log(`[RuleImporter] Универсальный импорт: извлечено ${domains.length} доменов.`);
			} else if (rulesConfig && rulesConfig.format == ExternalRulesFormat.AutoProxy) {
				// English: Check GFWList format.
				// Russian: Проверяем формат GFWList.
				if (!externalAppRuleParser.GFWList.detect(text, false)) {
					// English: Format not detected – provide hint.
					// Russian: Формат не распознан – даём подсказку.
					const msg = api.i18n.getMessage('settingsImportRulesAutoProxyHint') || 'Text must start with "[AutoProxy]" for GFWList format.';
					if (fail) fail(new Error(msg));
					return;
				}
				rules = externalAppRuleParser.GFWList.parse(text);
			} else if (rulesConfig && rulesConfig.format == ExternalRulesFormat.SwitchyOmega) {
				// English: Parse SwitchyOmega format.
				// Russian: Парсим формат SwitchyOmega.
				let switchyRules = externalAppRuleParser.Switchy.parseAndCompile(text);

				if (!switchyRules || !switchyRules.compiled) {
					if (fail) fail(new Error('SwitchyOmega format not recognized.'));
					return;
				}
				let blackListRules = externalAppRuleParser.Switchy.convertToProxyRule(switchyRules.compiled);
				rules = {
					blackList: blackListRules,
					whiteList: [],
				};
			} else {
				// English: Unknown format.
				// Russian: Неизвестный формат.
				if (fail) fail(new Error('Unknown import format.'));
				return;
			}

			// English: Remove duplicates if requested.
			// Russian: Удаляем дубликаты, если запрошено.
			if (noDuplicates) {
				if (!currentRules)
					currentRules = [];
				rules.blackList = rules.blackList || [];
				rules.whiteList = rules.whiteList || [];

				function deduplicateRules(importedRules: ImportedProxyRule[], shouldBeWhiteList: boolean = false): ImportedProxyRule[] {
					let uniqueRuleList: ImportedProxyRule[] = [];

					for (let importedRule of importedRules) {
						let convertedRule = importedRule.getProxyRule();

						let ruleExists = currentRules.some((rule) => 
							rule.ruleType == convertedRule.ruleType &&
								rule.ruleSearch == convertedRule.ruleSearch &&
								rule.ruleRegex == convertedRule.ruleRegex &&
								(!shouldBeWhiteList || (shouldBeWhiteList && rule.whiteList))
						);
						if (ruleExists)
							continue;

						uniqueRuleList.push(importedRule);
					}

					return uniqueRuleList;
				}

				let parsedRulesCount = rules.blackList.length + rules.whiteList.length;

				rules.blackList = deduplicateRules(rules.blackList);
				rules.whiteList = deduplicateRules(rules.whiteList, true);

				let finalRulesCount = rules.blackList.length + rules.whiteList.length;

				let message = api.i18n
					.getMessage('importerImportSuccess')
					.replace('{0}', finalRulesCount.toString())
					.replace('{1}', parsedRulesCount.toString());

				if (success) {
					success({
						success: true,
						message: message,
						rules: rules,
					});
				}

			} else {
				let message = api.i18n
					.getMessage('importerImportRulesSuccess')
					.replace('{0}', rules.blackList.length)
					.replace('{1}', rules.whiteList.length);

				if (success) {
					success({
						success: true,
						message: message,
						rules: rules,
					});
				}
			}
		}
	},
	importAutoProxy(file: any, append: any, currentRules: any, success: Function, fail: Function) {
		if (!file) {
			if (fail) fail();
			return;
		}

		let reader = new FileReader();
		reader.onerror = (event) => {
			if (fail) fail(event);
		};
		reader.onload = (event) => {
			let fileText = reader.result;

			try {
				let parsedRuleList = externalAppRuleParser.AutoProxy.parse(fileText);

				let importedRuleList = [];

				for (let parsedRule of parsedRuleList) {
					let convertResult = externalAppRuleParser.AutoProxy.convertAutoProxyRule(
						parsedRule.condition.pattern,
						parsedRule.condition.conditionType,
					);
					if (!convertResult.success) {
						continue;
					}

					importedRuleList.push({ pattern: convertResult.pattern, source: convertResult.source, enabled: true });
				}

				importedRuleList = Utils.removeDuplicates(importedRuleList, 'pattern');

				if (append) {
					if (!currentRules) currentRules = [];

					let appendedRuleList = currentRules.slice();
					let appendedRuleCount = 0;

					for (let importedRule of importedRuleList) {
						let ruleExists = currentRules.some((rule: any) => {
							rule.pattern == importedRule.pattern;
						});
						if (ruleExists) continue;

						appendedRuleList.push(importedRule);
						appendedRuleCount++;
					}

					let message = api.i18n
						.getMessage('importerImportSuccess')
						.replace('{0}', appendedRuleCount.toString())
						.replace('{1}', parsedRuleList.length.toString());

					if (success) {
						success({
							success: true,
							message: message,
							result: appendedRuleList,
						});
					}
				} else {
					let message = api.i18n
						.getMessage('importerImportSuccess')
						.replace('{0}', importedRuleList.length.toString())
						.replace('{1}', parsedRuleList.length.toString());

					if (success) {
						success({
							success: true,
							message: message,
							result: importedRuleList,
						});
					}
				}
			} catch (e) {
				if (fail) fail(e);
			}
		};
		reader.readAsText(file);
	}
};

// English: External rule parsers for different formats.
// Russian: Внешние парсеры правил для разных форматов.
export const externalAppRuleParser = {
	AutoProxy: {
		magicPrefix: 'W0F1dG9Qcm94',
		detect(text: string, acceptBase64: boolean = true): boolean {
			if (acceptBase64 && Utils.strStartsWith(text, externalAppRuleParser['AutoProxy'].magicPrefix)) {
				return true;
			} else if (Utils.strStartsWith(text, '[AutoProxy')) {
				return true;
			}
			return false;
		},
		preprocess(text: any) {
			if (Utils.strStartsWith(text, externalAppRuleParser['AutoProxy'].magicPrefix)) {
				text = Utils.b64DecodeUnicode(text);
			}
			return text;
		},
		parse(text: any, matchProfileName?: any, defaultProfileName?: any) {
			let cond, exclusive_rules: any[], line, list, normal_rules: any[], profile, source, _i, _len, _ref;
			normal_rules = [];
			exclusive_rules = [];
			_ref = text.split(/\n|\r/);
			for (_i = 0, _len = _ref.length; _i < _len; _i++) {
				line = _ref[_i];
				line = line.trim();
				if (line.length === 0 || line[0] === '!' || line[0] === '[') {
					continue;
				}
				source = line;
				profile = matchProfileName;
				list = normal_rules;
				if (line[0] === '@' && line[1] === '@') {
					profile = defaultProfileName;
					list = exclusive_rules;
					line = line.substring(2);
				}
				cond =
					line[0] === '/'
						? {
							conditionType: 'UrlRegexCondition',
							pattern: line.substring(1, line.length - 1),
						}
						: line[0] === '|'
							? line[1] === '|'
								? {
									conditionType: 'HostWildcardCondition',
									pattern: '*.' + line.substring(2),
									cleanCondition: line.substring(2),
								}
								: {
									conditionType: 'UrlWildcardCondition',
									pattern: line.substring(1) + '*',
									cleanCondition: line.substring(1),
								}
							: line.indexOf('*') < 0
								? {
									conditionType: 'KeywordCondition',
									pattern: line,
									cleanCondition: line,
								}
								: {
									conditionType: 'UrlWildcardCondition',
									pattern: 'http://*' + line + '*',
									cleanCondition: line,
								};
				list.push({
					condition: cond,
					profileName: profile,
					source: source,
				});
			}
			return exclusive_rules.concat(normal_rules);
		},
		convertAutoProxyRule(cleanCondition: any, conditionType: any) {
			let source = '';
			let pattern = '';

			switch (conditionType) {
				case 'KeywordCondition':
					if (cleanCondition[0] === '.') {
						cleanCondition = cleanCondition.substring(1);
					}
					source = cleanCondition;
					if (cleanCondition.endsWith('/'))
						source = cleanCondition.substring(0, cleanCondition.length - 2);
					pattern = `*://*.${source}/*`;
					break;

				case 'HostWildcardCondition':
					if (cleanCondition[0] === '.') {
						cleanCondition = cleanCondition.substring(1);
					}
					cleanCondition = cleanCondition.replace(/\*/g, '');
					cleanCondition = cleanCondition.replace(/([.])\1+/g, '.');
					if (cleanCondition[0] === '.') {
						cleanCondition = cleanCondition.substring(1);
					}
					source = cleanCondition;
					if (cleanCondition.endsWith('/'))
						source = cleanCondition.substring(0, cleanCondition.length - 2);
					pattern = `*://*.${source}/*`;
					break;

				case 'UrlWildcardCondition':
					if (cleanCondition[0] === '*') {
						cleanCondition = cleanCondition.substring(1);
					}
					if (cleanCondition[0] === '.') {
						cleanCondition = cleanCondition.substring(1);
					}

					if (cleanCondition.indexOf('*') !== -1) {
						let cleanConditionRemMiddle = cleanCondition;
						if (cleanConditionRemMiddle.indexOf('://*.') !== -1) {
							cleanConditionRemMiddle = cleanConditionRemMiddle.replace('//*.', '://');
						}
						if (cleanConditionRemMiddle.endsWith('*')) {
							cleanCondition = cleanCondition.substring(0, cleanCondition.length - 2);
							cleanConditionRemMiddle = cleanConditionRemMiddle.substring(0, cleanCondition.length - 2);
						}
						if (cleanConditionRemMiddle.indexOf('*') !== -1) {
							cleanConditionRemMiddle = cleanCondition.replace(/\/\*\//g, '/');
							if (cleanConditionRemMiddle.indexOf('*') !== -1) {
								return {
									success: false,
								};
							}
						}
					}

					source = cleanCondition;
					if (cleanCondition.endsWith('/'))
						source = cleanCondition.substring(0, cleanCondition.length - 2);

					if (source.indexOf('://') !== -1) {
						pattern = `${source}/*`;
					} else {
						pattern = `*://*.${source}/*`;
					}
					break;

				case 'UrlRegexCondition':
					return {
						success: false,
					};
			}

			return {
				success: true,
				source: source,
				pattern: pattern,
				toString() {
					return `[${source} , ${pattern}]`;
				},
			};
		}
	},
	GFWList: {
		detect(text: string, acceptBase64: boolean = true): boolean {
			if (acceptBase64 && Utils.strStartsWith(text, externalAppRuleParser['AutoProxy'].magicPrefix)) {
				return true;
			} else if (Utils.strStartsWith(text, '[AutoProxy')) {
				return true;
			}
			return false;
		},
		parse(
			text: any,
		): {
			_debug: any[];
			whiteList: SubscriptionProxyRule[];
			blackList: SubscriptionProxyRule[];
		} {
			text = text.trim();

			let whiteList: SubscriptionProxyRule[] = [];
			let blackList: SubscriptionProxyRule[] = [];
			let _debug = [];

			for (var line of text.split(/\n|\r/)) {
				line = line.trim();
				if (!line[0] || line[0] == '!' || line[0] == '[')
					continue;

				var converted = externalAppRuleParser.GFWList.convertLineRegex(line);
				if (!converted)
					continue;

				_debug.push(line + '\n' + converted.regex + ' \t\t Name:' + converted.name + '\n\n');
				if (line.startsWith('@@'))
					whiteList.push(converted);
				else
					blackList.push(converted);
			}
			return {
				_debug: _debug,
				whiteList: whiteList,
				blackList: blackList,
			};
		},
		convertLineRegex(line: string): SubscriptionProxyRule {
			if (line.startsWith('@@'))
				line = line.substring(2);

			if (line.startsWith('/') && line.endsWith('/')) {
				line = line.substring(1, line.length - 1);
				let rule = new ImportedProxyRule();
				rule.regex = line;
				rule.name = 'Regex-' + line.replace(/[\d\\d]*\W*/g, '');
				rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
				return rule;
			}

			let hasSpecialChars = line.includes('*') || line.includes('(');

			function rectifyRegexChars() {
				line = line.replace('*', '.+').replace('?', '\\?');
				line = line.replace('(', '\\(').replace(')', '\\)');
				line = line.replace('.', '\\.');
			}

			if (line.startsWith('||')) {
				line = line.substring(2);

				if (hasSpecialChars) {
					rectifyRegexChars();
					let rule = new ImportedProxyRule();
					rule.regex = `^(?:https?|ftps?|wss?):\\/\\/(?:.+\\.)?${line}(?:[?#\\\/].*)?$`;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
					return rule;
				} else {
					let rule = new ImportedProxyRule();
					rule.search = line;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.SearchDomainSubdomain;
					return rule;
				}
			}
			if (line.startsWith('|')) {
				line = line.substring(1);

				if (hasSpecialChars) {
					rectifyRegexChars();
					let rule = new ImportedProxyRule();
					rule.regex = `^${line}.*`;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
					return rule;
				} else {
					let rule = new ImportedProxyRule();
					rule.search = line;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.SearchUrl;
					return rule;
				}
			}
			if (line.endsWith('|')) {
				line = line.substring(0, line.length - 1);
				rectifyRegexChars();
				let rule = new ImportedProxyRule();
				rule.regex = `.*${line}$`;
				rule.name = line;
				rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
				return rule;
			}
			if (line.startsWith('.')) {
				line = line.substring(1);
				if (hasSpecialChars) {
					rectifyRegexChars();
					let rule = new ImportedProxyRule();
					rule.regex = `:\/\/(?:.+\\.)?${line}(?:[?#\\\/].*)?$`,
						rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
					return rule;
				} else {
					let rule = new ImportedProxyRule();
					rule.search = line;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.SearchDomainSubdomainAndPath;
					return rule;
				}
			} else {
				if (hasSpecialChars) {
					rectifyRegexChars();
					let rule = new ImportedProxyRule();
					rule.regex = `.*${line}(?:[.?#\\\/].*)?$`;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
					return rule;
				} else {
					let rule = new ImportedProxyRule();
					rule.search = line;
					rule.name = line;
					rule.importedRuleType = CompiledProxyRuleType.SearchDomainAndPath;
					return rule;
				}
			}
		},
	},
	Switchy: {
		parseAndCompile(text: string): any {
			let switchy = ruleImporterSwitchyScript.RuleImporterSwitchy.switchy;
			let compiler = ruleImporterSwitchyScript.RuleImporterSwitchy.compiler;

			var parserName = switchy.getParser(text);
			var parser = switchy[parserName];
			if (!parser) {
				return null;
			}
			var parsedRules = parser(text, 'profile-name', 'default-profile-name');

			var compiledRules = compiler.compile({
				defaultProfileName: 'default-profile-name',
				profileName: 'profile-name',
				profileType: 'SwitchProfile',
				rules: parsedRules,
			});
			return compiledRules;
		},
		convertToSubscriptionProxyRule(switchyCompiled: any[]): SubscriptionProxyRule[] {
			if (!switchyCompiled || !switchyCompiled.length) return [];

			let result: SubscriptionProxyRule[] = [];

			for (const compiled of switchyCompiled) {
				if (!compiled.args || compiled.args.length != 1) continue;
				let type = compiled.args[0];

				let regexSource;
				if (compiled.expression instanceof RegExp) {
					regexSource = compiled.expression.source;
				}
				else {
					regexSource = compiled.expression;
				}

				if (type == 'host') {
					let rule = new ImportedProxyRule();
					rule.name = compiled.source;
					rule.regex = regexSource;
					rule.importedRuleType = CompiledProxyRuleType.RegexHost;
					result.push(rule);
				} else if (type == 'url') {
					let rule = new ImportedProxyRule();
					rule.name = compiled.source;
					rule.regex = regexSource;
					rule.importedRuleType = CompiledProxyRuleType.RegexUrl;
					result.push(rule);
				}
			}

			return result;
		},
		convertToProxyRule(switchyCompiled: any[]): ImportedProxyRule[] {
			if (!switchyCompiled || !switchyCompiled.length) return [];

			let result: ImportedProxyRule[] = [];

			for (const compiled of switchyCompiled) {
				if (!compiled.args || compiled.args.length != 1) continue;
				let type = compiled.args[0];

				let regexSource: string;
				if (compiled.expression instanceof RegExp) {
					regexSource = compiled.expression.source;
				}
				else {
					regexSource = compiled.expression;
				}

				let newRule = new ImportedProxyRule();
				newRule.name = compiled.source;
				newRule.regex = regexSource;
				newRule.search = null;

				if (type == 'host') {
					newRule.importedRuleType = CompiledProxyRuleType.RegexHost;
				} else if (type == 'url') {
					newRule.importedRuleType = CompiledProxyRuleType.RegexUrl;
				}
				result.push(newRule);
			}

			return result;
		},
	},
};