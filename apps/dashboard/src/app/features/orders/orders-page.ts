import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  ORDER_STATUSES,
  ORDER_STATUS_META,
  OrderDetail,
  OrderStatus,
  formatDeliveryDate,
  formatMoney,
  formatNumber,
  pluralCups,
  tomorrowIso,
} from '@romano/domain';
import { EmptyState, Icon, StatusChip, ToastService } from '@romano/ui';

import { AdminOrdersService } from '../../core/admin-orders.service';

const PAGE_SIZE = 25;

type StatusFilter = OrderStatus | 'all';

/**
 * The order queue.
 *
 * Rendered twice on purpose: a table from 768px up, a card list below it. The
 * design system rules out horizontal scrolling on a phone, and an order row has
 * more columns than a phone is ever going to fit.
 */
@Component({
  selector: 'app-orders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, StatusChip, EmptyState],
  template: `
    <div class="container page">
      <div class="head">
        <div>
          <h1 class="title">سفارش‌ها</h1>
          <p class="muted text-sm">{{ countLabel() }}</p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="reload()">
          <app-icon name="refresh" [size]="16" />
          تازه‌سازی
        </button>
      </div>

      <!-- Filters ------------------------------------------------------- -->
      <section class="card filters">
        <div class="tabs" role="tablist" aria-label="فیلتر وضعیت">
          @for (option of statusOptions; track option) {
            <button
              type="button"
              role="tab"
              class="tab"
              [class.is-active]="status() === option"
              [attr.aria-selected]="status() === option"
              (click)="setStatus(option)"
            >
              {{ statusLabel(option) }}
            </button>
          }
        </div>

        <div class="filter-row">
          <div class="field">
            <label class="field__label" for="search">جست‌وجو</label>
            <input
              id="search"
              class="field__control"
              type="search"
              [value]="search()"
              (input)="onSearch($event)"
              placeholder="شمارهٔ سفارش، نام، موبایل، تیم…"
            />
          </div>

          <div class="field">
            <label class="field__label" for="deliveryDate">تاریخ تحویل</label>
            <input
              id="deliveryDate"
              class="field__control"
              type="date"
              dir="ltr"
              [value]="deliveryDate() ?? ''"
              (change)="onDate($event)"
            />
          </div>

          <div class="filter-actions">
            <button type="button" class="btn btn--ghost btn--sm" (click)="onlyTomorrow()">
              فقط فردا
            </button>
            <button type="button" class="btn btn--ghost btn--sm" (click)="clearFilters()">
              پاک کردن
            </button>
          </div>
        </div>
      </section>

      @if (loading()) {
        <div class="stack" aria-busy="true">
          @for (n of [1, 2, 3, 4]; track n) {
            <div class="skeleton" style="height: 64px"></div>
          }
        </div>
      } @else if (error(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (orders().length === 0) {
        <div class="card">
          <app-empty-state
            icon="inbox"
            title="سفارشی با این فیلترها نیست"
            message="فیلترها را عوض کنید یا پاکشان کنید."
          />
        </div>
      } @else {
        <!-- Table, 768px and up ---------------------------------------- -->
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">سفارش</th>
                <th scope="col">مشتری</th>
                <th scope="col">تحویل</th>
                <th scope="col">فنجان</th>
                <th scope="col">پرداخت</th>
                <th scope="col">وضعیت</th>
                <th scope="col"><span class="visually-hidden">کارها</span></th>
              </tr>
            </thead>
            <tbody>
              @for (order of orders(); track order.id) {
                <tr>
                  <td>
                    <a class="code" [routerLink]="['/orders', order.id]">{{ order.orderNumber }}</a>
                  </td>
                  <td>
                    <span class="stack-cell">
                      <span>{{ order.contactName }}</span>
                      <span class="muted text-sm code">{{ order.contactMobile }}</span>
                    </span>
                  </td>
                  <td>
                    <span class="stack-cell">
                      <span>{{ date(order.deliveryDate) }}</span>
                      <span class="muted text-sm">{{ destination(order) }}</span>
                    </span>
                  </td>
                  <td class="numeric">{{ number(order.totalCups) }}</td>
                  <td>
                    <span class="text-sm">{{ paymentLabel(order) }}</span>
                  </td>
                  <td><app-status-chip [status]="order.status" /></td>
                  <td class="actions">
                    @for (action of actionsFor(order.status); track action.status) {
                      <button
                        type="button"
                        class="btn btn--sm"
                        [class.btn--primary]="action.status !== 'cancelled'"
                        [class.btn--danger]="action.status === 'cancelled'"
                        [disabled]="working() === order.id"
                        (click)="apply(order, action.status)"
                      >
                        {{ action.label }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Cards, below 768px ----------------------------------------- -->
        <ul class="cards">
          @for (order of orders(); track order.id) {
            <li class="card order-card">
              <div class="order-card__top">
                <a class="code" [routerLink]="['/orders', order.id]">{{ order.orderNumber }}</a>
                <app-status-chip [status]="order.status" />
              </div>
              <dl class="order-card__rows">
                <div><dt class="muted">مشتری</dt><dd>{{ order.contactName }}</dd></div>
                <div>
                  <dt class="muted">تحویل</dt>
                  <dd>{{ date(order.deliveryDate) }} · {{ destination(order) }}</dd>
                </div>
                <div><dt class="muted">فنجان</dt><dd class="numeric">{{ cups(order.totalCups) }}</dd></div>
                <div><dt class="muted">پرداخت</dt><dd>{{ paymentLabel(order) }}</dd></div>
                <div><dt class="muted">مبلغ</dt><dd class="numeric">{{ money(order.totalAmount, order.currency) }}</dd></div>
              </dl>
              <div class="actions">
                @for (action of actionsFor(order.status); track action.status) {
                  <button
                    type="button"
                    class="btn btn--sm"
                    [class.btn--primary]="action.status !== 'cancelled'"
                    [class.btn--danger]="action.status === 'cancelled'"
                    [disabled]="working() === order.id"
                    (click)="apply(order, action.status)"
                  >
                    {{ action.label }}
                  </button>
                }
              </div>
            </li>
          }
        </ul>

        @if (totalPages() > 1) {
          <nav class="pager" aria-label="صفحه‌بندی">
            <button
              type="button"
              class="btn btn--secondary btn--sm"
              [disabled]="page() <= 1"
              (click)="goTo(page() - 1)"
            >
              <app-icon name="chevron-right" [size]="16" />
              قبلی
            </button>
            <span class="muted text-sm numeric">
              صفحهٔ {{ number(page()) }} از {{ number(totalPages()) }}
            </span>
            <button
              type="button"
              class="btn btn--secondary btn--sm"
              [disabled]="page() >= totalPages()"
              (click)="goTo(page() + 1)"
            >
              بعدی
              <app-icon name="chevron-left" [size]="16" />
            </button>
          </nav>
        }
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

    .filters {
      margin-bottom: var(--space-md);
    }

    .tabs {
      display: flex;
      gap: var(--space-xs);
      overflow-x: auto;
      margin-bottom: var(--space-md);
    }

    .tab {
      min-height: 44px;
      padding: 0 var(--space-md);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-full);
      background: var(--c-surface);
      color: var(--c-fg-muted);
      font-size: var(--fs-sm);
      white-space: nowrap;
      cursor: pointer;
      transition:
        background-color var(--dur-base) var(--ease-out),
        color var(--dur-base) var(--ease-out);

      &:hover {
        color: var(--c-fg);
      }

      &.is-active {
        background: var(--c-primary);
        border-color: var(--c-primary);
        color: var(--c-on-primary);
        font-weight: 600;
      }
    }

    .filter-row {
      display: grid;
      gap: var(--space-md);
      grid-template-columns: 1fr;
    }

    .filter-actions {
      display: flex;
      align-items: flex-end;
      gap: var(--space-sm);
    }

    @media (min-width: 768px) {
      .filter-row {
        grid-template-columns: 2fr 1fr auto;
      }
    }

    /* Table / card swap */
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
      position: sticky;
      top: 0;
      z-index: 1;
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

    .table tbody tr:hover {
      background: var(--c-primary-tint);
    }

    .table tbody tr:last-child td {
      border-bottom: 0;
    }

    .stack-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .actions {
      display: flex;
      gap: var(--space-xs);
      flex-wrap: wrap;
    }

    .order-card__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .order-card__rows {
      display: grid;
      gap: var(--space-xs);
      margin-bottom: var(--space-md);

      > div {
        display: flex;
        justify-content: space-between;
        gap: var(--space-md);
      }
    }

    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-md);
      margin-top: var(--space-lg);
    }
  `,
})
export class OrdersPage {
  private readonly service = inject(AdminOrdersService);
  private readonly toasts = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly statusOptions: StatusFilter[] = ['all', ...ORDER_STATUSES];

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly orders = signal<OrderDetail[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly working = signal<string | null>(null);

  protected readonly status = signal<StatusFilter>('all');
  protected readonly search = signal('');
  protected readonly deliveryDate = signal<string | null>(null);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly countLabel = computed(() => `${formatNumber(this.total())} سفارش`);

  protected readonly date = formatDeliveryDate;
  protected readonly money = formatMoney;
  protected readonly cups = pluralCups;
  protected readonly number = formatNumber;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // The stats page links here with a status already chosen.
    const fromQuery = this.route.snapshot.queryParamMap.get('status');
    if (fromQuery && this.statusOptions.includes(fromQuery as StatusFilter)) {
      this.status.set(fromQuery as StatusFilter);
    }
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await this.service.list({
        status: this.status(),
        search: this.search(),
        deliveryDate: this.deliveryDate(),
        page: this.page(),
        pageSize: PAGE_SIZE,
      });
      this.orders.set(result.items);
      this.total.set(result.total);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected reload(): void {
    void this.load();
  }

  protected setStatus(status: StatusFilter): void {
    this.status.set(status);
    this.page.set(1);
    void this.load();
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);

    // Typing should not fire a request per keystroke.
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.load(), 300);
  }

  protected onDate(event: Event): void {
    this.deliveryDate.set((event.target as HTMLInputElement).value || null);
    this.page.set(1);
    void this.load();
  }

  protected onlyTomorrow(): void {
    this.deliveryDate.set(tomorrowIso());
    this.page.set(1);
    void this.load();
  }

  protected clearFilters(): void {
    this.status.set('all');
    this.search.set('');
    this.deliveryDate.set(null);
    this.page.set(1);
    void this.load();
  }

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    void this.load();
  }

  protected statusLabel(status: StatusFilter): string {
    return status === 'all' ? 'همه' : ORDER_STATUS_META[status].label;
  }

  protected destination(order: OrderDetail): string {
    return `${order.companyName} — ${order.teamName}`;
  }

  protected paymentLabel(order: OrderDetail): string {
    if (!order.payment) return '—';
    return {
      awaiting_receipt: 'بدون رسید',
      submitted: 'در انتظار بررسی',
      verified: 'تأیید شده',
      rejected: 'رد شده',
    }[order.payment.status];
  }

  /** Which moves are open from here — the same machine the API enforces. */
  protected actionsFor(status: OrderStatus): { status: OrderStatus; label: string }[] {
    if (status === 'pending') {
      return [
        { status: 'in_progress', label: 'تأیید' },
        { status: 'cancelled', label: 'لغو' },
      ];
    }
    if (status === 'in_progress') {
      return [
        { status: 'done', label: 'تحویل شد' },
        { status: 'cancelled', label: 'لغو' },
      ];
    }
    return [];
  }

  protected async apply(order: OrderDetail, status: OrderStatus): Promise<void> {
    let note: string | null = null;

    if (status === 'cancelled') {
      note = prompt(`چرا سفارش ${order.orderNumber} لغو می‌شود؟`);
      if (note === null) return;
    }

    this.working.set(order.id);
    try {
      await this.service.setStatus(order.id, status, note);
      this.toasts.success(`سفارش ${order.orderNumber} به‌روزرسانی شد.`);
      await this.load();
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.working.set(null);
    }
  }
}
