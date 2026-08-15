import { Module } from '@nestjs/common';

import { AdminExpensesController } from './admin-expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  controllers: [AdminExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
