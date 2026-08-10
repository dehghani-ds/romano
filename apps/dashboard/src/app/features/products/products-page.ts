import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { CreateProductRequest, Product, formatMoney, formatNumber } from '@romano/domain';
import { EmptyState, Icon, Spinner, ToastService } from '@romano/ui';

import { AdminProductsService } from '../../core/admin-products.service';

/** Mirrors PRODUCT_SLUG_PATTERN in the API, the same way the web forms do. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PRICE = 100_000_000;

/**
 * Products: what is on sale, and the form that adds to it.
 *
 * The schema has been multi-product from the start — Romano was simply the only
 * row. Adding the second one is this form, not a migration.
 *
 * Listed twice like the order queue: a table from 768px up, cards below it.
 */
@Component({
  selector: 'app-products-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Spinner, EmptyState],
  template: `
    <div class="container page">
      <div class="head">
        <div>
          <h1 class="title">محصول‌ها</h1>
          <p class="muted text-sm">{{ countLabel() }}</p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="reload()">
          <app-icon name="refresh" [size]="16" />
          تازه‌سازی
        </button>
      </div>

      <!-- Add ----------------------------------------------------------- -->
      <section class="card form-card">
        <h2 class="section-title">
          <app-icon name="plus" [size]="18" />
          افزودن محصول
        </h2>

        @if (formError(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field-grid field-grid--2">
            <div class="field">
              <label class="field__label" for="name">
                نام محصول<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="name"
                class="field__control"
                formControlName="name"
                placeholder="مثلاً لاته"
                [attr.aria-invalid]="invalid('name') ? 'true' : null"
              />
              @if (invalid('name')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  نام محصول را بنویسید (۱ تا ۸۰ نویسه).
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="slug">
                شناسه<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="slug"
                class="field__control code"
                dir="ltr"
                formControlName="slug"
                autocapitalize="none"
                spellcheck="false"
                placeholder="cafe-latte"
                [attr.aria-invalid]="invalid('slug') ? 'true' : null"
              />
              @if (invalid('slug')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  فقط حروف کوچک انگلیسی، عدد و خط تیره — مثل cafe-latte.
                </p>
              } @else {
                <p class="field__hint">در نشانی‌ها به کار می‌رود و بعداً عوض نمی‌شود.</p>
              }
            </div>
          </div>

          <div class="field-grid field-grid--2">
            <div class="field">
              <label class="field__label" for="price">
                قیمت هر فنجان<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="price"
                class="field__control"
                type="number"
                dir="ltr"
                inputmode="numeric"
                min="1"
                [max]="maxPrice"
                step="1"
                formControlName="price"
                [attr.aria-invalid]="invalid('price') ? 'true' : null"
              />
              @if (invalid('price')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  قیمت را به ریال بنویسید — بیشتر از صفر.
                </p>
              } @else {
                <p class="field__hint">{{ pricePreview() }}</p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="sortOrder">ترتیب نمایش</label>
              <input
                id="sortOrder"
                class="field__control"
                type="number"
                dir="ltr"
                inputmode="numeric"
                min="0"
                max="999"
                step="1"
                formControlName="sortOrder"
                [attr.aria-invalid]="invalid('sortOrder') ? 'true' : null"
              />
              @if (invalid('sortOrder')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  عددی بین ۰ تا ۹۹۹ بنویسید.
                </p>
              } @else {
                <p class="field__hint">کوچک‌تر، بالاتر در فهرست.</p>
              }
            </div>
          </div>

          <div class="field">
            <label class="field__label" for="description">توضیح</label>
            <textarea
              id="description"
              class="field__control"
              rows="3"
              formControlName="description"
              placeholder="یک جمله دربارهٔ این قهوه — همان چیزی که مشتری هنگام سفارش می‌خواند."
              [attr.aria-invalid]="invalid('description') ? 'true' : null"
            ></textarea>
            @if (invalid('description')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                توضیح نباید بیشتر از ۵۰۰ نویسه باشد.
              </p>
            }
          </div>

          <div class="field">
            <label class="field__label" for="imageUrl">نشانی تصویر</label>
            <input
              id="imageUrl"
              class="field__control"
              type="url"
              dir="ltr"
              formControlName="imageUrl"
              placeholder="https://…"
              [attr.aria-invalid]="invalid('imageUrl') ? 'true' : null"
            />
            @if (invalid('imageUrl')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                نشانی باید کامل باشد و با http یا https شروع شود.
              </p>
            }
          </div>

          <label class="check">
            <input type="checkbox" formControlName="isActive" />
            <span>
              همین حالا در دسترس مشتری باشد
              <span class="muted text-sm block">
                اگر خاموش باشد، محصول ساخته می‌شود ولی در سایت دیده نمی‌شود.
              </span>
            </span>
          </label>

          <div class="form-actions">
            <button type="submit" class="btn btn--primary btn--lg" [disabled]="saving()">
              @if (saving()) {
                <app-spinner [size]="18" label="در حال ثبت" />
              } @else {
                افزودن محصول
              }
            </button>
            <button
              type="button"
              class="btn btn--ghost"
              (click)="resetForm()"
              [disabled]="saving()"
            >
              پاک کردن فرم
            </button>
          </div>
        </form>
      </section>

      <!-- Existing ------------------------------------------------------ -->
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
      } @else if (products().length === 0) {
        <div class="card">
          <app-empty-state
            icon="inbox"
            title="هنوز محصولی ثبت نشده"
            message="اولین محصول را با فرم بالا اضافه کنید."
          />
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">نام</th>
                <th scope="col">شناسه</th>
                <th scope="col">قیمت</th>
                <th scope="col">ترتیب</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              @for (product of products(); track product.id) {
                <tr>
                  <td>{{ product.name }}</td>
                  <td><span class="code muted">{{ product.slug }}</span></td>
                  <td class="numeric">{{ money(product) }}</td>
                  <td class="numeric">{{ number(product.sortOrder) }}</td>
                  <td>
                    <span class="avail" [class.avail--off]="!product.isActive">
                      <app-icon [name]="product.isActive ? 'check-circle' : 'x-circle'" [size]="16" />
                      {{ product.isActive ? 'در دسترس' : 'غیرفعال' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <ul class="cards">
          @for (product of products(); track product.id) {
            <li class="card product-card">
              <div class="product-card__top">
                <span class="product-card__name">{{ product.name }}</span>
                <span class="avail" [class.avail--off]="!product.isActive">
                  <app-icon [name]="product.isActive ? 'check-circle' : 'x-circle'" [size]="16" />
                  {{ product.isActive ? 'در دسترس' : 'غیرفعال' }}
                </span>
              </div>
              <dl class="product-card__rows">
                <div>
                  <dt class="muted">شناسه</dt>
                  <dd class="code">{{ product.slug }}</dd>
                </div>
                <div>
                  <dt class="muted">قیمت</dt>
                  <dd class="numeric">{{ money(product) }}</dd>
                </div>
                <div>
                  <dt class="muted">ترتیب</dt>
                  <dd class="numeric">{{ number(product.sortOrder) }}</dd>
                </div>
              </dl>
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

    .check {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      cursor: pointer;
      font-size: var(--fs-sm);

      input {
        width: 20px;
        height: 20px;
        margin-block-start: 2px;
        accent-color: var(--c-primary);
        cursor: pointer;
      }
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

    .avail {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      font-size: var(--fs-sm);
      font-weight: 500;
      color: var(--c-success);
    }

    /* Availability is never colour alone — the icon and the word carry it too. */
    .avail--off {
      color: var(--c-fg-muted);
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

    .product-card__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-md);
      margin-bottom: var(--space-md);
    }

    .product-card__name {
      font-weight: 600;
    }

    .product-card__rows {
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
      }
    }
  `,
})
export class ProductsPage {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AdminProductsService);
  private readonly toast = inject(ToastService);

  protected readonly maxPrice = MAX_PRICE;

  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly listError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    slug: ['', [Validators.required, Validators.pattern(SLUG_PATTERN), Validators.maxLength(60)]],
    price: [0, [Validators.required, Validators.min(1), Validators.max(MAX_PRICE)]],
    sortOrder: [0, [Validators.min(0), Validators.max(999)]],
    description: ['', [Validators.maxLength(500)]],
    imageUrl: [''],
    isActive: [true],
  });

  constructor() {
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.listError.set(null);
    try {
      this.products.set(await this.api.list());
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

  protected countLabel(): string {
    const all = this.products();
    if (all.length === 0) return 'هنوز محصولی ثبت نشده است.';
    const active = all.filter((product) => product.isActive).length;
    return `${formatNumber(all.length)} محصول · ${formatNumber(active)} در دسترس`;
  }

  /** Echoes the typed price back formatted, so a stray zero is visible. */
  protected pricePreview(): string {
    const price = Number(this.form.controls.price.value);
    if (!Number.isFinite(price) || price <= 0) return 'به ریال بنویسید.';
    return formatMoney(price);
  }

  protected money(product: Product): string {
    return formatMoney(product.price, product.currency);
  }

  protected number(value: number): string {
    return formatNumber(value);
  }

  protected resetForm(): void {
    this.form.reset({
      name: '',
      slug: '',
      price: 0,
      sortOrder: 0,
      description: '',
      imageUrl: '',
      isActive: true,
    });
    this.formError.set(null);
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
    // The API rejects unknown keys and empty strings alike — send only what was
    // filled in, and let the column defaults cover the rest.
    const payload: CreateProductRequest = {
      slug: raw.slug.trim(),
      name: raw.name.trim(),
      price: Number(raw.price),
      isActive: raw.isActive,
      sortOrder: Number(raw.sortOrder) || 0,
    };
    if (raw.description.trim()) payload.description = raw.description.trim();
    if (raw.imageUrl.trim()) payload.imageUrl = raw.imageUrl.trim();

    this.saving.set(true);
    try {
      const product = await this.api.create(payload);
      this.toast.success(`«${product.name}» اضافه شد.`);
      this.resetForm();
      await this.reload();
    } catch (error) {
      this.formError.set((error as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
