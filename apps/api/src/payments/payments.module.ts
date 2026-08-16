import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { AdminPaymentSettingsController } from './admin-payment-settings.controller';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ZibalClient } from './zibal.client';

/**
 * Online payment through Zibal's IPG (https://help.zibal.ir/ipg/), and the
 * settings that configure it.
 *
 * Kept apart from `OrdersModule` so that adding a second gateway later — or
 * dropping this one — is a change to one directory. It imports `OrdersModule`
 * rather than using `PrismaService` for orders: `OrdersService` remains the only
 * thing in the system that writes to `payments`, and this module reaches that
 * table through the four narrow methods it exposes for exactly that.
 *
 * `payment_settings` is this module's own table, so `PaymentSettingsService`
 * does own its reads and writes — nothing else in the system touches it.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController, AdminPaymentSettingsController],
  providers: [PaymentsService, PaymentSettingsService, ZibalClient],
  exports: [PaymentsService, PaymentSettingsService],
})
export class PaymentsModule {}
