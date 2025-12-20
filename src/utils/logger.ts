import * as fs from "fs";
import path from "path";

const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir, { recursive: true });
}

export enum LogLevel {
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
	DEBUG = "DEBUG",
}

export class Logger {
	private static logFile = path.join(
		logDir,
		`bundler-${new Date().toISOString().split("T")[0]}.log`
	);

	static log(level: LogLevel, message: string, data?: any) {
		const timestamp = new Date().toISOString();
		const logEntry = `[${timestamp}] [${level}] ${message}${
			data ? ` ${JSON.stringify(data)}` : ""
		}\n`;

		// Console output with colors
		const colors = {
			INFO: "\x1b[36m", // Cyan
			WARN: "\x1b[33m", // Yellow
			ERROR: "\x1b[31m", // Red
			DEBUG: "\x1b[90m", // Gray
		};
		console.log(`${colors[level]}${logEntry}\x1b[0m`);

		// File output
		try {
			fs.appendFileSync(this.logFile, logEntry);
		} catch (error) {
			// Silently fail if file write fails
		}
	}

	static info(message: string, data?: any) {
		this.log(LogLevel.INFO, message, data);
	}

	static warn(message: string, data?: any) {
		this.log(LogLevel.WARN, message, data);
	}

	static error(message: string, data?: any) {
		this.log(LogLevel.ERROR, message, data);
	}

	static debug(message: string, data?: any) {
		this.log(LogLevel.DEBUG, message, data);
	}
}

