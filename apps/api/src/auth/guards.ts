import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

import { MESSAGES } from '../common/messages';
import type { AuthUser } from './auth.types';
import { TokenService } from './token.service';

type RequestWithUser = Request & { user?: AuthUser };

function bearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/** Requires a valid access token. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = bearerToken(request);
    const user = token ? await this.tokens.verifyAccess(token) : null;

    if (!user) {
      throw new UnauthorizedException({
        code: 'sign_in_required',
        message: MESSAGES.auth.signInRequired,
      });
    }

    request.user = user;
    return true;
  }
}

/**
 * Attaches the user when a valid token is present and lets the request through
 * either way. This is what makes guest checkout work on the same endpoint as
 * signed-in checkout.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = bearerToken(request);
    if (token) {
      const user = await this.tokens.verifyAccess(token);
      if (user) request.user = user;
    }
    return true;
  }
}

/** Requires an admin. Use together with `AuthGuard`, which runs first. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException({ code: 'admin_only', message: MESSAGES.auth.adminOnly });
    }
    return true;
  }
}

/** `@CurrentUser() user: AuthUser` — undefined behind `OptionalAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);
