import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CardToCardDestination, ORDER_STATUS_META, OrderDetail, OrderItem, OrderStatusHistoryEntry, formatDateTime, formatDeliveryDate, formatMoney, formatQuantity } from '@romano/domain';
import { Icon, Spinner, StatusChip, ToastService } from '@romano/ui';

import { OrdersService } from '../../core/orders.service';
import { PaymentsService } from '../../core/payments.service';
import { PaymentSection } from './payment-section';

@Component({
  selector: 'app-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, StatusChip, Spinner, PaymentSection],
  template: `
    <div class="container container--narrow page">
      <a routerLink="/orders" class="back">
        <app-icon name="chevron-right" [size]="16" />
        همهٔ سفارش‌ها
      </a>

      @if (loading()) {
        <div class="card stack" aria-busy="true">
          <div class="skeleton" style="height: 32px; width: 50%"></div>
          <div class="skeleton" style="height: 140px"></div>
        </div>
      } @else if (error(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (order(); as o) {
        <header class="head">
          <div>
            <p class="code muted text-sm">{{ o.orderNumber }}</p>
            <h1 class="title">{{ deliveryDate(o.deliveryDate) }}</h1>
          </div>
          <app-status-chip [status]="o.status" />
        </header>

        <p class="muted status-note">{{ statusMeta().description }}</p>

        <!-- What was ordered -------------------------------------------- -->
        <section class="card">
          <h2 class="section-title">سفارش شما</h2>
          <dl class="rows">
            <div class="row row--items">
              <dt class="muted">سبد</dt>
              <dd>
                <ul class="items">
                  @for (item of o.items; track item.productId) {
                    <li class="item">
                      <span class="item__name">{{ item.productName }}</span>
                      <span class="item__count">{{ quantity(item) }}</span>
                      <span class="item__total numeric">
                        {{ money(item.lineTotal, o.currency) }}
                      </span>
                    </li>
                  }
                </ul>
              </dd>
            </div>
            <div class="row">
              <dt class="muted">محل تحویل</dt>
              <dd>
                <app-icon name="users" [size]="15" />
                {{ destination() }}
              </dd>
            </div>
            <div class="row">
              <dt class="muted">تحویل‌گیرنده</dt>
              <dd>{{ o.contactName }} · <span class="code">{{ o.contactMobile }}</span></dd>
            </div>
            @if (o.notes) {
              <div class="row">
                <dt class="muted">یادداشت شما</dt>
                <dd>{{ o.notes }}</dd>
              </div>
            }
            <div class="row row--total">
              <dt>مجموع</dt>
              <dd class="numeric">{{ money(o.totalAmount, o.currency) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Payment ------------------------------------------------------ -->
        <section class="card">
          <app-payment-section
            [order]="o"
            [onlineEnabled]="onlineEnabled()"
            [cardToCard]="cardToCard()"
            (changed)="reload()"
            (viewReceipt)="viewReceipt()"
          />
        </section>

        <!-- Timeline ----------------------------------------------------- -->
        <section class="card">
          <h2 class="section-title">روند سفارش</h2>
          @if (history().length === 0) {
            <p class="muted text-sm">هنوز به‌روزرسانی‌ای نیست.</p>
          } @else {
            <ol class="timeline">
              @for (entry of history(); track entry.id) {
                <li class="timeline__item">
                  <span class="timeline__dot" [attr.data-status]="entry.toStatus"></span>
                  <div>
                    <p class="timeline__label">{{ statusLabel(entry) }}</p>
                    <p class="muted text-sm">{{ dateTime(entry.createdAt) }}</p>
                    @if (entry.note) {
                      <p class="text-sm timeline__note">{{ entry.note }}</p>
                    }
                  </div>
                </li>
              }
            </ol>
          }
        </section>

        @if (o.adminNote) {
          <div class="alert alert--info">
            <app-icon name="alert" [size]="18" />
            <span><strong>یادداشت تیم:</strong> {{ o.adminNote }}</span>
          </div>
        }

        @if (o.status === 'pending') {
          <section class="card danger-zone">
            <h2 class="section-title">لغو این سفارش</h2>
            <p class="muted text-sm">
              تا وقتی سفارش در انتظار است می‌توانید آن را پس بگیرید. پس از تأیید مدیر، لغو آن را
              از خودش بخواهید.
            </p>
            <button
              type="button"
              class="btn btn--danger btn--sm"
              (click)="cancel()"
              [disabled]="cancelling()"
            >
              @if (cancelling()) {
                <app-spinner [size]="16" label="در حال لغو" />
              } @else {
                لغو سفارش
              }
            </button>
          </section>
        }
      }
    </div>
  `,
  styles: `
    .row--items dd {
      width: 100%;
    }

    .items {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-xs);
      width: 100%;
    }

    .item {
      display: flex;
      align-items: baseline;
      gap: var(--space-sm);
    }

    .item__count {
      color: var(--c-fg-muted);
      font-size: var(--fs-sm);
    }

    .item__total {
      margin-inline-start: auto;
    }

    .back {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      min-height: 44px;
      color: var(--c-fg-muted);
      text-decoration: none;
      font-size: var(--fs-sm);
      font-weight: 500;

      &:hover {
        color: var(--c-primary);
      }
    }

    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-md);
      margin-top: var(--space-sm);
    }

    .title {
      font-family: var(--font-display);
      font-size: var(--fs-h1);
      margin-top: var(--space-xs);
    }

    .status-note {
      margin-top: var(--space-xs);
      margin-bottom: var(--space-lg);
      font-size: var(--fs-sm);
    }

    .card + .card,
    .card + .alert,
    .alert + .card {
      margin-top: var(--space-md);
    }

    .section-title {
      font-size: var(--fs-body);
      font-weight: 600;
      margin-bottom: var(--space-md);
    }

    .rows {
      margin: 0;
      display: grid;
      gap: var(--space-sm);
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-md);
    }

    .row dt,
    .row dd {
      margin: 0;
    }

    .row dd {
      text-align: end;
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
    }

    .row--total {
      margin-top: var(--space-xs);
      padding-top: var(--space-md);
      border-top: 1px solid var(--c-border);
      font-weight: 600;
      font-size: var(--fs-h3);
    }

    /* Timeline */
    .timeline {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-md);
    }

    .timeline__item {
      display: flex;
      gap: var(--space-md);
      align-items: flex-start;
    }

    .timeline__dot {
      flex: none;
      width: 12px;
      height: 12px;
      margin-top: 6px;
      border-radius: var(--radius-full);
      background: var(--c-fg-subtle);
    }

    .timeline__dot[data-status='pending'] {
      background: var(--c-warning);
    }
    .timeline__dot[data-status='in_progress'] {
      background: var(--c-info);
    }
    .timeline__dot[data-status='done'] {
      background: var(--c-success);
    }
    .timeline__dot[data-status='cancelled'] {
      background: var(--c-danger);
    }

    .timeline__label {
      font-weight: 600;
    }

    .timeline__note {
      margin-top: var(--space-xs);
    }

    .danger-zone {
      border-color: var(--c-border-strong);
    }

    .danger-zone .btn {
      margin-top: var(--space-md);
    }
  `,
})
export class OrderDetailPage {
  /** Bound from the `:id` route parameter by withComponentInputBinding(). */
  readonly id = input.required<string>();

  /**
   * Set only when the customer has just come back from the payment gateway.
   *
   * The API redirects here with the outcome and a sentence it wrote itself —
   * the same rule as every other error in the app, so there is no table of
   * Persian strings in the client mirroring the gateway's status codes.
   */
  readonly payment = input<string | undefined>(undefined);
  readonly message = input<string | undefined>(undefined);

  private readonly ordersService = inject(OrdersService);
  private readonly payments = inject(PaymentsService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly order = signal<OrderDetail | null>(null);
  protected readonly history = signal<OrderStatusHistoryEntry[]>([]);
  protected readonly onlineEnabled = signal(false);
  protected readonly cardToCard = signal<CardToCardDestination | null>(null);

  protected readonly cancelling = signal(false);

  protected readonly deliveryDate = formatDeliveryDate;
  protected readonly dateTime = formatDateTime;
  protected readonly money = formatMoney;
  /** `۲ فنجان` for coffee, `۳ عدد` for a cookie — the line carries its unit. */
  protected quantity(item: OrderItem): string {
    return formatQuantity(item.quantity, item.unit);
  }

  protected readonly statusMeta = computed(
    () => ORDER_STATUS_META[this.order()?.status ?? 'pending'],
  );

  protected readonly destination = computed(() => {
    const order = this.order();
    return order ? `${order.companyName} — ${order.teamName}` : '';
  });

  constructor() {
    // A required input is not populated until after construction, so the fetch
    // is driven by an effect. Keying it on id() also reloads the page when the
    // router reuses this component to show a different order.
    effect(() => {
      const orderId = this.id();
      void this.load(orderId);
    });

    // Separate from the load effect: coming back from the gateway changes the
    // query string but not the id, and this must run on that change alone.
    effect(() => {
      const outcome = this.payment();
      if (outcome) untracked(() => this.announceGatewayReturn(outcome, this.message()));
    });

    void this.payments.options().then((options) => {
      this.onlineEnabled.set(options.onlineEnabled);
      this.cardToCard.set(options.cardToCard);
    });
  }

  private async load(orderId = this.id()): Promise<void> {
    this.loading.set(true);
    try {
      const order = await this.ordersService.byId(orderId);
      this.order.set(order);
      this.history.set(await this.ordersService.history(order.id));
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-reads the order after something changed it — a receipt, a payment. */
  protected reload(): void {
    void this.load();
  }

  /**
   * Reports what the gateway concluded, then takes it back out of the URL.
   *
   * The outcome is a fact about one visit, not about the order: leaving it in
   * the address bar means a bookmark, a refresh or a shared link replays a
   * payment result that may no longer be true. `replaceUrl` also keeps the
   * gateway's redirect out of the back button.
   */
  private announceGatewayReturn(outcome: string, message: string | undefined): void {
    const text = message?.trim();

    if (outcome === 'paid') {
      this.toasts.success(text || 'پرداخت شما انجام شد.');
    } else if (outcome === 'failed') {
      this.toasts.error(text || 'پرداخت انجام نشد.');
    } else {
      this.toasts.error(text || 'وضعیت پرداخت مشخص نشد. چند لحظه بعد دوباره بررسی کنید.');
    }

    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected statusLabel(entry: OrderStatusHistoryEntry): string {
    const to = ORDER_STATUS_META[entry.toStatus].label;
    // The arrow points the way the eye moves in an RTL page: from → to.
    return entry.fromStatus
      ? `${ORDER_STATUS_META[entry.fromStatus].label} ← ${to}`
      : `سفارش ثبت شد — ${to}`;
  }

  /**
   * The receipt sits behind an authenticated endpoint, so a plain link cannot
   * reach it — fetch the bytes, hand the tab an object URL, then release it.
   */
  protected async viewReceipt(): Promise<void> {
    const order = this.order();
    if (!order?.payment?.hasReceipt) return;

    try {
      const url = await this.ordersService.receiptObjectUrl(order.id);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      this.toasts.error((err as Error).message);
    }
  }

  protected async cancel(): Promise<void> {
    const order = this.order();
    if (!order) return;

    const confirmed = confirm(
      `سفارش ${order.orderNumber} لغو شود؟ این کار برگشت‌پذیر نیست.`,
    );
    if (!confirmed) return;

    this.cancelling.set(true);
    try {
      await this.ordersService.cancel(order.id);
      this.toasts.success('سفارش لغو شد.');
      await this.load();
    } catch (err) {
      this.toasts.error((err as Error).message);
    } finally {
      this.cancelling.set(false);
    }
  }
}
