import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDeliveryDate, formatMoney, pluralCups } from '../../core/format';
import { OrderDetail } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { EmptyState } from '../../shared/empty-state';
import { Icon } from '../../shared/icon';
import { StatusChip } from '../../shared/status-chip';

@Component({
  selector: 'app-my-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, StatusChip, EmptyState],
  template: `
    <div class="container container--narrow page">
      <div class="head">
        <h1 class="title">سفارش‌های من</h1>
        <a routerLink="/order" class="btn btn--primary btn--sm">
          <app-icon name="plus" [size]="16" />
          سفارش جدید
        </a>
      </div>

      @if (loading()) {
        <div class="stack" aria-busy="true">
          @for (n of [1, 2, 3]; track n) {
            <div class="skeleton" style="height: 108px"></div>
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
            icon="coffee"
            title="هنوز سفارشی ندارید"
            message="اولین رومانوی خود را سفارش بدهید تا فردا صبح آماده باشد."
          >
            <a routerLink="/order" class="btn btn--primary" style="margin-top: var(--space-sm)">
              سفارش یک رومانو
            </a>
          </app-empty-state>
        </div>
      } @else {
        <ul class="list">
          @for (order of orders(); track order.id) {
            <li>
              <a class="order" [routerLink]="['/orders', order.id]">
                <div class="order__top">
                  <span class="order__number code">{{ order.order_number }}</span>
                  <app-status-chip [status]="order.status" />
                </div>

                <p class="order__date">{{ deliveryDate(order.delivery_date) }}</p>

                <div class="order__meta muted text-sm">
                  <span class="order__meta-item">
                    <app-icon name="coffee" [size]="15" />
                    {{ cups(order.total_cups ?? 0) }}
                  </span>
                  <span class="order__meta-item">
                    <app-icon
                      [name]="order.delivery_target === 'seat' ? 'seat' : 'fridge'"
                      [size]="15"
                    />
                    {{ destination(order) }}
                  </span>
                  <span class="order__meta-item numeric">
                    {{ money(order.total_amount, order.currency) }}
                  </span>
                </div>
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-lg);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    .order {
      display: block;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: var(--space-lg);
      text-decoration: none;
      color: inherit;
      transition: box-shadow var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out);

      &:hover {
        box-shadow: var(--shadow-md);
      }

      &:active {
        transform: scale(0.99);
      }
    }

    .order__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-sm);
    }

    .order__number {
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--c-fg-muted);
    }

    .order__date {
      margin-top: var(--space-sm);
      font-weight: 600;
    }

    .order__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-md);
      margin-top: var(--space-sm);
    }

    .order__meta-item {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
    }
  `,
})
export class MyOrders {
  private readonly ordersService = inject(OrdersService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly orders = signal<OrderDetail[]>([]);

  protected readonly deliveryDate = formatDeliveryDate;
  protected readonly money = formatMoney;
  protected readonly cups = pluralCups;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.orders.set(await this.ordersService.mine());
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected destination(order: OrderDetail): string {
    return order.delivery_target === 'seat'
      ? (order.seat_code ?? 'میز شما')
      : (order.refrigerator_label ?? 'نزدیک‌ترین یخچال');
  }
}
