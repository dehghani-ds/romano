import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { MESSAGES } from '../common/messages';
import { DEFAULT_COMPANY_NAME } from '../common/validation';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';
import type { LoginDto, RegisterDto } from './dto';
import { TokenService, type TokenPair } from './token.service';

export interface PublicUser {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  mobile: string;
  companyName: string;
  teamName: string;
  role: User['role'];
  isActive: boolean;
  createdAt: string;
}

export interface AuthResult extends TokenPair {
  user: PublicUser;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    mobile: user.mobile,
    companyName: user.companyName,
    teamName: user.teamName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    // Checked up front so the caller gets a field-specific Persian message
    // rather than a raw unique-constraint failure. The unique indexes are still
    // the real guarantee — this is a nicety, not the enforcement.
    const [byUsername, byMobile] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: dto.username } }),
      this.prisma.user.findUnique({ where: { mobile: dto.mobile } }),
    ]);

    if (byUsername) {
      throw new ConflictException({
        code: 'username_taken',
        message: MESSAGES.auth.usernameTaken,
      });
    }
    if (byMobile) {
      throw new ConflictException({ code: 'mobile_taken', message: MESSAGES.auth.mobileTaken });
    }

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        mobile: dto.mobile,
        companyName: dto.companyName || DEFAULT_COMPANY_NAME,
        teamName: dto.teamName,
      },
    });

    return this.sessionFor(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });

    // Verify against a dummy hash when the username is unknown so that a
    // missing account and a wrong password take the same time to answer.
    const passwordOk = user
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : await argon2.hash(dto.password).then(() => false);

    if (!user || !passwordOk) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: MESSAGES.auth.invalidCredentials,
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: 'inactive_account',
        message: MESSAGES.auth.inactiveAccount,
      });
    }

    return this.sessionFor(user);
  }

  /** Exchanges a refresh token for a fresh pair, re-reading the user so that a
   *  deactivated or demoted account cannot keep an old role alive. */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const userId = await this.tokens.verifyRefresh(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'session_expired',
        message: MESSAGES.auth.sessionExpired,
      });
    }

    return this.sessionFor(user);
  }

  async currentUser(auth: AuthUser): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'session_expired',
        message: MESSAGES.auth.sessionExpired,
      });
    }
    return toPublicUser(user);
  }

  private async sessionFor(user: User): Promise<AuthResult> {
    const tokens = await this.tokens.issue({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    return { ...tokens, user: toPublicUser(user) };
  }
}
