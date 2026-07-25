import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { formatDeliveryDate, formatMoney, pluralCups, tomorrowIso } from '../../core/format';
import { DeliveryTarget, Product } from '../../core/models';
import { OrdersService } from '../../core/orders.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';

const MAX_CUPS = 20;
const MIN_CUPS = 1;

/**
 * The order flow: pick how many Romanos, choose where they go, optionally
 * attach a receipt, confirm.
 *
 * Price and the delivery point are resolved by the `place_order` RPC — the
 * numbers here are for display only.
 */
@Component({
  selector: 'app-new-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <h1 class="title">Order for tomorrow</h1>
      <p class="muted text-sm intro">{{ deliveryDateLabel }}</p>

      @if (loading()) {
        <div class="card stack" aria-busy="true">
          <div class="skeleton" style="height: 28px; width: 45%"></div>
          <div class="skeleton" style="height: 76px"></div>
          <div class="skeleton" style="height: 120px"></div>
        </div>
      } @else if (loadError(); as message) {
        <div class="alert alert--error" role="alert">
          <app-icon name="alert" [size]="18" />
          <span>{{ message }}</span>
        </div>
      } @else if (!profileSeat()) {
        <div class="card">
          <div class="alert alert--warning">
            <app-icon name="alert" [size]="18" />
            <span>
              Your profile does not have a seat yet. Set it before ordering so we know where to
              deliver.
            </span>
          </div>
          <a routerLink="/profile" class="btn btn--primary" style="margin-top: var(--space-md)">
            Set your seat
          </a>
        </div>
      } @else if (product(); as item) {
        <form class="stack" (submit)="submit($event)">
          <!-- Product ------------------------------------------------------ -->
          <section class="card product">
            <span class="product__mark"><app-icon name="coffee" [size]="26" /></span>
            <div class="product__body">
              <h2 class="product__name">{{ item.name }}</h2>
              <p class="muted text-sm">{{ item.description }}</p>
              <p class="product__price numeric">{{ money(item.price, item.currency) }} per cup</p>
            </div>
          </section>

          <!-- Quantity ----------------------------------------------------- -->
          <section class="card">
            <h2 class="section-title">How many cups?</h2>
            <div class="stepper">
              <button
                type="button"
                class="stepper__btn"
                (click)="decrement()"
                [disabled]="quantity() <= minCups"
                aria-label="One cup fewer"
              >
                <app-icon name="minus" [size]="20" />
              </button>

              <label class="visually-hidden" for="quantity">Number of cups</label>
              <input
                id="quantity"
                class="stepper__value numeric"
                type="number"
                inputmode="numeric"
                [min]="minCups"
                [max]="maxCups"
                [value]="quantity()"
                (input)="onQuantityInput($event)"
              />

              <button
                type="button"
                class="stepper__btn"
                (click)="increment()"
                [disabled]="quantity() >= maxCups"
                aria-label="One cup more"
              >
                <app-icon name="plus" [size]="20" />
              </button>
            </div>

            @if (quantity() >= maxCups) {
              <p class="field__hint">
                Twenty cups is the most one order can hold. Place a second order for more.
              </p>
            } @else if (quantity() <= minCups) {
              <p class="field__hint">At least one cup.</p>
            }
          </section>

          <!-- Delivery ----------------------------------------------------- -->
          <section class="card">
            <h2 class="section-title">Where should it go?</h2>

            <div class="choices" role="radiogroup" aria-label="Delivery point">
              <label class="choice" [class.is-selected]="target() === 'seat'">
                <input
                  type="radio"
                  name="target"
                  value="seat"
                  [checked]="target() === 'seat'"
                  (change)="target.set('seat')"
                />
                <span class="choice__icon"><app-icon name="seat" [size]="20" /></span>
                <span class="choice__body">
                  <span class="choice__title">My seat</span>
                  <span class="choice__meta muted">{{ seatSummary() }}</span>
                </span>
              </label>

              <label
                class="choice"
                [class.is-selected]="target() === 'refrigerator'"
                [class.is-disabled]="!hasFridge()"
              >
                <input
                  type="radio"
                  name="target"
                  value="refrigerator"
                  [checked]="target() === 'refrigerator'"
                  [disabled]="!hasFridge()"
                  (change)="target.set('refrigerator')"
                />
                <span class="choice__icon"><app-icon name="fridge" [size]="20" /></span>
                <span class="choice__body">
                  <span class="choice__title">Nearest refrigerator</span>
                  <span class="choice__meta muted">{{ fridgeSummary() }}</span>
                </span>
              </label>
            </div>
          </section>

          <!-- Note --------------------------------------------------------- -->
          <section class="card">
            <div class="field">
              <label class="field__label" for="notes">Note for the barista (optional)</label>
              <textarea
                id="notes"
                class="field__control"
                maxlength="500"
                [value]="notes()"
                (input)="onNotesInput($event)"
                placeholder="Anything we should know?"
              ></textarea>
              <p class="field__hint">{{ notes().length }} / 500</p>
            </div>
          </section>

          <!-- Receipt ------------------------------------------------------ -->
          <section class="card">
            <h2 class="section-title">Payment receipt</h2>
            <p class="muted text-sm">
              Optional for now. An admin checks it before starting your order — you can also add it
              later from the order page.
            </p>

            <label class="upload" [class.is-set]="receipt() !== null">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                (change)="onFileSelected($event)"
              />
              <app-icon name="upload" [size]="20" />
              <span>{{ receipt()?.name ?? 'Choose a receipt image or PDF' }}</span>
            </label>
            @if (receiptError(); as message) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                {{ message }}
              </p>
            } @else {
              <p class="field__hint">JPEG, PNG, WebP, HEIC or PDF — up to 5 MB.</p>
            }
          </section>

          @if (error(); as message) {
            <div class="alert alert--error" role="alert">
              <app-icon name="alert" [size]="18" />
              <span>{{ message }}</span>
            </div>
          }

          <!-- Summary + CTA ------------------------------------------------ -->
          <section class="card summary">
            <div class="summary__row">
              <span class="muted">{{ cupsLabel() }}</span>
              <span class="numeric">{{ money(item.price * quantity(), item.currency) }}</span>
            </div>
            <div class="summary__row summary__row--total">
              <span>Total</span>
              <span class="numeric">{{ money(item.price * quantity(), item.currency) }}</span>
            </div>

            <button type="submit" class="btn btn--accent btn--block btn--lg" [disabled]="busy()">
              @if (busy()) {
                <app-spinner [size]="18" label="Placing your order" />
              } @else {
                Place order
              }
            </button>
            <p class="text-sm muted summary__note">
              Your order starts as <strong>pending</strong> until an admin accepts it.
            </p>
          </section>
        </form>
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

    .section-title {
      font-size: var(--fs-body);
      font-weight: 600;
      margin-bottom: var(--space-md);
    }

    .product {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md);
    }

    .product__mark {
      display: grid;
      place-items: center;
      flex: none;
      width: 56px;
      height: 56px;
      border-radius: var(--radius-lg);
      background: var(--c-primary);
      color: var(--c-on-primary);
    }

    .product__name {
      font-family: var(--font-display);
      font-size: var(--fs-h2);
      margin-bottom: var(--space-xs);
    }

    .product__price {
      margin-top: var(--space-sm);
      font-weight: 600;
      color: var(--c-primary);
    }

    /* Quantity stepper */
    .stepper {
      display: flex;
      align-items: center;
      gap: var(--space-md);
    }

    .stepper__btn {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex: none;
      border: 1px solid var(--c-border-strong);
      border-radius: var(--radius-full);
      background: var(--c-surface);
      color: var(--c-fg);
      cursor: pointer;
      transition: background-color var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out);

      &:hover:not(:disabled) {
        background: var(--c-primary-tint);
        border-color: var(--c-primary);
        color: var(--c-primary);
      }

      &:active:not(:disabled) {
        transform: scale(0.95);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .stepper__value {
      width: 88px;
      height: 56px;
      text-align: center;
      font-size: 1.5rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      border: 1px solid var(--c-border-strong);
      border-radius: var(--radius-md);
      background: var(--c-surface);
      color: var(--c-fg);

      &:focus {
        outline: none;
        border-color: var(--c-primary);
        box-shadow: 0 0 0 3px var(--c-ring-shadow);
      }
    }

    /* Delivery choices */
    .choices {
      display: grid;
      gap: var(--space-sm);
    }

    .choice {
      display: flex;
      align-items: center;
      gap: var(--space-md);
      min-height: 64px;
      padding: var(--space-md);
      border: 1px solid var(--c-border-strong);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: border-color var(--dur-base) var(--ease-out), background-color var(--dur-base) var(--ease-out);

      &:hover:not(.is-disabled) {
        border-color: var(--c-primary);
      }

      &.is-selected {
        border-color: var(--c-primary);
        background: var(--c-primary-tint);
      }

      &.is-disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--c-ring);
        outline-offset: 2px;
      }
    }

    .choice__icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full);
      background: var(--c-surface-2);
      color: var(--c-primary);
    }

    .choice__body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .choice__title {
      font-weight: 600;
    }

    .choice__meta {
      font-size: var(--fs-sm);
    }

    /* Receipt upload */
    .upload {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: 56px;
      margin-top: var(--space-md);
      padding: var(--space-md);
      border: 1px dashed var(--c-border-strong);
      border-radius: var(--radius-md);
      color: var(--c-fg-muted);
      cursor: pointer;
      transition: border-color var(--dur-base) var(--ease-out), color var(--dur-base) var(--ease-out);

      &:hover {
        border-color: var(--c-primary);
        color: var(--c-fg);
      }

      &.is-set {
        border-style: solid;
        border-color: var(--c-primary);
        color: var(--c-fg);
        background: var(--c-primary-tint);
      }

      input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }

      &:has(input:focus-visible) {
        outline: 2px solid var(--c-ring);
        outline-offset: 2px;
      }
    }

    /* Summary */
    .summary__row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-md);
      padding-block: var(--space-xs);
    }

    .summary__row--total {
      margin-top: var(--space-xs);
      padding-top: var(--space-md);
      border-top: 1px solid var(--c-border);
      font-size: var(--fs-h3);
      font-weight: 600;
    }

    .summary button {
      margin-top: var(--space-lg);
    }

    .summary__note {
      margin-top: var(--space-sm);
      text-align: center;
    }
  `,
})
export class NewOrder {
  private readonly catalog = inject(CatalogService);
  private readonly orders = inject(OrdersService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly minCups = MIN_CUPS;
  protected readonly maxCups = MAX_CUPS;
  protected readonly deliveryDateLabel = `Ready ${formatDeliveryDate(tomorrowIso())}`;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly receiptError = signal<string | null>(null);

  protected readonly product = signal<Product | null>(null);
  protected readonly quantity = signal(1);
  protected readonly target = signal<DeliveryTarget>('seat');
  protected readonly notes = signal('');
  protected readonly receipt = signal<File | null>(null);

  protected readonly profileSeat = computed(() => this.auth.profile()?.seats ?? null);
  protected readonly hasFridge = computed(() => !!this.profileSeat()?.refrigerators);

  protected readonly seatSummary = computed(() => {
    const seat = this.profileSeat();
    return seat ? `${seat.code} — ${seat.label}` : 'No seat set';
  });

  protected readonly fridgeSummary = computed(() => {
    const fridge = this.profileSeat()?.refrigerators;
    if (!fridge) return 'No refrigerator mapped to your seat yet';
    return fridge.description ? `${fridge.label} — ${fridge.description}` : fridge.label;
  });

  protected readonly cupsLabel = computed(() => pluralCups(this.quantity()));

  protected readonly money = formatMoney;

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      if (!this.auth.profile()) await this.auth.loadProfile();
      this.product.set(await this.catalog.featuredProduct());
    } catch (err) {
      this.loadError.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected increment(): void {
    this.quantity.update((q) => Math.min(MAX_CUPS, q + 1));
  }

  protected decrement(): void {
    this.quantity.update((q) => Math.max(MIN_CUPS, q - 1));
  }

  protected onQuantityInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const clamped = Number.isFinite(raw)
      ? Math.min(MAX_CUPS, Math.max(MIN_CUPS, Math.trunc(raw)))
      : MIN_CUPS;
    this.quantity.set(clamped);
    (event.target as HTMLInputElement).value = String(clamped);
  }

  protected onNotesInput(event: Event): void {
    this.notes.set((event.target as HTMLTextAreaElement).value);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.receiptError.set(null);

    if (file && file.size > 5 * 1024 * 1024) {
      this.receiptError.set('That file is larger than 5 MB. Choose a smaller one.');
      this.receipt.set(null);
      input.value = '';
      return;
    }

    this.receipt.set(file);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();

    const item = this.product();
    if (!item || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);

    try {
      const order = await this.orders.place({
        productId: item.id,
        quantity: this.quantity(),
        deliveryTarget: this.target(),
        notes: this.notes(),
      });

      // The order exists now; a receipt failure must not lose it.
      const file = this.receipt();
      if (file) {
        const userId = this.auth.session()?.user.id;
        if (userId) {
          try {
            await this.orders.uploadReceipt(userId, order.id, file);
          } catch (uploadErr) {
            this.toasts.error(
              `Order ${order.order_number} was placed, but the receipt did not upload: ${
                (uploadErr as Error).message
              }`,
            );
            await this.router.navigate(['/orders', order.id]);
            return;
          }
        }
      }

      this.toasts.success(`Order ${order.order_number} placed for tomorrow.`);
      await this.router.navigate(['/orders', order.id]);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
