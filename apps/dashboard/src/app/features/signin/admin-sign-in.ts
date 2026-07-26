import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { Icon, Spinner } from '@romano/ui';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Icon, Spinner],
  template: `
    <div class="container container--narrow page">
      <div class="card">
        <span class="mark"><app-icon name="shield" [size]="22" /></span>
        <h1 class="title">ورود مدیر</h1>
        <p class="muted text-sm intro">این بخش فقط برای مدیران رومانو است.</p>

        @if (error(); as message) {
          <div class="alert alert--error" role="alert">
            <app-icon name="alert" [size]="18" />
            <span>{{ message }}</span>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          <div class="field">
            <label class="field__label" for="username">نام کاربری</label>
            <input
              id="username"
              class="field__control"
              dir="ltr"
              formControlName="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              [attr.aria-invalid]="invalid('username') ? 'true' : null"
            />
            @if (invalid('username')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                نام کاربری خود را بنویسید.
              </p>
            }
          </div>

          <div class="field">
            <label class="field__label" for="password">رمز عبور</label>
            <div class="password">
              <input
                id="password"
                class="field__control"
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                autocomplete="current-password"
                [attr.aria-invalid]="invalid('password') ? 'true' : null"
              />
              <button
                type="button"
                class="password__toggle"
                (click)="showPassword.set(!showPassword())"
                [attr.aria-label]="showPassword() ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'"
              >
                <app-icon [name]="showPassword() ? 'eye-off' : 'eye'" [size]="18" />
              </button>
            </div>
            @if (invalid('password')) {
              <p class="field__error" role="alert">
                <app-icon name="alert" [size]="14" />
                رمز عبور خود را بنویسید.
              </p>
            }
          </div>

          <button type="submit" class="btn btn--primary btn--block btn--lg" [disabled]="busy()">
            @if (busy()) {
              <app-spinner [size]="18" label="در حال ورود" />
            } @else {
              ورود
            }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: `
    .page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
    }

    .card {
      width: 100%;
    }

    .mark {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      margin-bottom: var(--space-md);
      border-radius: var(--radius-full);
      background: var(--c-primary);
      color: var(--c-on-primary);
    }

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

    .password {
      position: relative;
    }

    .password__toggle {
      position: absolute;
      inset-inline-end: 4px;
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
  `,
})
export class AdminSignIn {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected async submit(): Promise<void> {
    this.error.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const name = Object.keys(this.form.controls).find((key) => this.form.get(key)?.invalid);
      if (name) document.getElementById(name)?.focus();
      return;
    }

    this.busy.set(true);
    const { username, password } = this.form.getRawValue();

    try {
      await this.auth.signIn(username, password);
      const redirect = this.route.snapshot.queryParamMap.get('redirect');
      await this.router.navigateByUrl(redirect ?? '/');
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
