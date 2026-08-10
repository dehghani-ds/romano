import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  AdminStats,
  ORDER_STATUSES,
  ORDER_STATUS_META,
  OrderStatus,
  formatDeliveryDate,
  formatNumber,
  tomorrowIso,
} from '@romano/domain';
import { Icon } from '@romano/ui';

import { AdminOrdersService } from '../../core/admin-orders.service';

/** What the person opening the console actually needs to know first. */
@Component({
  selector: 'app-stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <div class="container page">
      <h1 class="title">خلاصه</h1>
      <p class="muted text-sm intro">{{ tomorrowLabel }}</p>

      @if (loading()) {
        <div class="grid" aria-busy="true">
          @for (n of [1, 2, 3, 4]; track n) {
            <div class="skeleton" style="height: 108px"></div>
          }
        </div>
      } @else if (error(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (stats(); as s) {
        <section class="highlight card">
          <span class="highlight__icon"><app-icon name="coffee" [size]="24" /></span>
          <div>
            <p class="muted text-sm">برای فردا باید آماده شود</p>
            <!-- A plain count: tomorrow's orders can mix فنجان with عدد. -->
            <p class="highlight__value numeric">{{ number(s.tomorrow.quantity) }} مورد</p>
            <p class="muted text-sm">
              در {{ number(s.tomorrow.orders) }} سفارش تأییدشده و در انتظار
            </p>
          </div>
        </section>

        <div class="grid">
          @for (status of statuses; track status) {
            <a class="stat card" [routerLink]="['/orders']" [queryParams]="{ status }">
              <span class="stat__label">
                <app-icon [name]="iconFor(status)" [size]="16" />
                {{ label(status) }}
              </span>
              <span class="stat__value numeric">{{ number(s.byStatus[status]) }}</span>
            </a>
          }
        </div>

        @if (s.awaitingReceiptReview > 0) {
          <div class="alert alert--warning review">
            <app-icon name="receipt" [size]="18" />
            <span>
              {{ number(s.awaitingReceiptReview) }} رسید منتظر بررسی شماست.
              <a routerLink="/orders">بررسی کنید</a>
            </span>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
    }

    .intro {
      margin-top: var(--space-xs);
      margin-bottom: var(--space-lg);
    }

    .highlight {
      display: flex;
      align-items: center;
      gap: var(--space-lg);
      margin-bottom: var(--space-md);
    }

    .highlight__icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: var(--radius-lg);
      background: var(--c-primary);
      color: var(--c-on-primary);
    }

    .highlight__value {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
      font-weight: 600;
      line-height: var(--lh-tight);
    }

    .grid {
      display: grid;
      gap: var(--space-md);
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      text-decoration: none;
      color: inherit;
      transition: border-color var(--dur-base) var(--ease-out);

      &:hover {
        border-color: var(--c-primary);
      }
    }

    .stat__label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      color: var(--c-fg-muted);
      font-size: var(--fs-sm);
    }

    .stat__value {
      font-family: var(--font-display);
      font-size: var(--fs-h2);
      font-weight: 600;
    }

    .review {
      margin-top: var(--space-md);
    }
  `,
})
export class StatsPage {
  private readonly service = inject(AdminOrdersService);

  protected readonly statuses = ORDER_STATUSES;
  protected readonly tomorrowLabel = `تحویل ${formatDeliveryDate(tomorrowIso())}`;

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<AdminStats | null>(null);

  protected readonly number = formatNumber;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.stats.set(await this.service.stats());
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected label(status: OrderStatus): string {
    return ORDER_STATUS_META[status].label;
  }

  protected iconFor(status: OrderStatus): 'clock' | 'refresh' | 'check' | 'x' {
    return ORDER_STATUS_META[status].icon as 'clock' | 'refresh' | 'check' | 'x';
  }
}
