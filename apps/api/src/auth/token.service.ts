import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';

import { MESSAGES } from '../common/messages';
import type { AppConfig } from '../config/configuration';
import type { AccessTokenPayload, AuthUser, RefreshTokenPayload } from './auth.types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  private readonly secret: string;
  // jsonwebtoken types the lifetime as a template-literal union ("15m", "30d", …),
  // which a plain env string cannot satisfy without a cast.
  private readonly accessTtl: JwtSignOptions['expiresIn'];
  private readonly refreshTtl: JwtSignOptions['expiresIn'];

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<AppConfig, true>,
  ) {
    const jwtConfig = config.get('jwt', { infer: true });
    this.secret = jwtConfig.secret;
    this.accessTtl = jwtConfig.accessTtl as JwtSignOptions['expiresIn'];
    this.refreshTtl = jwtConfig.refreshTtl as JwtSignOptions['expiresIn'];
  }

  async issue(user: AuthUser): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      typ: 'access',
    };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, typ: 'refresh' };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, { secret: this.secret, expiresIn: this.accessTtl }),
      this.jwt.signAsync(refreshPayload, { secret: this.secret, expiresIn: this.refreshTtl }),
    ]);

    return { accessToken, refreshToken };
  }

  /** Verifies an access token. Returns null rather than throwing — the optional
   *  guard needs to tell "no valid token" apart from "the request failed". */
  async verifyAccess(token: string): Promise<AuthUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.secret,
      });
      if (payload.typ !== 'access') return null;
      return { id: payload.sub, username: payload.username, role: payload.role };
    } catch {
      return null;
    }
  }

  async verifyRefresh(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.secret,
      });
      if (payload.typ !== 'refresh') throw new Error('wrong token type');
      return payload.sub;
    } catch {
      throw new UnauthorizedException({
        code: 'session_expired',
        message: MESSAGES.auth.sessionExpired,
      });
    }
  }
}
