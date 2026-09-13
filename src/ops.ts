import { randomUUID } from 'node:crypto';

type Level = 'INFO' | 'WARN' | 'ERROR';
function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: 'lalapay-api', requestId: fields.requestId ?? null, message, ...fields };
  const line = JSON.stringify(entry);
  if (level === 'ERROR') console.error(line); else if (level === 'WARN') console.warn(line); else console.log(line);
}
export const logger = {
  info(message: string, fields?: Record<string, unknown>) { write('INFO', message, fields); },
  warn(message: string, fields?: Record<string, unknown>) { write('WARN', message, fields); },
  error(message: string, fields?: Record<string, unknown>) { write('ERROR', message, fields); },
};
export function newCorrelationId() { return randomUUID(); }
export function reportError(error: unknown, fields: Record<string, unknown> = {}) {
  const e = error instanceof Error ? error : new Error(String(error));
  logger.error(e.message, { ...fields, errorName: e.name, stack: e.stack?.slice(0, 5000) });
}
