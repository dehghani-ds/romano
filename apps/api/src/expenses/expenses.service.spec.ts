import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateExpenseDto } from './dto';
import { ExpensesService } from './expenses.service';

/**
 * The rules that are not visible in the columns.
 *
 * Three of them carry the feature: the payer defaults to whoever is signed in
 * but may be someone else, the payer has to be an active admin, and the day the
 * money was spent cannot be in the future. The fourth is the PATCH contract the
 * product DTOs already established — absent ≠ null.
 */

const ADMIN_ID = '0192f5a0-0000-7000-8000-00000000000a';
const OTHER_ADMIN_ID = '0192f5a0-0000-7000-8000-00000000000b';
const CUSTOMER_ID = '0192f5a0-0000-7000-8000-00000000000c';
const EXPENSE_ID = '0192f5a0-0000-7000-8000-000000000001';

/** 12:30 in Tehran on 2026-08-15, so "today" is unambiguous either side of UTC. */
const NOW = new Date('2026-08-15T09:00:00.000Z');
const TODAY = '2026-08-15';
const TOMORROW = '2026-08-16';

type PayerRow = { id: string; username: string; firstName: string; lastName: string };

const payer: PayerRow = {
  id: ADMIN_ID,
  username: 'ali',
  firstName: 'علی',
  lastName: 'رضایی',
};

type ExpenseRow = {
  id: string;
  title: string;
  amount: Prisma.Decimal;
  currency: string;
  category: string;
  spentAt: Date;
  note: string | null;
  paidById: string;
  paidBy: PayerRow;
  createdAt: Date;
  updatedAt: Date;
};

function row(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: EXPENSE_ID,
    title: 'خرید لیوان کاغذی',
    amount: new Prisma.Decimal(450000),
    currency: 'IRR',
    category: 'supplies',
    spentAt: new Date('2026-08-15T00:00:00.000Z'),
    note: null,
    paidById: ADMIN_ID,
    paidBy: payer,
    createdAt: new Date('2026-08-15T09:00:00.000Z'),
    updatedAt: new Date('2026-08-15T09:00:00.000Z'),
    ...overrides,
  };
}

function makeService() {
  const findUnique = vi.fn((_args: unknown): Promise<ExpenseRow | null> => Promise.resolve(null));
  const findMany = vi.fn((_args: unknown): Promise<ExpenseRow[]> => Promise.resolve([]));
  const create = vi.fn(({ data }: { data: Record<string, unknown> }): Promise<ExpenseRow> =>
    Promise.resolve(row(data as Partial<ExpenseRow>)),
  );
  const update = vi.fn(({ data }: { data: Record<string, unknown> }): Promise<ExpenseRow> =>
    Promise.resolve(row(data as Partial<ExpenseRow>)),
  );
  const remove = vi.fn((_args: unknown): Promise<ExpenseRow> => Promise.resolve(row()));

  // Every payer is an active admin unless a test says otherwise.
  const userFindUnique = vi.fn(
    (_args: unknown): Promise<{ role: string; isActive: boolean } | null> =>
      Promise.resolve({ role: 'admin', isActive: true }),
  );
  const userFindMany = vi.fn((_args: unknown): Promise<PayerRow[]> => Promise.resolve([]));

  const prisma = {
    expense: { findUnique, findMany, create, update, delete: remove },
    user: { findUnique: userFindUnique, findMany: userFindMany },
  } as unknown as PrismaService;

  return {
    service: new ExpensesService(prisma),
    findUnique,
    findMany,
    create,
    update,
    remove,
    userFindUnique,
    userFindMany,
  };
}

const minimal: CreateExpenseDto = { title: 'خرید لیوان کاغذی', amount: 450000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExpensesService.create', () => {
  it('writes the expense and returns it in the public shape', async () => {
    const { service, create } = makeService();

    const expense = await service.create({ ...minimal }, ADMIN_ID);

    expect(create).toHaveBeenCalledTimes(1);
    const { data } = create.mock.calls[0][0];
    expect(data['title']).toBe('خرید لیوان کاغذی');
    // Decimal, not a float — the column is Decimal(12, 2).
    expect(data['amount']).toBeInstanceOf(Prisma.Decimal);
    expect((data['amount'] as Prisma.Decimal).toNumber()).toBe(450000);

    // `amount` comes back as a number the UI can format, the date as YYYY-MM-DD.
    expect(expense.amount).toBe(450000);
    expect(typeof expense.amount).toBe('number');
    expect(expense.spentAt).toBe(TODAY);
    expect(expense.paidBy.username).toBe('ali');
  });

  it('files it under today in Tehran, and to the signed-in admin, by default', async () => {
    const { service, create } = makeService();

    await service.create({ ...minimal }, ADMIN_ID);

    const { data } = create.mock.calls[0][0];
    expect(data['spentAt']).toEqual(new Date(`${TODAY}T00:00:00.000Z`));
    expect(data['paidById']).toBe(ADMIN_ID);
    expect(data['currency']).toBe('IRR');
    expect(data['category']).toBe('other');
    expect(data['note']).toBeNull();
  });

  it('keeps the values it was given', async () => {
    const { service, create } = makeService();

    await service.create(
      {
        ...minimal,
        category: 'equipment',
        spentAt: '2026-08-01',
        note: 'فاکتور دارد',
        currency: 'USD',
      },
      ADMIN_ID,
    );

    const { data } = create.mock.calls[0][0];
    expect(data['category']).toBe('equipment');
    expect(data['spentAt']).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(data['note']).toBe('فاکتور دارد');
    expect(data['currency']).toBe('USD');
  });

  it('attributes it to the chosen payer, not to whoever typed it in', async () => {
    const { service, create } = makeService();

    await service.create({ ...minimal, paidById: OTHER_ADMIN_ID }, ADMIN_ID);

    const { data } = create.mock.calls[0][0];
    expect(data['paidById']).toBe(OTHER_ADMIN_ID);
  });

  it('refuses a payer who is not an admin, without writing', async () => {
    const { service, create, userFindUnique } = makeService();
    userFindUnique.mockResolvedValue({ role: 'customer', isActive: true });

    await expect(
      service.create({ ...minimal, paidById: CUSTOMER_ID }, ADMIN_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a deactivated admin as payer', async () => {
    const { service, create, userFindUnique } = makeService();
    userFindUnique.mockResolvedValue({ role: 'admin', isActive: false });

    await expect(
      service.create({ ...minimal, paidById: OTHER_ADMIN_ID }, ADMIN_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a payer who does not exist', async () => {
    const { service, create, userFindUnique } = makeService();
    userFindUnique.mockResolvedValue(null);

    await expect(
      service.create({ ...minimal, paidById: OTHER_ADMIN_ID }, ADMIN_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a spend dated in the future, without writing', async () => {
    const { service, create } = makeService();

    await expect(
      service.create({ ...minimal, spentAt: TOMORROW }, ADMIN_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('accepts today itself — the boundary is future, not "before today"', async () => {
    const { service, create } = makeService();

    await service.create({ ...minimal, spentAt: TODAY }, ADMIN_ID);

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('accepts a spend from the past — receipts arrive late', async () => {
    const { service, create } = makeService();

    await service.create({ ...minimal, spentAt: '2026-07-02' }, ADMIN_ID);

    const { data } = create.mock.calls[0][0];
    expect(data['spentAt']).toEqual(new Date('2026-07-02T00:00:00.000Z'));
  });
});

describe('ExpensesService.update', () => {
  it('writes only the fields that were sent', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    await service.update(EXPENSE_ID, { title: 'خرید لیوان درب‌دار' });

    const { data } = update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(['title']);
    expect(data['title']).toBe('خرید لیوان درب‌دار');
  });

  it('sends the new amount as a Decimal and returns it as a number', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    const expense = await service.update(EXPENSE_ID, { amount: 520000 });

    const { data } = update.mock.calls[0][0];
    expect(data['amount']).toBeInstanceOf(Prisma.Decimal);
    expect((data['amount'] as Prisma.Decimal).toNumber()).toBe(520000);
    expect(expense.amount).toBe(520000);
  });

  it('clears the note when it comes through as null', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row({ note: 'قدیمی' }));

    await service.update(EXPENSE_ID, { note: null });

    const { data } = update.mock.calls[0][0];
    expect(data['note']).toBeNull();
  });

  it('moves the expense to another admin', async () => {
    const { service, findUnique, update, userFindUnique } = makeService();
    findUnique.mockResolvedValue(row({ paidById: ADMIN_ID }));

    await service.update(EXPENSE_ID, { paidById: OTHER_ADMIN_ID });

    expect(userFindUnique).toHaveBeenCalledTimes(1);
    const { data } = update.mock.calls[0][0];
    expect(data['paidBy']).toEqual({ connect: { id: OTHER_ADMIN_ID } });
  });

  it('refuses to move it to someone who is not an active admin', async () => {
    const { service, findUnique, update, userFindUnique } = makeService();
    findUnique.mockResolvedValue(row({ paidById: ADMIN_ID }));
    userFindUnique.mockResolvedValue({ role: 'customer', isActive: true });

    await expect(
      service.update(EXPENSE_ID, { paidById: CUSTOMER_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  /**
   * The case that would otherwise bite: an admin who has since left still owns
   * old expenses, and fixing a typo in one of their titles must not be blocked
   * by re-validating a payer nobody is changing.
   */
  it('does not re-check the payer when the patch resends the same one', async () => {
    const { service, findUnique, update, userFindUnique } = makeService();
    findUnique.mockResolvedValue(row({ paidById: ADMIN_ID }));
    userFindUnique.mockResolvedValue({ role: 'admin', isActive: false });

    await service.update(EXPENSE_ID, { title: 'اصلاح شد', paidById: ADMIN_ID });

    expect(userFindUnique).not.toHaveBeenCalled();
    const { data } = update.mock.calls[0][0];
    expect(Object.keys(data)).toEqual(['title']);
  });

  it('refuses to move a spend into the future, without writing', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row());

    await expect(service.update(EXPENSE_ID, { spentAt: TOMORROW })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('does not write at all when the patch is empty', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(row({ title: 'خرید دان قهوه' }));

    const expense = await service.update(EXPENSE_ID, {});

    expect(update).not.toHaveBeenCalled();
    expect(expense.title).toBe('خرید دان قهوه');
  });

  it('answers 404 for an expense that is not there', async () => {
    const { service, findUnique, update } = makeService();
    findUnique.mockResolvedValue(null);

    await expect(service.update(EXPENSE_ID, { title: 'هرچه' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('ExpensesService.remove', () => {
  it('deletes the row', async () => {
    const { service, findUnique, remove } = makeService();
    findUnique.mockResolvedValue(row());

    await service.remove(EXPENSE_ID);

    expect(remove).toHaveBeenCalledWith({ where: { id: EXPENSE_ID } });
  });

  it('answers 404 for an expense that is not there, and deletes nothing', async () => {
    const { service, findUnique, remove } = makeService();
    findUnique.mockResolvedValue(null);

    await expect(service.remove(EXPENSE_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('ExpensesService.list', () => {
  it('returns the newest spend first and maps every row', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([
      row({ id: 'a', spentAt: new Date('2026-08-15T00:00:00.000Z') }),
      row({ id: 'b', spentAt: new Date('2026-07-02T00:00:00.000Z') }),
    ]);

    const expenses = await service.list();

    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
    });
    expect(expenses.map((expense) => expense.spentAt)).toEqual(['2026-08-15', '2026-07-02']);
  });
});

describe('ExpensesService.listPayers', () => {
  it('offers only active admins', async () => {
    const { service, userFindMany } = makeService();
    userFindMany.mockResolvedValue([payer]);

    const payers = await service.listPayers();

    expect(userFindMany.mock.calls[0][0]).toMatchObject({
      where: { role: 'admin', isActive: true },
    });
    expect(payers).toEqual([payer]);
  });
});
