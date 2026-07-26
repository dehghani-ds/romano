import { Module } from '@nestjs/common';

import { AdminOrdersController, AdminStatsController } from './admin-orders.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ReceiptsService } from './receipts.service';

@Module({
  controllers: [OrdersController, AdminOrdersController, AdminStatsController],
  providers: [OrdersService, ReceiptsService],
  exports: [OrdersService],
})
export class OrdersModule {}
