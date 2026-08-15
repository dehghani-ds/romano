import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  CreateExpenseRequest,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_META,
  Expense,
  ExpenseCategory,
  ExpensePayer,
  UpdateExpenseRequest,
  formatDate,
  formatMoney,
  formatNumber,
  formatPayerName,
  todayIso,
} from '@romano/domain';
import { EmptyState, Icon, IconName, Spinner, ToastService } from '@romano/ui';

import { AdminExpensesService } from '../../core/admin-expenses.service';
import { AuthService } from '../../core/auth.service';

/** Mirrors MAX_EXPENSE_AMOUNT / MIN_EXPENSE_AMOUNT in the API. */
const MAX_AMOUNT = 1_000_000_000;
const MIN_AMOUNT = 0.01;
const MAX_TITLE = 120;
const MAX_NOTE = 500;

/** What the form holds — the same fields whether it is adding or editing. */
interface FormValue {
  title: string;
  amount: number;
  category: ExpenseCategory;
  spentAt: string;
  paidById: string;
  note: string;
}

/**
 * Expenses: what Romano costs to run, and the form that records it.
 *
 * A shared ledger. Every admin sees every row and may correct or remove any of
 * them — the alternative is each admin keeping a private list, which is the
 * problem this replaces. What the page deliberately does *not* do is divide
 * anything: an expense has one payer, shown on its row, and who owes whom is
 * settled outside the app.
 *
 * One form, two modes, exactly as the products page does it: editing points the
 * form at a row rather than opening a second form or a modal, and the row being
 * edited is tinted so the form's heading is never the only clue.
 *
 * Deleting is the one thing here that cannot be undone, so it asks first —
 * inline, in the row itself. A modal would be a heavier promise than a
 * mistyped receipt deserves, and there is no dialog primitive in the design
 * system to make one from.
 *
 * Listed twice like the order queue: a table from 768px up, cards below it.
 */
@Component({
  selector: 'app-expenses-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Spinner, EmptyState],
  template: `
    <div class="container page">
      <div class="head">
        <div>
          <h1 class="title">هزینه‌ها</h1>
          <p class="muted text-sm">{{ summary() }}</p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="reload()">
          <app-icon name="refresh" [size]="16" />
          تازه‌سازی
        </button>
      </div>

      <!-- Add / edit ------------------------------------------------------ -->
      <section class="card form-card" id="expense-form">
        <h2 class="section-title">
          @if (editing(); as expense) {
            <app-icon name="pencil" [size]="18" />
            ویرایش «{{ expense.title }}»
          } @else {
            <app-icon name="plus" [size]="18" />
            ثبت هزینه
          }
        </h2>

        @if (formError(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field">
            <label class="field__label" for="title">
              بابت چه چیزی<span class="field__required" aria-hidden="true">*</span>
            </label>
            <input
              id="title"
              class="field__control"
              formControlName="title"
              [attr.maxlength]="maxTitle"
              placeholder="مثلاً خرید لیوان کاغذی"
              [attr.aria-invalid]="invalid('title') ? 'true' : null"
            />
            @if (invalid('title')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                بابت چه چیزی خرج شد؟ کوتاه بنویسید (۱ تا ۱۲۰ نویسه).
              </p>
            }
          </div>

          <div class="field-grid field-grid--2">
            <div class="field">
              <label class="field__label" for="amount">
                مبلغ<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="amount"
                class="field__control"
                type="number"
                dir="ltr"
                inputmode="numeric"
                [min]="minAmount"
                [max]="maxAmount"
                step="1"
                formControlName="amount"
                [attr.aria-invalid]="invalid('amount') ? 'true' : null"
              />
              @if (invalid('amount')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  مبلغ را به ریال بنویسید — بیشتر از صفر.
                </p>
              } @else {
                <p class="field__hint">{{ amountPreview() }}</p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="spentAt">
                تاریخ خرج<span class="field__required" aria-hidden="true">*</span>
              </label>
              <!-- The control is Gregorian because that is the only date input a
                   browser has; the hint below carries the Jalali reading. -->
              <input
                id="spentAt"
                class="field__control code"
                type="date"
                dir="ltr"
                [max]="today"
                formControlName="spentAt"
                [attr.aria-invalid]="invalid('spentAt') ? 'true' : null"
              />
              @if (invalid('spentAt')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  تاریخ خرج را انتخاب کنید — نمی‌تواند در آینده باشد.
                </p>
              } @else {
                <p class="field__hint">{{ spentAtPreview() }}</p>
              }
            </div>
          </div>

          <div class="field-grid field-grid--2">
            <div class="field">
              <label class="field__label" for="category">دسته</label>
              <select id="category" class="field__control" formControlName="category">
                @for (category of categories; track category) {
                  <option [value]="category">{{ label(category) }}</option>
                }
              </select>
              <p class="field__hint">{{ categoryHint() }}</p>
            </div>

            <div class="field">
              <label class="field__label" for="paidById">
                پرداخت‌کننده<span class="field__required" aria-hidden="true">*</span>
              </label>
              <select
                id="paidById"
                class="field__control"
                formControlName="paidById"
                [attr.aria-invalid]="invalid('paidById') ? 'true' : null"
              >
                @for (payer of payers(); track payer.id) {
                  <option [value]="payer.id">{{ payerName(payer) }}</option>
                }
              </select>
              @if (invalid('paidById')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  پرداخت‌کننده را انتخاب کنید.
                </p>
              } @else {
                <p class="field__hint">کسی که پول را داده — نه لزوماً کسی که ثبتش می‌کند.</p>
              }
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="note">توضیح</label>
            <textarea
              id="note"
              class="field__control"
              rows="2"
              formControlName="note"
              [attr.maxlength]="maxNote"
              placeholder="مثلاً شمارهٔ فاکتور یا نام فروشنده."
              [attr.aria-invalid]="invalid('note') ? 'true' : null"
            ></textarea>
            @if (invalid('note')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                توضیح نباید بیشتر از ۵۰۰ نویسه باشد.
              </p>
            }
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn--primary btn--lg" [disabled]="saving()">
              @if (saving()) {
                <app-spinner [size]="18" [label]="isEditing() ? 'در حال ذخیره' : 'در حال ثبت'" />
              } @else if (isEditing()) {
                ذخیره تغییرات
              } @else {
                ثبت هزینه
              }
            </button>
            @if (isEditing()) {
              <button
                type="button"
                class="btn btn--ghost"
                (click)="cancelEdit()"
                [disabled]="saving()"
              >
                انصراف
              </button>
            } @else {
              <button
                type="button"
                class="btn btn--ghost"
                (click)="resetForm()"
                [disabled]="saving()"
              >
                پاک کردن فرم
              </button>
            }
          </div>
        </form>
      </section>

      <!-- The ledger ------------------------------------------------------ -->
      @if (loading()) {
        <div class="stack" aria-busy="true">
          @for (n of [1, 2, 3]; track n) {
            <div class="skeleton" style="height: 56px"></div>
          }
        </div>
      } @else if (listError(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (expenses().length === 0) {
        <div class="card">
          <app-empty-state
            icon="wallet"
            title="هنوز هزینه‌ای ثبت نشده"
            message="اولین هزینه را با فرم بالا ثبت کنید."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">بابت</th>
                <th scope="col">دسته</th>
                <th scope="col">مبلغ</th>
                <th scope="col">تاریخ</th>
                <th scope="col">پرداخت‌کننده</th>
                <th scope="col"><span class="visually-hidden">کارها</span></th>
              </tr>
            </thead>
            <tbody>
              @for (expense of expenses(); track expense.id) {
                <tr [class.row--editing]="isEditingExpense(expense)">
                  <td>
                    <span class="cell-title">{{ expense.title }}</span>
                    @if (expense.note) {
                      <span class="muted text-sm block">{{ expense.note }}</span>
                    }
                  </td>
                  <td>
                    <span class="cat">
                      <app-icon [name]="categoryIcon(expense.category)" [size]="16" />
                      {{ label(expense.category) }}
                    </span>
                  </td>
                  <td class="numeric">{{ money(expense) }}</td>
                  <td>{{ date(expense.spentAt) }}</td>
                  <td>{{ payerName(expense.paidBy) }}</td>
                  <td class="cell-action">
                    @if (confirming() === expense.id) {
                      <span class="confirm">
                        <span class="confirm__ask text-sm">حذف شود؟</span>
                        <button
                          type="button"
                          class="btn btn--danger btn--sm"
                          [disabled]="deleting() === expense.id"
                          (click)="remove(expense)"
                        >
                          @if (deleting() === expense.id) {
                            <app-spinner [size]="16" label="در حال حذف" />
                          } @else {
                            بله، حذف کن
                          }
                        </button>
                        <button
                          type="button"
                          class="btn btn--ghost btn--sm"
                          [disabled]="deleting() === expense.id"
                          (click)="cancelDelete()"
                        >
                          انصراف
                        </button>
                      </span>
                    } @else {
                      <span class="actions">
                        <button
                          type="button"
                          class="btn btn--ghost btn--sm"
                          [attr.aria-label]="'ویرایش ' + expense.title"
                          (click)="edit(expense)"
                        >
                          <app-icon name="pencil" [size]="16" />
                          ویرایش
                        </button>
                        <button
                          type="button"
                          class="btn btn--ghost btn--sm btn-delete"
                          [attr.aria-label]="'حذف ' + expense.title"
                          (click)="askDelete(expense)"
                        >
                          <app-icon name="trash" [size]="16" />
                          حذف
                        </button>
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <ul class="cards">
          @for (expense of expenses(); track expense.id) {
            <li class="card expense-card" [class.expense-card--editing]="isEditingExpense(expense)">
              <div class="expense-card__top">
                <span class="expense-card__title">{{ expense.title }}</span>
                <span class="numeric expense-card__amount">{{ money(expense) }}</span>
              </div>
              <dl class="expense-card__rows">
                <div>
                  <dt class="muted">دسته</dt>
                  <dd>
                    <span class="cat">
                      <app-icon [name]="categoryIcon(expense.category)" [size]="16" />
                      {{ label(expense.category) }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="muted">تاریخ</dt>
                  <dd>{{ date(expense.spentAt) }}</dd>
                </div>
                <div>
                  <dt class="muted">پرداخت‌کننده</dt>
                  <dd>{{ payerName(expense.paidBy) }}</dd>
                </div>
                @if (expense.note) {
                  <div>
                    <dt class="muted">توضیح</dt>
                    <dd>{{ expense.note }}</dd>
                  </div>
                }
              </dl>

              @if (confirming() === expense.id) {
                <div class="confirm confirm--card">
                  <span class="confirm__ask text-sm">این هزینه حذف شود؟</span>
                  <div class="confirm__buttons">
                    <button
                      type="button"
                      class="btn btn--danger btn--sm"
                      [disabled]="deleting() === expense.id"
                      (click)="remove(expense)"
                    >
                      @if (deleting() === expense.id) {
                        <app-spinner [size]="16" label="در حال حذف" />
                      } @else {
                        بله، حذف کن
                      }
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      [disabled]="deleting() === expense.id"
                      (click)="cancelDelete()"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              } @else {
                <div class="expense-card__actions">
                  <button
                    type="button"
                    class="btn btn--secondary btn--sm"
                    [attr.aria-label]="'ویرایش ' + expense.title"
                    (click)="edit(expense)"
                  >
                    <app-icon name="pencil" [size]="16" />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm btn-delete"
                    [attr.aria-label]="'حذف ' + expense.title"
                    (click)="askDelete(expense)"
                  >
                    <app-icon name="trash" [size]="16" />
                    حذف
                  </button>
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
    }

    .form-card {
      margin-bottom: var(--space-lg);
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      margin-bottom: var(--space-md);
      font-size: var(--fs-h3);
    }

    .alert {
      margin-bottom: var(--space-md);
    }

    .block {
      display: block;
    }

    .form-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      margin-top: var(--space-xs);
    }

    /* Category is icon + word, never the icon alone. */
    .cat {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      font-size: var(--fs-sm);
      color: var(--c-fg-muted);
      white-space: nowrap;
    }

    .cell-title {
      font-weight: 500;
    }

    .table-wrap {
      display: none;
    }

    .cards {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    @media (min-width: 768px) {
      .table-wrap {
        display: block;
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--radius-lg);
        overflow: hidden;
      }

      .cards {
        display: none;
      }
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      text-align: start;
    }

    .table th {
      background: var(--c-surface-2);
      text-align: start;
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--c-fg-muted);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--c-border);
    }

    .table td {
      height: 56px;
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--c-border);
      vertical-align: middle;
    }

    .table tbody tr:last-child td {
      border-bottom: 0;
    }

    /* The row being edited is the one the form above belongs to — tint plus the
       heading naming the expense, never the tint alone. */
    .table tbody tr.row--editing {
      background: var(--c-primary-tint);
    }

    .cell-action {
      text-align: end;
      white-space: nowrap;
    }

    .actions,
    .confirm {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-xs);
    }

    .btn-delete:hover:not(:disabled) {
      color: var(--c-danger);
    }

    .confirm__ask {
      color: var(--c-fg-muted);
    }

    .confirm--card {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
      margin-block-start: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border: 1px solid var(--c-danger);
      border-radius: var(--radius-md);
    }

    .confirm__buttons {
      display: flex;
      gap: var(--space-xs);
    }

    .expense-card__top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .expense-card__title {
      font-weight: 600;
    }

    .expense-card__amount {
      font-weight: 600;
      white-space: nowrap;
    }

    .expense-card--editing {
      border-color: var(--c-primary);
      background: var(--c-primary-tint);
    }

    .expense-card__rows {
      display: grid;
      gap: var(--space-xs);

      div {
        display: flex;
        justify-content: space-between;
        gap: var(--space-md);
        font-size: var(--fs-sm);
      }

      dd {
        margin: 0;
        text-align: end;
      }
    }

    .expense-card__actions {
      display: flex;
      gap: var(--space-sm);
      margin-block-start: var(--space-md);
    }
  `,
})
export class ExpensesPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AdminExpensesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly maxAmount = MAX_AMOUNT;
  protected readonly minAmount = MIN_AMOUNT;
  protected readonly maxTitle = MAX_TITLE;
  protected readonly maxNote = MAX_NOTE;
  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly payerName = formatPayerName;
  protected readonly date = formatDate;

  /**
   * The browser's today, not Tehran's — they differ for a few hours a day. It
   * only narrows the native picker; the API holds the real rule and answers in
   * Persian if the two disagree.
   */
  protected readonly today = todayIso();

  protected readonly expenses = signal<Expense[]>([]);
  protected readonly payers = signal<ExpensePayer[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  /** The row whose delete has been asked about, and the one being deleted. */
  protected readonly confirming = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);

  /**
   * The expense the form is currently pointed at, or null while it is an add
   * form — the same one-form-two-modes arrangement the products page uses.
   */
  protected readonly editing = signal<Expense | null>(null);
  protected readonly isEditing = computed(() => this.editing() !== null);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(MAX_TITLE)]],
    amount: [
      0,
      [Validators.required, Validators.min(MIN_AMOUNT), Validators.max(MAX_AMOUNT)],
    ],
    category: ['other' as ExpenseCategory, [Validators.required]],
    spentAt: [this.today, [Validators.required]],
    paidById: ['', [Validators.required]],
    note: ['', [Validators.maxLength(MAX_NOTE)]],
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.listError.set(null);
    this.cancelDelete();
    try {
      const [expenses, payers] = await Promise.all([this.api.list(), this.api.payers()]);
      this.expenses.set(expenses);
      this.payers.set(payers);
      if (!this.form.controls.paidById.value) {
        this.form.controls.paidById.setValue(this.defaultPayerId());
      }
    } catch (error) {
      this.listError.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  /** `۴ هزینه · مجموع ۱۲٬۰۰۰٬۰۰۰ ریال`, per currency if they ever differ. */
  protected summary(): string {
    const all = this.expenses();
    if (all.length === 0) return 'هنوز هزینه‌ای ثبت نشده است.';

    const byCurrency = new Map<string, number>();
    for (const expense of all) {
      byCurrency.set(expense.currency, (byCurrency.get(expense.currency) ?? 0) + expense.amount);
    }
    const totals = [...byCurrency]
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(' · ');

    return `${formatNumber(all.length)} هزینه · مجموع ${totals}`;
  }

  /** Echoes the typed amount back formatted, so a stray zero is visible. */
  protected amountPreview(): string {
    const amount = Number(this.form.controls.amount.value);
    if (!Number.isFinite(amount) || amount <= 0) return 'به ریال بنویسید.';
    return formatMoney(amount);
  }

  /** The Gregorian field, read back as the Jalali date the admin thinks in. */
  protected spentAtPreview(): string {
    const value = this.form.controls.spentAt.value;
    if (!value) return 'روزی که پول خرج شد.';
    return formatDate(value);
  }

  protected categoryHint(): string {
    return EXPENSE_CATEGORY_META[this.form.controls.category.value].hint;
  }

  protected label(category: ExpenseCategory): string {
    return EXPENSE_CATEGORY_META[category].label;
  }

  protected categoryIcon(category: ExpenseCategory): IconName {
    return EXPENSE_CATEGORY_META[category].icon as IconName;
  }

  protected money(expense: Expense): string {
    return formatMoney(expense.amount, expense.currency);
  }

  protected isEditingExpense(expense: Expense): boolean {
    return this.editing()?.id === expense.id;
  }

  /** Points the form at an existing expense and takes the admin to it. */
  protected edit(expense: Expense): void {
    this.editing.set(expense);
    this.formError.set(null);
    this.cancelDelete();
    this.form.reset({
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      spentAt: expense.spentAt,
      paidById: expense.paidBy.id,
      note: expense.note ?? '',
    });

    // The form sits above the ledger, so on a phone the row that was just
    // tapped is nowhere near it. Focus lands on the first field either way; the
    // scroll is the part that has to respect reduced motion.
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    document
      .getElementById('expense-form')
      ?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    document.getElementById('title')?.focus({ preventScroll: true });
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.resetForm();
  }

  protected resetForm(): void {
    this.form.reset({
      title: '',
      amount: 0,
      category: 'other',
      spentAt: this.today,
      paidById: this.defaultPayerId(),
      note: '',
    });
    this.formError.set(null);
  }

  protected askDelete(expense: Expense): void {
    this.confirming.set(expense.id);
  }

  protected cancelDelete(): void {
    this.confirming.set(null);
  }

  protected async remove(expense: Expense): Promise<void> {
    this.deleting.set(expense.id);
    try {
      await this.api.remove(expense.id);
      // If the form was pointed at this row, it is now pointed at nothing.
      if (this.isEditingExpense(expense)) this.cancelEdit();
      this.expenses.update((list) => list.filter((one) => one.id !== expense.id));
      this.toast.success(`«${expense.title}» حذف شد.`);
      this.cancelDelete();
    } catch (error) {
      this.toast.error((error as Error).message);
    } finally {
      this.deleting.set(null);
    }
  }

  protected async submit(): Promise<void> {
    this.formError.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const name = Object.keys(this.form.controls).find((key) => this.form.get(key)?.invalid);
      if (name) document.getElementById(name)?.focus();
      return;
    }

    const raw = this.form.getRawValue();
    const target = this.editing();

    this.saving.set(true);
    try {
      if (target) {
        const patch = this.patchAgainst(target, raw);
        if (Object.keys(patch).length === 0) {
          this.toast.info('چیزی تغییر نکرده بود.');
          this.cancelEdit();
          return;
        }
        const expense = await this.api.update(target.id, patch);
        this.toast.success(`«${expense.title}» ذخیره شد.`);
        this.cancelEdit();
      } else {
        const expense = await this.api.create(this.newExpense(raw));
        this.toast.success(`«${expense.title}» ثبت شد.`);
        this.resetForm();
      }
      await this.reload();
    } catch (error) {
      this.formError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  /** Whoever is signed in, which is who paid in the common case. */
  private defaultPayerId(): string {
    const me = this.auth.admin()?.id;
    if (me && this.payers().some((payer) => payer.id === me)) return me;
    return this.payers()[0]?.id ?? '';
  }

  /**
   * The API rejects unknown keys and empty strings alike — send only what was
   * filled in, and let the column defaults cover the rest.
   */
  private newExpense(raw: FormValue): CreateExpenseRequest {
    const payload: CreateExpenseRequest = {
      title: raw.title.trim(),
      amount: Number(raw.amount),
      category: raw.category,
      spentAt: raw.spentAt,
      paidById: raw.paidById,
    };
    if (raw.note.trim()) payload.note = raw.note.trim();
    return payload;
  }

  /**
   * Only what actually changed. Sending the untouched fields back would work,
   * but it would also mean one admin saving the form overwrites what another
   * corrected in the meantime — a patch narrows that to the fields in dispute.
   *
   * `null` on the note is deliberate: it is how the API is told to clear it, as
   * opposed to leaving it alone.
   */
  private patchAgainst(original: Expense, raw: FormValue): UpdateExpenseRequest {
    const patch: UpdateExpenseRequest = {};

    const title = raw.title.trim();
    if (title !== original.title) patch.title = title;

    const amount = Number(raw.amount);
    if (amount !== original.amount) patch.amount = amount;

    if (raw.category !== original.category) patch.category = raw.category;
    if (raw.spentAt !== original.spentAt) patch.spentAt = raw.spentAt;
    if (raw.paidById !== original.paidBy.id) patch.paidById = raw.paidById;

    const note = raw.note.trim() || null;
    if (note !== original.note) patch.note = note;

    return patch;
  }
}
