import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { MESSAGES } from './messages';

/**
 * One error shape for the whole API:
 *
 *   { "statusCode": 400, "code": "quantity_range", "message": "تعداد فنجان…" }
 *
 * `message` is always Persian and always safe to render as-is — the client
 * displays it without a translation table. Anything we did not raise on purpose
 * becomes a generic Persian sentence and a server-side log, so an internal
 * failure never leaks a stack trace or a constraint name into the UI.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      response.status(status).json({
        statusCode: status,
        code: codeOf(payload, status),
        message: messageOf(payload, exception.message),
      });
      return;
    }

    this.logger.error(
      `${request.method} ${request.url} failed`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      message: MESSAGES.generic.unexpected,
    });
  }
}

function messageOf(payload: string | object, fallback: string): string {
  if (typeof payload === 'string') return payload;

  const message = (payload as { message?: unknown }).message;

  // ValidationPipe hands back an array of per-field complaints. Ours are already
  // written in Persian by the DTO decorators, so the first one is showable.
  if (Array.isArray(message)) {
    const first = message[0];
    return first === undefined
      ? MESSAGES.generic.validationFailed
      : stripFieldPath(String(first));
  }
  if (typeof message === 'string') return message;

  return fallback;
}

/**
 * A complaint about a nested field arrives with its path glued on —
 * `items.0.تعداد هر مورد باید…` — once the basket became an array of lines.
 * That path is for us, not for the person reading it, so it comes back off.
 *
 * Only a leading ASCII path is removed, and only when Persian follows it, so a
 * message that happens to start with a Latin word is left alone.
 */
export function stripFieldPath(message: string): string {
  return message.replace(/^[A-Za-z0-9_$.[\]]+\.(?=[^\x00-\x7F])/u, '');
}

function codeOf(payload: string | object, status: number): string {
  if (typeof payload === 'object' && payload !== null) {
    const code = (payload as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return `http_${status}`;
}
