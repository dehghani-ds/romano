import type { UserRole } from '../generated/prisma/enums';

/** What a verified access token tells us about the caller. */
export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  typ: 'refresh';
}

/** Express `Request` once a guard has run. */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
