import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  formatDateTime,
  formatDeliveryDate,
  formatMoney,
  pluralCups,
  tomorrowIso,
} from '../../core/format';
import {
  ORDER_STATUSES,
  ORDER_STATUS_META,
  OrderDetail,
  OrderStatus,
  PAYMENT_STATUS_META,
} from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { ToastService } from '../../core/toast.service';
import { EmptyState } from '../../shared/empty-state';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';
import { StatusChip } from '../../shared/status-chip';

type StatusFilter = OrderStatus | 'all';

/**
 * Admin console: every order, filterable, with the status transitions the
 * lifecycle allows. The database enforces the same rules, so a stale UI can
 * never push an order into an illegal state.
 */
@Component({
  selector: 'app-admin-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, StatusChip, Spinner, EmptyState],
  template: `
    <div class="container page">
      <header class="head">
        <div>
          <h1 class="title">Orders</h1>
          <p class="muted text-sm">{{ summary() }}</p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="reload()" [disabled]="loading()">
          <app-icon name="refresh" [size]="16" />
          Refresh
        </button>
      </header>

      <!-- Filters ------------------------------------------------------- -->
      <section class="filters card">
        <div class="tabs" role="tablist" aria-label="Filter by status">
          @for (option of statusFilters; track option) {
            <button
              type="button"
              role="tab"
              class="tab"
              [class.is-active]="statusFilter() === option"
              [attr.aria-selected]="statusFilter() === option"
              (click)="setStatusFilter(option)"
            >
              {{ filterLabel(option) }}
              <span class="tab__count numeric">{{ countFor(option) }}</span>
            </button>
          }
        </div>

        <div class="filters__row">
          <div class="field">
            <label class="field__label" for="search">Search</label>
            <input
              id="search"
              class="field__control"
              type="search"
              placeholder="Order number, username or name"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
            />
          </div>

          <div class="field">
            <label class="field__label" for="date">Delivery day</label>
            <input
              id="date"
              class="field__control"
              type="date"
              [ngModel]="dateFilter()"
              (ngModelChange)="dateFilter.set($event)"
            />
          </div>

          <div class="filters__actions">
            <button type="button" class="btn btn--ghost btn--sm" (click)="showTomorrow()">
              Tomorrow only
            </button>
            <button type="button" class="btn btn--ghost btn--sm" (click)="clearFilters()">
              Clear
            </button>
          </div>
        </div>
      </section>

      @if (loading()) {
        <div class="stack" aria-busy="true">
          @for (n of [1, 2, 3, 4]; track n) {
            <div class="skeleton" style="height: 92px"></div>
          }
        </div>
      } @else if (error(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (visibleOrders().length === 0) {
        <div class="card">
          <app-empty-state
            icon="inbox"
            title="Nothing here"
            message="No orders match these filters. Try clearing them."
          />
        </div>
      } @else {
        <!-- Desktop table; below 768px this becomes the card list under it. -->
        <div class="table-wrap card">
          <table class="table">
            <caption class="visually-hidden">
              All orders, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Delivery</th>
                <th scope="col">Cups</th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (order of visibleOrders(); track order.id) {
                <tr>
                  <td>
                    <span class="numeric strong">{{ order.order_number }}</span>
                    <span class="muted text-sm block">{{ dateTime(order.created_at) }}</span>
                  </td>
                  <td>
                    <span class="strong">{{ customerName(order) }}</span>
                    <span class="muted text-sm block">
                      &#64;{{ order.customer_username }} · {{ order.customer_mobile }}
                    </span>
                  </td>
                  <td>
                    <span>{{ deliveryDate(order.delivery_date) }}</span>
                    <span class="muted text-sm block">{{ destination(order) }}</span>
                  </td>
                  <td class="numeric">{{ order.total_cups ?? 0 }}</td>
                  <td>
                    <span class="text-sm">{{ paymentLabel(order) }}</span>
                    @if (order.receipt_path) {
                      <button type="button" class="link-btn" (click)="viewReceipt(order)">
                        <app-icon name="receipt" [size]="14" />
                        View receipt
                      </button>
                    } @else {
                      <span class="muted text-sm block">No receipt</span>
                    }
                  </td>
                  <td><app-status-chip [status]="order.status" /></td>
                  <td>
                    <div class="actions">
                      @for (action of actionsFor(order.status); track action.status) {
                        <button
                          type="button"
                          class="btn btn--sm"
                          [class.btn--primary]="action.status === 'in_progress'"
                          [class.btn--secondary]="action.status === 'done'"
                          [class.btn--danger]="action.status === 'cancelled'"
                          (click)="transition(order, action.status)"
                          [disabled]="busyId() === order.id"
                        >
                          @if (busyId() === order.id) {
                            <app-spinner [size]="14" label="Updating" />
                          } @else {
                            {{ action.label }}
                          }
                        </button>
                      }
                      @if (actionsFor(order.status).length === 0) {
                        <span class="muted text-sm">No actions</span>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <ul class="cards">
          @for (order of visibleOrders(); track order.id) {
            <li class="card order-card">
              <div class="order-card__top">
                <span class="numeric strong">{{ order.order_number }}</span>
                <app-status-chip [status]="order.status" />
              </div>

              <p class="strong">{{ customerName(order) }}</p>
              <p class="muted text-sm">
                &#64;{{ order.customer_username }} · {{ order.customer_mobile }}
              </p>

              <dl class="order-card__rows">
                <div>
                  <dt class="muted text-sm">Delivery</dt>
                  <dd>{{ deliveryDate(order.delivery_date) }} · {{ destination(order) }}</dd>
                </div>
                <div>
                  <dt class="muted text-sm">Order</dt>
                  <dd>
                    {{ cups(order.total_cups ?? 0) }} ·
                    <span class="numeric">{{ money(order.total_amount, order.currency) }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="muted text-sm">Payment</dt>
                  <dd>{{ paymentLabel(order) }}</dd>
                </div>
              </dl>

              @if (order.receipt_path) {
                <button type="button" class="link-btn" (click)="viewReceipt(order)">
                  <app-icon name="receipt" [size]="14" />
                  View receipt
                </button>
              }

              <div class="actions">
                @for (action of actionsFor(order.status); track action.status) {
                  <button
                    type="button"
                    class="btn btn--sm"
                    [class.btn--primary]="action.status === 'in_progress'"
                    [class.btn--secondary]="action.status === 'done'"
                    [class.btn--danger]="action.status === 'cancelled'"
                    (click)="transition(order, action.status)"
                    [disabled]="busyId() === order.id"
                  >
                    {{ action.label }}
                  </button>
                }
              </div>
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

    .filters {
      margin-bottom: var(--space-lg);
    }

    .tabs {
      display: flex;
      gap: var(--space-xs);
      overflow-x: auto;
      padding-bottom: var(--space-sm);
      margin-bottom: var(--space-md);
      border-bottom: 1px solid var(--c-border);
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      min-height: 44px;
      padding: 0 var(--space-md);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--c-fg-muted);
      font-size: var(--fs-sm);
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);

      &:hover {
        background: var(--c-surface-2);
        color: var(--c-fg);
      }

      &.is-active {
        background: var(--c-primary-tint);
        border-color: var(--c-primary);
        color: var(--c-primary);
        font-weight: 600;
      }
    }

    .tab__count {
      font-size: var(--fs-xs);
      opacity: 0.8;
    }

    .filters__row {
      display: grid;
      gap: var(--space-md);
      align-items: end;
    }

    @media (min-width: 768px) {
      .filters__row {
        grid-template-columns: 2fr 1fr auto;
      }
    }

    .filters__actions {
      display: flex;
      gap: var(--space-xs);
    }

    /* Table (desktop) */
    .table-wrap {
      display: none;
      padding: 0;
      overflow-x: auto;
    }

    @media (min-width: 768px) {
      .table-wrap {
        display: block;
      }
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--fs-sm);
    }

    .table th {
      position: sticky;
      top: 0;
      background: var(--c-surface-2);
      text-align: left;
      font-weight: 600;
      padding: var(--space-md);
      border-bottom: 1px solid var(--c-border);
      white-space: nowrap;
    }

    .table td {
      padding: var(--space-md);
      border-bottom: 1px solid var(--c-border);
      vertical-align: top;
    }

    .table tbody tr:last-child td {
      border-bottom: 0;
    }

    .table tbody tr:hover {
      background: var(--c-primary-tint);
    }

    .strong {
      font-weight: 600;
    }

    .block {
      display: block;
      margin-top: 2px;
    }

    .link-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      margin-top: var(--space-xs);
      padding: 4px 0;
      background: none;
      border: 0;
      color: var(--c-primary);
      font-size: var(--fs-sm);
      font-weight: 500;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
    }

    /* Card list (mobile) — never a horizontally scrolling table. */
    .cards {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    @media (min-width: 768px) {
      .cards {
        display: none;
      }
    }

    .order-card__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
      margin-bottom: var(--space-sm);
    }

    .order-card__rows {
      margin: var(--space-md) 0;
      display: grid;
      gap: var(--space-sm);
    }

    .order-card__rows dt,
    .order-card__rows dd {
      margin: 0;
    }

    .order-card .actions {
      margin-top: var(--space-md);
    }
  `,
})
export class AdminOrders {
  private readonly ordersService = inject(OrdersService);
  private readonly toasts = inject(ToastService);

  protected readonly statusFilters: StatusFilter[] = ['all', ...ORDER_STATUSES];

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly orders = signal<OrderDetail[]>([]);
  protected readonly busyId = signal<string | null>(null);

  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly search = signal('');
  protected readonly dateFilter = signal('');

  protected readonly deliveryDate = formatDeliveryDate;
  protected readonly dateTime = formatDateTime;
  protected readonly money = formatMoney;
  protected readonly cups = pluralCups;

  /**
   * Filtering happens in the browser: the console loads at most 500 orders, so
   * refiltering is instant and does not hit the network on every keystroke.
   */
  protected readonly visibleOrders = computed(() => {
    const status = this.statusFilter();
    const date = this.dateFilter();
    const term = this.search().trim().toLowerCase();

    return this.orders().filter((order) => {
      if (status !== 'all' && order.status !== status) return false;
      if (date && order.delivery_date !== date) return false;

      if (term) {
        const haystack = [
          order.order_number,
          order.customer_username,
          order.customer_first_name,
          order.customer_last_name,
          order.customer_mobile,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  });

  protected readonly summary = computed(() => {
    const total = this.orders().length;
    const pending = this.orders().filter((o) => o.status === 'pending').length;
    if (total === 0) return 'No orders yet.';
    return `${total} order${total === 1 ? '' : 's'} · ${pending} waiting to be accepted`;
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.orders.set(await this.ordersService.all());
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
  }

  protected filterLabel(status: StatusFilter): string {
    return status === 'all' ? 'All' : ORDER_STATUS_META[status].label;
  }

  protected countFor(status: StatusFilter): number {
    return status === 'all'
      ? this.orders().length
      : this.orders().filter((o) => o.status === status).length;
  }

  protected showTomorrow(): void {
    this.dateFilter.set(tomorrowIso());
  }

  protected clearFilters(): void {
    this.statusFilter.set('all');
    this.search.set('');
    this.dateFilter.set('');
  }

  protected customerName(order: OrderDetail): string {
    return `${order.customer_first_name ?? ''} ${order.customer_last_name ?? ''}`.trim() || 'Unknown';
  }

  protected destination(order: OrderDetail): string {
    return order.delivery_target === 'seat'
      ? `Seat ${order.seat_code ?? '—'}`
      : (order.refrigerator_label ?? 'Nearest fridge');
  }

  protected paymentLabel(order: OrderDetail): string {
    return order.payment_status ? PAYMENT_STATUS_META[order.payment_status].label : '—';
  }

  /** The transitions the status machine allows from here. */
  protected actionsFor(status: OrderStatus): { status: OrderStatus; label: string }[] {
    switch (status) {
      case 'pending':
        return [
          { status: 'in_progress', label: 'Accept' },
          { status: 'cancelled', label: 'Cancel' },
        ];
      case 'in_progress':
        return [
          { status: 'done', label: 'Mark done' },
          { status: 'cancelled', label: 'Cancel' },
        ];
      default:
        return [];
    }
  }

  protected async transition(order: OrderDetail, status: OrderStatus): Promise<void> {
    let note: string | null = null;

    if (status === 'cancelled') {
      const reason = prompt(
        `Cancel order ${order.order_number}?\n\nGive the customer a reason (optional):`,
      );
      // `null` means the admin dismissed the prompt — do nothing.
      if (reason === null) return;
      note = reason.trim() || null;
    }

    this.busyId.set(order.id);
    try {
      await this.ordersService.setStatus(order.id, status, note);
      this.toasts.success(
        `Order ${order.order_number} is now ${ORDER_STATUS_META[status].label.toLowerCase()}.`,
      );
      await this.reload();
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.busyId.set(null);
    }
  }

  protected async viewReceipt(order: OrderDetail): Promise<void> {
    if (!order.receipt_path) return;

    const url = await this.ordersService.receiptUrl(order.receipt_path);
    if (url) {
      window.open(url, '_blank', 'noopener');
    } else {
      this.toasts.error('Could not open that receipt.');
    }
  }
}
