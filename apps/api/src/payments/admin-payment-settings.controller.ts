import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import type { AuthUser } from '../auth/auth.types';
import { AdminGuard, AuthGuard, CurrentUser } from '../auth/guards';
import { UpdatePaymentSettingsDto } from './dto';
import { PaymentSettingsService, type AdminPaymentSettings } from './payment-settings.service';

/**
 * Payment settings, as the dashboard edits them. Admin-only, top to bottom.
 *
 * There is no route here that returns the gateway credential, and adding one
 * would undo the reason the key is safe to keep in a table at all: `GET` answers
 * with a mask and a boolean, `PATCH` accepts a new value, and nothing reads it
 * back. If a key is lost, it is replaced from the Zibal panel rather than
 * recovered from here.
 */
@Controller('admin/payment-settings')
@UseGuards(AuthGuard, AdminGuard)
export class AdminPaymentSettingsController {
  constructor(private readonly settings: PaymentSettingsService) {}

  @Get()
  read(): Promise<AdminPaymentSettings> {
    return this.settings.forAdmin();
  }

  /** PATCH, not PUT: an absent field is left alone — see the DTO on why. */
  @Patch()
  update(
    @Body() dto: UpdatePaymentSettingsDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminPaymentSettings> {
    return this.settings.update(dto, admin);
  }
}
