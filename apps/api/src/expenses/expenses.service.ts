import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import { dateToIso, isFutureDay, isoToDate, tehranToday } from '../common/tehran';
import { Prisma } from '../generated/prisma/client';
import type { ExpenseCategory } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateExpenseDto, UpdateExpenseDto } from './dto';

/** Who paid — the little of a user an expense row has any business showing. */
export interface ExpensePayer {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
}

export interface PublicExpense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  /** Gregorian `YYYY-MM-DD`; the Jalali rendering is the client's job. */
  spentAt: string;
  note: string | null;
  paidBy: ExpensePayer;
  createdAt: string;
  updatedAt: string;
}

const PAYER_SELECT = {
  select: { id: true, username: true, firstName: true, lastName: true },
} as const;

type ExpenseRow = Prisma.ExpenseGetPayload<{ include: { paidBy: typeof PAYER_SELECT } }>;

export function toPublicExpense(expense: ExpenseRow): PublicExpense {
  return {
    id: expense.id,
    title: expense.title,
    // Decimal is exact in the database; the UI only ever formats it.
    amount: expense.amount.toNumber(),
    currency: expense.currency,
    category: expense.category,
    spentAt: dateToIso(expense.spentAt),
    note: expense.note,
    paidBy: expense.paidBy,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

/**
 * The expense ledger.
 *
 * Everything here is admin-only and shared: every admin reads every row and may
 * correct or remove any of them. That is deliberate — the alternative is each
 * admin keeping a private list, which is the problem this replaces.
 *
 * Three rules are worth stating because they are not obvious from the columns:
 *
 *  - **The payer is chosen, not assumed.** It defaults to whoever is signed in,
 *    because recording your own expense is the common case, but one admin
 *    filing what another paid is ordinary and must not be recorded as theirs.
 *  - **The payer must be an active admin.** An expense is money moved by
 *    someone who runs Romano; pointing it at a customer would make the ledger
 *    mean something else entirely.
 *  - **`spentAt` is never in the future.** A receipt records money already
 *    gone. Checked in Tehran days, like every other date in the app.
 *
 * There is no splitting here, on purpose. An expense has exactly one payer, and
 * who owes whom afterwards is settled outside this table.
 */
@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The whole ledger, newest spend first. Unpaginated: the dashboard sums what
   * it is given, and a total over a partial page would be a lie.
   */
  async list(): Promise<PublicExpense[]> {
    const expenses = await this.prisma.expense.findMany({
      include: { paidBy: PAYER_SELECT },
      orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
    });
    return expenses.map(toPublicExpense);
  }

  /** The admins an expense may be attributed to, for the payer picker. */
  async listPayers(): Promise<ExpensePayer[]> {
    return this.prisma.user.findMany({
      where: { role: 'admin', isActive: true },
      select: PAYER_SELECT.select,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async create(dto: CreateExpenseDto, actorId: string): Promise<PublicExpense> {
    const paidById = dto.paidById ?? actorId;
    await this.assertPayerIsAdmin(paidById);

    const spentAt = dto.spentAt ?? tehranToday();
    this.assertNotFuture(spentAt);

    const expense = await this.prisma.expense.create({
      data: {
        title: dto.title,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'IRR',
        category: dto.category ?? 'other',
        spentAt: isoToDate(spentAt),
        note: dto.note ?? null,
        paidById,
      },
      include: { paidBy: PAYER_SELECT },
    });
    return toPublicExpense(expense);
  }

  /**
   * A patch, not a replace: only the keys the admin sent are written, so two
   * admins correcting two different fields do not overwrite each other's work.
   */
  async update(id: string, dto: UpdateExpenseDto): Promise<PublicExpense> {
    const existing = await this.prisma.expense.findUnique({
      where: { id },
      include: { paidBy: PAYER_SELECT },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'expense_not_found', message: MESSAGES.expense.notFound });
    }

    const data: Prisma.ExpenseUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.note !== undefined) data.note = dto.note;

    if (dto.spentAt !== undefined) {
      this.assertNotFuture(dto.spentAt);
      data.spentAt = isoToDate(dto.spentAt);
    }

    // Only when it is actually changing — an admin deactivated since the expense
    // was filed should not block an edit to its title.
    if (dto.paidById !== undefined && dto.paidById !== existing.paidById) {
      await this.assertPayerIsAdmin(dto.paidById);
      data.paidBy = { connect: { id: dto.paidById } };
    }

    // An empty patch is not an error — it is a form submitted with nothing
    // changed. Skipping the write keeps `updatedAt` honest.
    if (Object.keys(data).length === 0) return toPublicExpense(existing);

    const expense = await this.prisma.expense.update({
      where: { id },
      data,
      include: { paidBy: PAYER_SELECT },
    });
    return toPublicExpense(expense);
  }

  /**
   * A real delete. An expense is a note about money that left, not a record
   * anything else depends on — nothing references `expenses`, so removing a row
   * that was entered twice leaves no hole. The confirmation step that stops an
   * accident belongs in the dashboard, and is there.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.expense.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException({ code: 'expense_not_found', message: MESSAGES.expense.notFound });
    }
    await this.prisma.expense.delete({ where: { id } });
  }

  private async assertPayerIsAdmin(userId: string): Promise<void> {
    const payer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!payer || payer.role !== 'admin' || !payer.isActive) {
      throw new BadRequestException({
        code: 'expense_payer_not_admin',
        message: MESSAGES.expense.payerNotAdmin,
      });
    }
  }

  private assertNotFuture(iso: string): void {
    if (isFutureDay(iso)) {
      throw new BadRequestException({
        code: 'expense_future_date',
        message: MESSAGES.expense.futureDateRejected,
      });
    }
  }
}
