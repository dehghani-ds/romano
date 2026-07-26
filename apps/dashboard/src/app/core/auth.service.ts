import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AuthSession, UserProfile } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';
import { TokenStore } from './token.store';

/**
 * Admin authentication.
 *
 * Deliberately narrower than the customer app's version: there is no sign-up,
 * no profile editing and no guest anything. Signing in as a customer is
 * rejected here rather than showing an empty console — the API would refuse
 * every request anyway, and a clear message beats a wall of 403s.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);

  private readonly _admin = signal<UserProfile | null>(null);
  private readonly _ready = signal(false);
  private readonly restored: Promise<void>;

  readonly admin = this._admin.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isSignedIn = computed(() => this._admin() !== null);
  readonly displayName = computed(() => {
    const admin = this._admin();
    return admin ? `${admin.firstName} ${admin.lastName}`.trim() : '';
  });

  constructor() {
    this.restored = this.restore();
  }

  whenReady(): Promise<void> {
    return this.restored;
  }

  private async restore(): Promise<void> {
    if (this.tokens.hasSession()) {
      try {
        const profile = await firstValueFrom(this.http.get<UserProfile>(apiUrl('/auth/me')));
        if (profile.role === 'admin') {
          this._admin.set(profile);
        } else {
          this.tokens.clear();
        }
      } catch {
        this.tokens.clear();
      }
    }
    this._ready.set(true);
  }

  async signIn(username: string, password: string): Promise<void> {
    let session: AuthSession;

    try {
      session = await firstValueFrom(
        this.http.post<AuthSession>(apiUrl('/auth/login'), {
          username: username.trim().toLowerCase(),
          password,
        }),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }

    if (session.user.role !== 'admin') {
      throw new Error('این حساب دسترسی مدیریت ندارد.');
    }

    this.tokens.set({ accessToken: session.accessToken, refreshToken: session.refreshToken });
    this._admin.set(session.user);
  }

  signOut(): void {
    this.tokens.clear();
    this._admin.set(null);
  }
}
