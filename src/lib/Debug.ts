/*
 * This file is part of SmartProxy <https://github.com/salarcode/SmartProxy>,
 * Copyright (C) 2019 Salar Khalilzadeh <salar2k@gmail.com>
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

/** Used for diagnostics only */
export var DiagDebug: Diagnostics = null;

export class Debug {
	private static enabled: boolean = true;
	public static enable() {
		this.enabled = true;
	}
	public static enableDiagnostics(consoleOutput: boolean = false) {
		this.enabled = true;
		if (DiagDebug == null)
			DiagDebug = new Diagnostics();
		DiagDebug.consoleOutput = consoleOutput;
		DiagDebug.register();
	}
	public static disable() {
		this.enabled = false;
	}
	public static disableDiagnostics() {
		DiagDebug?.unregister();
		DiagDebug = null;
	}
	public static disableAll() {
		this.disable();
		this.disableDiagnostics();
	}
	public static isEnabled() {
		return this.enabled;
	}

	public static log(msg: string, ...args: any) {
		if (!this.enabled) return;
		console.log(msg, ...args);
		if (DiagDebug && !DiagDebug.consoleOutput)
			DiagDebug.log(msg, ...args);
	}

	public static info(msg: string, ...args: any) {
		if (!this.enabled) return;
		console.info(msg, ...args);
		if (DiagDebug && !DiagDebug.consoleOutput)
			DiagDebug.info(msg, ...args);
	}

	public static trace(msg: string, ...args: any) {
		if (!this.enabled) return;
		console.trace(msg, ...args);
		if (DiagDebug && !DiagDebug.consoleOutput)
			DiagDebug.trace(msg, ...args);
	}

	public static warn(msg: string, ...args: any) {
		// warn should be always output
		console.warn(msg, ...args);
		if (DiagDebug && !DiagDebug.consoleOutput)
			DiagDebug.warn(msg, ...args);
	}

	public static error(msg: string, ...args: any) {
		// error should be always output
		console.error(msg, ...args);
		if (DiagDebug && !DiagDebug.consoleOutput)
			DiagDebug.error(msg, ...args);
	}
}

class Diagnostics {
	public enabled: boolean = true;
	public consoleOutput: boolean = false;
	private logs: string[] = [];

	public clear() {
		this.logs = [];
	}

	public getDiagLogs() {
		return JSON.stringify(this.logs, null, " ");
	}

	public register() {
		globalThis.SmartProxyGetDiagLogs = () => this.getDiagLogs();
		globalThis.DiagDebug = this;
	}

	public unregister() {
		globalThis.SmartProxyGetDiagLogs = undefined;
	}

	public log(msg: string, ...args: any) {
		if (!this.enabled) return;
		this.addToLog('log', msg, args);
	}

	public error(msg: string, ...args: any) {
		if (!this.enabled) return;
		this.addToLog('error', msg, args);
	}

	public info(msg: string, ...args: any) {
		if (!this.enabled) return;
		this.addToLog('info', msg, args);
	}

	public warn(msg: string, ...args: any) {
		if (!this.enabled) return;
		this.addToLog('warn', msg, args);
	}

	public trace(msg: string, ...args: any) {
		if (!this.enabled) return;
		this.addToLog('trace', msg, args);
	}

	private addToLog(level: string, msg: string, args: any[]) {
		let text = `${formatTime(new Date())} [${level}] ` + msg;

		for (const arg of args) {
			if (arg == null) {
				text += ' NULL';
			}
			else if (typeof (arg) === "object") {
				text += ' ' + JSON.stringify(arg);
			}
			else {
				text += ' ' + arg.toString();
			}
		}

		this.logs.push(text);
		if (this.consoleOutput)
			console.log("Diagnostics", text);
	}
}

const zeroPad = (num, places) => String(num).padStart(places, '0');
const formatTime = (t: Date) => `${t.getHours()}:${zeroPad(t.getMinutes(), 2)}:${zeroPad(t.getSeconds(), 2)}.${zeroPad(t.getMilliseconds(), 3)}`;