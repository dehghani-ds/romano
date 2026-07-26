import { Module } from '@nestjs/common';

import { OrdersModule } from '../orders/orders.module';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

@Module({
  imports: [OrdersModule],
  controllers: [MeController],
  providers: [UsersService],
})
export class UsersModule {}
