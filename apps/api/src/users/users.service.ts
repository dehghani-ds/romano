import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { toPublicUser, type PublicUser } from '../auth/auth.service';
import type { AuthUser } from '../auth/auth.types';
import { MESSAGES } from '../common/messages';
import { PrismaService } from '../prisma/prisma.service';
import type { ChangePasswordDto, UpdateProfileDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(actor: AuthUser, dto: UpdateProfileDto): Promise<PublicUser> {
    const clash = await this.prisma.user.findFirst({
      where: { mobile: dto.mobile, id: { not: actor.id } },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({ code: 'mobile_taken', message: MESSAGES.auth.mobileTaken });
    }

    // Note what is absent: `role` and `isActive`. A customer editing their own
    // profile must not be able to promote themselves, so those columns are not
    // reachable from this path at all.
    const user = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        mobile: dto.mobile,
        companyName: dto.companyName,
        teamName: dto.teamName,
      },
    });

    return toPublicUser(user);
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) {
      throw new NotFoundException({ code: 'user_not_found', message: MESSAGES.auth.userNotFound });
    }

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'current_password_wrong',
        message: MESSAGES.auth.currentPasswordWrong,
      });
    }

    await this.prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: await argon2.hash(dto.newPassword) },
    });
  }
}
