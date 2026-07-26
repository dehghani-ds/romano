import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The bearer secret a guest received at checkout.
 *
 * Accepted in the `X-Guest-Token` header (preferred — stays out of server logs,
 * browser history and Referer) or as a `?token=` query parameter, so that a
 * plain link to an order still works.
 */
export const GuestToken = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const request = context.switchToHttp().getRequest<Request>();

    const header = request.headers['x-guest-token'];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    if (fromHeader) return fromHeader;

    const fromQuery = request.query['token'];
    return typeof fromQuery === 'string' && fromQuery ? fromQuery : undefined;
  },
);
