import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import {
  CardToCardDestination,
  DEFAULT_COMPANY_NAME,
  Product,
  formatDeliveryDate,
  formatMoney,
  formatNumber,
  formatQuantity,
  tomorrowIso,
} from '@romano/domain';
import { Icon, PaymentCard, Spinner, ToastService } from '@romano/ui';

import { AuthService } from '../../core/auth.service';
import { BasketStore, MAX_LINE_QUANTITY } from '../../core/basket.store';
import { CatalogService } from '../../core/catalog.service';
import { OrdersService } from '../../core/orders.service';
import { PaymentsService } from '../../core/payments.service';

const MOBILE_PATTERN = /^09\d{9}$/;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

type FieldName = 'contactName' | 'contactMobile' | 'teamName';

/**
 * The order flow: what is in the basket, who it is for, optionally a receipt.
 *
 * This route is open to everyone. A signed-in customer gets their details
 * filled in from their profile and can still change them — someone ordering for
 * another team should not have to edit their profile to do it. A visitor types
 * the same fields, and gets a token back that keeps the order readable in this
 * browser.
 *
 * The company is the exception: one company orders today, so it is displayed
 * rather than asked. It still travels with the order, so the day a second
 * company appears this becomes a field again and nothing downstream changes.
 *
 * Pricing and the delivery day are decided by the API; the numbers here are for
 * display only.
 */
@Component({
  selector: 'app-new-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, Spinner, PaymentCard],
  template: `
    <div class="container container--narrow page">
      <h1 class="title">سفارش برای فردا</h1>
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
      } @else if (catalog().length === 0) {
        <div class="card">
          <p class="muted">هیچ محصولی برای فروش نیست. کمی بعد دوباره سر بزنید.</p>
        </div>
      } @else {
        <form class="stack" (submit)="submit($event)" novalidate>
          <!-- Catalog ------------------------------------------------------ -->
          <section class="card">
            <h2 class="section-title">چه چیزی می‌خواهید؟</h2>

            <ul class="menu">
              @for (item of catalog(); track item.id) {
                <li class="menu__item" [class.is-picked]="basket.has(item.id)">
                  <span class="menu__mark"><app-icon name="coffee" [size]="22" /></span>

                  <div class="menu__body">
                    <h3 class="menu__name">{{ item.name }}</h3>
                    @if (item.description) {
                      <p class="muted text-sm">{{ item.description }}</p>
                    }
                    <p class="menu__price numeric">
                      {{ money(item.price, item.currency) }} برای هر {{ item.unit }}
                    </p>
                  </div>

                  @if (basket.has(item.id)) {
                    <div class="stepper">
                      <button
                        type="button"
                        class="stepper__btn"
                        (click)="stepDown(item)"
                        [attr.aria-label]="'یک ' + item.unit + ' کمتر از ' + item.name"
                      >
                        <app-icon name="minus" [size]="20" />
                      </button>

                      <label class="visually-hidden" [attr.for]="'qty-' + item.id">
                        تعداد {{ item.name }}
                      </label>
                      <input
                        [id]="'qty-' + item.id"
                        class="stepper__value numeric"
                        type="number"
                        dir="ltr"
                        inputmode="numeric"
                        [min]="0"
                        [max]="maxPerLine"
                        [value]="basket.quantityOf(item.id)"
                        (input)="onQuantityInput(item, $event)"
                      />

                      <button
                        type="button"
                        class="stepper__btn"
                        (click)="stepUp(item)"
                        [disabled]="basket.quantityOf(item.id) >= maxPerLine"
                        [attr.aria-label]="'یک ' + item.unit + ' بیشتر از ' + item.name"
                      >
                        <app-icon name="plus" [size]="20" />
                      </button>
                    </div>
                  } @else {
                    <button
                      type="button"
                      class="btn btn--secondary btn--sm menu__add"
                      (click)="add(item)"
                    >
                      <app-icon name="plus" [size]="16" />
                      افزودن
                    </button>
                  }
                </li>
              }
            </ul>

            <p class="field__hint">از هر محصول حداکثر بیست تا در یک سفارش.</p>
          </section>

          <!-- Basket ------------------------------------------------------- -->
          @if (!basket.isEmpty()) {
            <section class="card">
              <h2 class="section-title">سبد شما</h2>
              <ul class="basket">
                @for (entry of basket.entries(); track entry.productId) {
                  <li class="basket__line">
                    <span class="basket__name">{{ entry.product.name }}</span>
                    <span class="muted text-sm">
                      {{ quantityLabel(entry.quantity, entry.product.unit) }}
                    </span>
                    <span class="basket__total numeric">
                      {{ money(entry.lineTotal, entry.product.currency) }}
                    </span>
                    <button
                      type="button"
                      class="basket__remove"
                      (click)="remove(entry.productId)"
                      [attr.aria-label]="'برداشتن ' + entry.product.name + ' از سبد'"
                    >
                      <app-icon name="x" [size]="16" />
                    </button>
                  </li>
                }
              </ul>
            </section>
          }

          <!-- Who and where ------------------------------------------------ -->
          <section class="card">
            <h2 class="section-title">سفارش را به چه کسی برسانیم؟</h2>

            @if (!auth.isSignedIn()) {
              <p class="muted text-sm signed-out-note">
                برای سفارش دادن لازم نیست حساب بسازید. اگر
                <a routerLink="/signup">ثبت‌نام کنید</a>، سفارش‌هایتان همیشه یک‌جا می‌ماند.
              </p>
            }

            <div class="field-grid field-grid--2">
              <div class="field">
                <label class="field__label" for="contactName">
                  نام و نام خانوادگی<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="contactName"
                  class="field__control"
                  autocomplete="name"
                  [value]="contactName()"
                  (input)="set('contactName', $event)"
                  (blur)="touch('contactName')"
                  [attr.aria-invalid]="invalid('contactName') ? 'true' : null"
                />
                @if (invalid('contactName')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نام خود را بنویسید.
                  </p>
                }
              </div>

              <div class="field">
                <label class="field__label" for="contactMobile">
                  شمارهٔ موبایل<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="contactMobile"
                  class="field__control"
                  type="tel"
                  dir="ltr"
                  inputmode="numeric"
                  autocomplete="tel"
                  placeholder="09121234567"
                  [value]="contactMobile()"
                  (input)="set('contactMobile', $event)"
                  (blur)="touch('contactMobile')"
                  [attr.aria-invalid]="invalid('contactMobile') ? 'true' : null"
                />
                <p class="field__hint">با همین شماره می‌توانید سفارش را پیگیری کنید.</p>
                @if (invalid('contactMobile')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    شمارهٔ موبایل باید ۱۱ رقم باشد و با ۰۹ شروع شود، مثلاً ۰۹۱۲۱۲۳۴۵۶۷.
                  </p>
                }
              </div>
            </div>

            <div class="field-grid field-grid--2">
              <!-- Fixed for now: one company orders today, so this is shown
                   rather than asked. It still travels with the order. -->
              <div class="field">
                <span class="field__label">نام شرکت</span>
                <p class="field__static">
                  <app-icon name="building" [size]="16" />
                  <span>{{ companyName() }}</span>
                </p>
                <p class="field__hint">فعلاً سفارش‌ها فقط برای همین شرکت ثبت می‌شود.</p>
              </div>

              <div class="field">
                <label class="field__label" for="teamName">
                  نام تیم<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="teamName"
                  class="field__control"
                  [value]="teamName()"
                  (input)="set('teamName', $event)"
                  (blur)="touch('teamName')"
                  [attr.aria-invalid]="invalid('teamName') ? 'true' : null"
                />
                <p class="field__hint">قهوه سر همین تیم تحویل داده می‌شود.</p>
                @if (invalid('teamName')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    نام تیم را بنویسید.
                  </p>
                }
              </div>
            </div>

            <p class="destination">
              <app-icon name="users" [size]="16" />
              <span>تحویل به {{ destinationSummary() }}</span>
            </p>
          </section>

          <!-- Note --------------------------------------------------------- -->
          <section class="card">
            <div class="field">
              <label class="field__label" for="notes">یادداشت برای باریستا (اختیاری)</label>
              <textarea
                id="notes"
                class="field__control"
                maxlength="500"
                [value]="notes()"
                (input)="onNotesInput($event)"
                placeholder="نکته‌ای هست که باید بدانیم؟"
              ></textarea>
              <p class="field__hint numeric">{{ notesCount() }}</p>
            </div>
          </section>

          <!-- Receipt ------------------------------------------------------ -->
          <section class="card">
            <h2 class="section-title">رسید پرداخت</h2>
            <p class="muted text-sm">
              فعلاً اختیاری است. مدیر پیش از شروع سفارش آن را بررسی می‌کند — بعداً هم می‌توانید از
              صفحهٔ سفارش اضافه‌اش کنید.
            </p>

            @if (cardToCard(); as card) {
              <app-payment-card [holder]="card.holder" [number]="card.number" />
            }

            <label class="upload" [class.is-set]="receipt() !== null">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                (change)="onFileSelected($event)"
              />
              <app-icon name="upload" [size]="20" />
              <span>{{ receipt()?.name ?? 'تصویر یا PDF رسید را انتخاب کنید' }}</span>
            </label>
            @if (receiptError(); as message) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                {{ message }}
              </p>
            } @else {
              <p class="field__hint">JPEG، PNG، WebP، HEIC یا PDF — حداکثر ۵ مگابایت.</p>
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
            @for (entry of basket.entries(); track entry.productId) {
              <div class="summary__row">
                <span class="muted">
                  {{ entry.product.name }} ·
                  {{ quantityLabel(entry.quantity, entry.product.unit) }}
                </span>
                <span class="numeric">
                  {{ money(entry.lineTotal, entry.product.currency) }}
                </span>
              </div>
            }
            <div class="summary__row summary__row--total">
              <span>مجموع</span>
              <span class="numeric">{{ money(basket.total(), basket.currency()) }}</span>
            </div>

            <button
              type="submit"
              class="btn btn--accent btn--block btn--lg"
              [disabled]="busy() || basket.isEmpty()"
            >
              @if (busy()) {
                <app-spinner [size]="18" label="در حال ثبت سفارش" />
              } @else {
                ثبت سفارش
              }
            </button>

            @if (basket.isEmpty()) {
              <p class="text-sm muted summary__note">
                برای ثبت سفارش دست‌کم یک محصول به سبد اضافه کنید.
              </p>
            }
            <p class="text-sm muted summary__note">
              سفارش شما تا تأیید مدیر <strong>در انتظار</strong> می‌ماند.
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

    .signed-out-note {
      margin-top: calc(var(--space-md) * -1 + var(--space-xs));
      margin-bottom: var(--space-md);
    }

    /* Catalog */
    .menu {
      list-style: none;
      margin: 0 0 var(--space-md);
      padding: 0;
      display: grid;
      gap: var(--space-sm);
    }

    .menu__item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-md);
      padding: var(--space-md);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-lg);
      transition: border-color var(--dur-base) var(--ease-out);
    }

    /* Being in the basket is never colour alone — the row also swaps its
       افزودن button for a stepper showing the count. */
    .menu__item.is-picked {
      border-color: var(--c-primary);
      background: var(--c-primary-tint);
    }

    .menu__mark {
      display: grid;
      place-items: center;
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: var(--radius-lg);
      background: var(--c-primary);
      color: var(--c-on-primary);
    }

    .menu__body {
      flex: 1;
      min-width: 0;
    }

    .menu__name {
      font-family: var(--font-display);
      font-size: var(--fs-h3);
      margin-bottom: var(--space-xs);
    }

    .menu__price {
      margin-top: var(--space-sm);
      font-weight: 600;
      color: var(--c-primary);
    }

    .menu__add {
      flex: none;
      align-self: center;
    }

    /* Basket */
    .basket {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-sm);
    }

    .basket__line {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .basket__name {
      font-weight: 500;
    }

    .basket__total {
      margin-inline-start: auto;
    }

    .basket__remove {
      display: grid;
      place-items: center;
      flex: none;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: var(--radius-md);
      background: none;
      color: var(--c-fg-muted);
      cursor: pointer;
      transition: color var(--dur-base) var(--ease-out);

      &:hover {
        color: var(--c-danger);
      }
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

    /* A field that is shown, not asked — same box as .field__control so the
       pair still reads as one row, minus the affordances of an input. */
    .field__static {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      min-height: 48px;
      padding-inline: var(--space-md);
      border: 1px solid var(--c-border);
      border-radius: var(--radius-md);
      background: var(--c-surface-2);
      color: var(--c-fg);
      font-weight: 500;
    }

    /* Where it goes */
    .destination {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-top: var(--space-md);
      padding: var(--space-sm) var(--space-md);
      border-radius: var(--radius-md);
      background: var(--c-primary-tint);
      color: var(--c-primary);
      font-size: var(--fs-sm);
      font-weight: 500;
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
  private readonly menu = inject(CatalogService);
  private readonly orders = inject(OrdersService);
  private readonly payments = inject(PaymentsService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly basket = inject(BasketStore);
  protected readonly maxPerLine = MAX_LINE_QUANTITY;
  protected readonly deliveryDateLabel = `آمادهٔ ${formatDeliveryDate(tomorrowIso())}`;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly receiptError = signal<string | null>(null);

  protected readonly catalog = signal<Product[]>([]);
  protected readonly notes = signal('');
  protected readonly receipt = signal<File | null>(null);

  /**
   * The card to transfer to, from the API rather than a constant. Null while it
   * is still being fetched and when an admin has switched card-to-card off —
   * either way the panel is simply not drawn, rather than drawn empty.
   */
  protected readonly cardToCard = signal<CardToCardDestination | null>(null);

  protected readonly contactName = signal('');
  protected readonly contactMobile = signal('');
  protected readonly companyName = signal(DEFAULT_COMPANY_NAME);
  protected readonly teamName = signal('');

  /** Errors appear on blur, not on every keystroke. */
  private readonly touched = signal<Record<FieldName, boolean>>({
    contactName: false,
    contactMobile: false,
    teamName: false,
  });

  /** True once the person has typed here, so profile data stops overwriting it. */
  private readonly edited = signal(false);

  protected readonly destinationSummary = computed(() => {
    const company = this.companyName().trim() || DEFAULT_COMPANY_NAME;
    const team = this.teamName().trim();
    return team ? `${company} — ${team}` : company;
  });

  /** `۲ فنجان`, `۳ عدد` — whatever the product counts itself in. */
  protected quantityLabel(quantity: number, unit: string): string {
    return formatQuantity(quantity, unit);
  }

  /** `۴۸ / ۵۰۰` — both numbers in Persian digits. */
  protected readonly notesCount = computed(
    () => `${formatNumber(this.notes().length)} / ${formatNumber(500)}`,
  );

  protected readonly money = formatMoney;

  constructor() {
    void this.load();
    void this.payments.options().then((options) => this.cardToCard.set(options.cardToCard));

    // Prefill from the profile once it arrives, but never clobber typing.
    effect(() => {
      const profile = this.auth.profile();
      if (!profile || this.edited()) return;

      this.contactName.set(`${profile.firstName} ${profile.lastName}`.trim());
      this.contactMobile.set(profile.mobile);
      this.companyName.set(profile.companyName || DEFAULT_COMPANY_NAME);
      this.teamName.set(profile.teamName);
    });
  }

  private async load(): Promise<void> {
    try {
      const products = await this.menu.products();
      this.catalog.set(products);
      // The basket holds ids; it needs the catalog to price and name them.
      this.basket.setCatalog(products);
    } catch (err) {
      this.loadError.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected add(product: Product): void {
    this.basket.add(product.id);
  }

  protected remove(productId: string): void {
    this.basket.remove(productId);
  }

  protected stepUp(product: Product): void {
    this.basket.setQuantity(product.id, this.basket.quantityOf(product.id) + 1);
  }

  /** Stepping below one takes the line out of the basket entirely. */
  protected stepDown(product: Product): void {
    this.basket.setQuantity(product.id, this.basket.quantityOf(product.id) - 1);
  }

  protected onQuantityInput(product: Product, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = Number(input.value);
    this.basket.setQuantity(product.id, Number.isFinite(raw) ? Math.trunc(raw) : 0);
    // Echo back what the store settled on, so a clamped value is visible.
    input.value = String(this.basket.quantityOf(product.id));
  }

  protected onNotesInput(event: Event): void {
    this.notes.set((event.target as HTMLTextAreaElement).value);
  }

  protected set(field: FieldName, event: Event): void {
    this.edited.set(true);
    this[field].set((event.target as HTMLInputElement).value);
  }

  protected touch(field: FieldName): void {
    this.touched.update((state) => ({ ...state, [field]: true }));
  }

  protected invalid(field: FieldName): boolean {
    return this.touched()[field] && this.fieldError(field);
  }

  private fieldError(field: FieldName): boolean {
    const value = this[field]().trim();
    if (field === 'contactMobile') return !MOBILE_PATTERN.test(value);
    return value.length === 0;
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.receiptError.set(null);

    if (file && file.size > MAX_RECEIPT_BYTES) {
      this.receiptError.set('حجم این فایل بیشتر از ۵ مگابایت است. فایل کوچک‌تری انتخاب کنید.');
      this.receipt.set(null);
      input.value = '';
      return;
    }

    this.receipt.set(file);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.busy() || this.basket.isEmpty()) return;

    const fields: FieldName[] = ['contactName', 'contactMobile', 'teamName'];
    const firstInvalid = fields.find((field) => this.fieldError(field));

    if (firstInvalid) {
      this.touched.set({
        contactName: true,
        contactMobile: true,
        teamName: true,
      });
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    try {
      const { order } = await this.orders.place({
        items: this.basket.toOrderLines(),
        notes: this.notes().trim() || null,
        contactName: this.contactName().trim(),
        contactMobile: this.contactMobile().trim(),
        companyName: this.companyName().trim(),
        teamName: this.teamName().trim(),
      });

      // The order exists now, so the basket has been spent — empty it before
      // anything below can fail, or a retried receipt upload would leave the
      // customer looking at a basket they have already ordered.
      this.basket.clear();

      // The order exists now; a failed receipt must not lose it.
      const file = this.receipt();
      if (file) {
        try {
          await this.orders.uploadReceipt(order.id, file);
        } catch (uploadErr) {
          this.toasts.error(
            `سفارش ${order.orderNumber} ثبت شد، اما رسید بارگذاری نشد: ${
              (uploadErr as Error).message
            }`,
          );
          await this.router.navigate(['/orders', order.id]);
          return;
        }
      }

      this.toasts.success(`سفارش ${order.orderNumber} برای فردا ثبت شد.`);
      await this.router.navigate(['/orders', order.id]);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
