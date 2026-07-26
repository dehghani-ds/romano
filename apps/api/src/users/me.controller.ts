import { Body, Controller, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';

import type { PublicUser } from '../auth/auth.service';
import type { AuthUser } from '../auth/auth.types';
import { AuthGuard, CurrentUser } from '../auth/guards';
import type { OrderDetail } from '../orders/order.mapper';
import { OrdersService } from '../orders/orders.service';
import { ChangePasswordDto, ClaimOrderDto, UpdateProfileDto } from './dto';
import { UsersService } from './users.service';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly orders: OrdersService,
  ) {}

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.users.updateProfile(user, dto);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto): Promise<void> {
    return this.users.changePassword(user, dto);
  }

  /**
   * "I ordered as a guest, then made an account." Moves that order onto the
   * account so it shows up in سفارش‌های من alongside the rest.
   */
  @Post('claim-order')
  @HttpCode(HttpStatus.OK)
  claimOrder(@CurrentUser() user: AuthUser, @Body() dto: ClaimOrderDto): Promise<OrderDetail> {
    return this.orders.claim(dto.orderNumber, dto.mobile, user);
  }
}
