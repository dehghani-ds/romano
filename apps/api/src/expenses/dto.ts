import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  CURRENCY_PATTERN,
  FIELD_ERRORS,
  MAX_EXPENSE_AMOUNT,
  MAX_EXPENSE_NOTE_LENGTH,
  MAX_EXPENSE_TITLE_LENGTH,
  MIN_EXPENSE_AMOUNT,
} from '../common/validation';
import { ExpenseCategory } from '../generated/prisma/enums';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Empty strings from a form field mean "not given", not "set it to empty". */
const emptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

/** On a PATCH, a field left empty is the admin clearing it. */
const emptyToNull = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

/**
 * Optional in the PATCH sense — the same distinction the product DTOs draw:
 * absent means "leave it alone", and anything else, `null` included, is
 * validated. `@IsOptional()` would wave `null` through into a NOT NULL column.
 */
const present = () => ValidateIf((_object, value) => value !== undefined);

/** The same, for the one column where `null` is a legitimate value. */
const given = () => ValidateIf((_object, value) => value !== undefined && value !== null);

export class CreateExpenseDto {
  @trim()
  @IsString()
  @Length(1, MAX_EXPENSE_TITLE_LENGTH, { message: FIELD_ERRORS.expenseTitle })
  title!: string;

  /**
   * Rial, and whole units in practice — but the column is `Decimal(12, 2)`, so
   * two decimal places are accepted rather than silently truncated.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: FIELD_ERRORS.expenseAmount })
  @Min(MIN_EXPENSE_AMOUNT, { message: FIELD_ERRORS.expenseAmount })
  @Max(MAX_EXPENSE_AMOUNT, { message: FIELD_ERRORS.expenseAmount })
  amount!: number;

  @IsOptional()
  @IsIn(Object.values(ExpenseCategory), { message: FIELD_ERRORS.expenseCategory })
  category?: ExpenseCategory;

  /**
   * Gregorian `YYYY-MM-DD` on the wire, as everywhere else — the Jalali date the
   * admin actually reads is rendered by the client. Optional: left out, the
   * service files the expense under today in Tehran.
   */
  @IsOptional()
  @Matches(ISO_DATE, { message: FIELD_ERRORS.expenseSpentAt })
  spentAt?: string;

  @IsOptional()
  @emptyToUndefined()
  @trim()
  @IsString()
  @MaxLength(MAX_EXPENSE_NOTE_LENGTH, { message: FIELD_ERRORS.expenseNote })
  note?: string;

  /**
   * Whoever actually paid. Optional, and the service reads the signed-in admin
   * when it is missing — recording your own expense is the common case and
   * should not need a choice.
   */
  @IsOptional()
  @IsUUID('all', { message: FIELD_ERRORS.expensePaidBy })
  paidById?: string;

  @IsOptional()
  @emptyToUndefined()
  @trim()
  @Matches(CURRENCY_PATTERN, { message: FIELD_ERRORS.expenseCurrency })
  currency?: string;
}

/**
 * Editing an expense. A PATCH: a field that is absent is left alone, so the
 * dashboard sends only what the admin actually touched and two admins fixing
 * two different fields do not overwrite each other.
 *
 * Every field is here, including `paidById` — unlike a product's slug, nothing
 * about an expense is an identity that has to hold still. Filing a receipt
 * under the wrong colleague is exactly the mistake this endpoint exists to fix.
 */
export class UpdateExpenseDto {
  @present()
  @trim()
  @IsString()
  @Length(1, MAX_EXPENSE_TITLE_LENGTH, { message: FIELD_ERRORS.expenseTitle })
  title?: string;

  @present()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: FIELD_ERRORS.expenseAmount })
  @Min(MIN_EXPENSE_AMOUNT, { message: FIELD_ERRORS.expenseAmount })
  @Max(MAX_EXPENSE_AMOUNT, { message: FIELD_ERRORS.expenseAmount })
  amount?: number;

  @present()
  @IsIn(Object.values(ExpenseCategory), { message: FIELD_ERRORS.expenseCategory })
  category?: ExpenseCategory;

  @present()
  @Matches(ISO_DATE, { message: FIELD_ERRORS.expenseSpentAt })
  spentAt?: string;

  /** `null` — or an empty field — clears the note; absent keeps it. */
  @given()
  @emptyToNull()
  @trim()
  @IsString()
  @MaxLength(MAX_EXPENSE_NOTE_LENGTH, { message: FIELD_ERRORS.expenseNote })
  note?: string | null;

  @present()
  @IsUUID('all', { message: FIELD_ERRORS.expensePaidBy })
  paidById?: string;

  @present()
  @trim()
  @Matches(CURRENCY_PATTERN, { message: FIELD_ERRORS.expenseCurrency })
  currency?: string;
}
