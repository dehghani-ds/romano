import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../core/catalog.service';
import { SeatOption } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';

/** Local mobile format, e.g. 09121234567. */
const MOBILE_PATTERN = /^09\d{9}$/;
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-sign-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <h1 class="title">Create your account</h1>
        <p class="muted text-sm intro">
          We need your name, a username and where you sit — so we know where the coffee goes.
        </p>

        @if (error(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <fieldset class="group">
            <legend class="eyebrow">Your name</legend>
            <div class="field-grid field-grid--2">
              <div class="field">
                <label class="field__label" for="firstName">
                  First name<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="firstName"
                  class="field__control"
                  formControlName="firstName"
                  autocomplete="given-name"
                  [attr.aria-invalid]="invalid('firstName') ? 'true' : null"
                />
                @if (invalid('firstName')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    Enter your first name.
                  </p>
                }
              </div>

              <div class="field">
                <label class="field__label" for="lastName">
                  Family name<span class="field__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="lastName"
                  class="field__control"
                  formControlName="lastName"
                  autocomplete="family-name"
                  [attr.aria-invalid]="invalid('lastName') ? 'true' : null"
                />
                @if (invalid('lastName')) {
                  <p class="field__error" role="alert">
                    <app-icon name="alert" [size]="14" />
                    Enter your family name.
                  </p>
                }
              </div>
            </div>
          </fieldset>

          <fieldset class="group">
            <legend class="eyebrow">How we reach you</legend>

            <div class="field">
              <label class="field__label" for="mobile">
                Mobile number<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="mobile"
                class="field__control"
                type="tel"
                inputmode="numeric"
                formControlName="mobile"
                autocomplete="tel"
                placeholder="09121234567"
                [attr.aria-invalid]="invalid('mobile') ? 'true' : null"
              />
              <p class="field__hint">We only use this if there is a problem with your order.</p>
              @if (invalid('mobile')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  Mobile number must be 11 digits starting with 09, for example 09121234567.
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="seatId">
                Your seat<span class="field__required" aria-hidden="true">*</span>
              </label>
              <select
                id="seatId"
                class="field__control"
                formControlName="seatId"
                [attr.aria-invalid]="invalid('seatId') ? 'true' : null"
              >
                <option value="">Choose your seat…</option>
                @for (seat of seats(); track seat.id) {
                  <option [value]="seat.id">{{ seat.code }} — {{ seat.label }}</option>
                }
              </select>
              @if (selectedSeat(); as seat) {
                <p class="field__hint">
                  Nearest fridge:
                  {{ seat.refrigerators?.label ?? 'not mapped yet' }}
                  @if (seat.refrigerators?.description; as description) {
                    — {{ description }}
                  }
                </p>
              } @else {
                <p class="field__hint">
                  This decides where your coffee is delivered. You can change it later.
                </p>
              }
              @if (invalid('seatId')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  Choose the seat where you sit.
                </p>
              }
            </div>
          </fieldset>

          <fieldset class="group">
            <legend class="eyebrow">Sign-in details</legend>

            <div class="field">
              <label class="field__label" for="username">
                Username<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="username"
                class="field__control"
                formControlName="username"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                [attr.aria-invalid]="invalid('username') ? 'true' : null"
              />
              <p class="field__hint">
                3–30 characters: lowercase letters, numbers and underscores.
              </p>
              @if (invalid('username')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  Use 3–30 lowercase letters, numbers or underscores — no spaces.
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="password">
                Password<span class="field__required" aria-hidden="true">*</span>
              </label>
              <div class="password">
                <input
                  id="password"
                  class="field__control"
                  [type]="showPassword() ? 'text' : 'password'"
                  formControlName="password"
                  autocomplete="new-password"
                  [attr.aria-invalid]="invalid('password') ? 'true' : null"
                />
                <button
                  type="button"
                  class="password__toggle"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                >
                  <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="18" />
                </button>
              </div>
              <p class="field__hint">At least 8 characters.</p>
              @if (invalid('password')) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  Password must be at least 8 characters.
                </p>
              }
            </div>

            <div class="field">
              <label class="field__label" for="confirmPassword">
                Confirm password<span class="field__required" aria-hidden="true">*</span>
              </label>
              <input
                id="confirmPassword"
                class="field__control"
                type="password"
                formControlName="confirmPassword"
                autocomplete="new-password"
                [attr.aria-invalid]="mismatch() ? 'true' : null"
              />
              @if (mismatch()) {
                <p class="field__error" role="alert">
                  <app-icon name="alert" [size]="14" />
                  The two passwords do not match.
                </p>
              }
            </div>
          </fieldset>

          <button type="submit" class="btn btn--primary btn--block btn--lg" [disabled]="busy()">
            @if (busy()) {
              <app-spinner [size]="18" label="Creating your account" />
            } @else {
              Create account
            }
          </button>
        </form>

        <p class="text-sm muted footer">
          Already registered? <a routerLink="/signin">Sign in</a>
        </p>
      </div>
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

    .alert {
      margin-bottom: var(--space-md);
    }

    .group {
      border: 0;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
    }

    .group + .group {
      margin-top: var(--space-lg);
      padding-top: var(--space-lg);
      border-top: 1px solid var(--c-border);
    }

    legend {
      padding: 0;
      margin-bottom: var(--space-sm);
    }

    .password {
      position: relative;
    }

    .password__toggle {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      background: none;
      border: 0;
      border-radius: var(--radius-md);
      color: var(--c-fg-muted);
      cursor: pointer;

      &:hover {
        color: var(--c-fg);
      }
    }

    .footer {
      margin-top: var(--space-lg);
      text-align: center;
    }
  `,
})
export class SignUp {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly seats = signal<SeatOption[]>([]);

  protected readonly form = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(60)]],
      lastName: ['', [Validators.required, Validators.maxLength(60)]],
      mobile: ['', [Validators.required, Validators.pattern(MOBILE_PATTERN)]],
      seatId: ['', [Validators.required]],
      username: ['', [Validators.required, Validators.pattern(USERNAME_PATTERN)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  private readonly seatId = signal('');

  protected readonly selectedSeat = computed(() =>
    this.seats().find((s) => s.id === this.seatId()),
  );

  constructor() {
    void this.loadSeats();
    this.form.controls.seatId.valueChanges.subscribe((value) => this.seatId.set(value));
  }

  private async loadSeats(): Promise<void> {
    try {
      this.seats.set(await this.catalog.seats());
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected mismatch(): boolean {
    return (
      this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched
    );
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.busy.set(true);
    const value = this.form.getRawValue();

    try {
      await this.auth.signUp({
        username: value.username,
        password: value.password,
        firstName: value.firstName,
        lastName: value.lastName,
        mobile: value.mobile,
        seatId: value.seatId,
      });

      this.toasts.success('Account created. Welcome to Romano.');
      await this.router.navigate(['/order']);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  private focusFirstInvalid(): void {
    const name = Object.keys(this.form.controls).find((key) => this.form.get(key)?.invalid);
    if (name) document.getElementById(name)?.focus();
  }
}
