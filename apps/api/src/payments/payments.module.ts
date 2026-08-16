import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ZibalClient } from './zibal.client';

/**
 * Online payment through Zibal's IPG (https://help.zibal.ir/ipg/).
 *
 * Kept apart from `OrdersModule` so that adding a second gateway later — or
 * dropping this one — is a change to one directory. It imports `OrdersModule`
 * rather than `PrismaService` on purpose: `OrdersService` remains the only
 * thing in the system that writes to `payments`, and this module reaches the
 * table through the three narrow methods it exposes for exactly that.
 */
@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, ZibalClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
