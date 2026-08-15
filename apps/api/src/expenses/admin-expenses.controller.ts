import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { AuthUser } from '../auth/auth.types';
import { AdminGuard, AuthGuard, CurrentUser } from '../auth/guards';
import { CreateExpenseDto, UpdateExpenseDto } from './dto';
import { ExpensesService, type ExpensePayer, type PublicExpense } from './expenses.service';

/**
 * The expense ledger. Admin-only, top to bottom — there is no public view of
 * what Romano costs to run, and no customer-facing counterpart to this
 * controller.
 */
@Controller('admin/expenses')
@UseGuards(AuthGuard, AdminGuard)
export class AdminExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(): Promise<PublicExpense[]> {
    return this.expenses.list();
  }

  /**
   * The admins an expense can be attributed to.
   *
   * It lives under `/admin/expenses` rather than a general users endpoint
   * because that is the whole of its reason to exist: it answers "who can I
   * name as the payer", and exposes four columns to do it. A general user list
   * would be a wider door than this feature needs.
   *
   * Declared before `:id` has any sibling route so the literal path is never
   * read as a UUID.
   */
  @Get('payers')
  listPayers(): Promise<ExpensePayer[]> {
    return this.expenses.listPayers();
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser): Promise<PublicExpense> {
    return this.expenses.create(dto, user.id);
  }

  /** PATCH, not PUT: the dashboard sends the fields it changed, and no others. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<PublicExpense> {
    return this.expenses.update(id, dto);
  }

  /** 204, no body — there is nothing left to describe. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.expenses.remove(id);
  }
}
