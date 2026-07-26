import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AuthSession, ProfilePatch, SignUpDetails, UserProfile } from '@romano/domain';

import { apiUrl, toUserMessage } from './api';
import { TokenStore } from './token.store';

/**
 * Authentication and the signed-in user's profile.
 *
 * Sign-in is by username against our own API. There is no email anywhere: the
 * old synthetic-address mapping existed only to satisfy Supabase Auth, and it
 * left behind a password reset that nobody could use. An admin resets a
 * password directly; adding a real, optional email column is the upgrade path.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);

  private readonly _profile = signal<UserProfile | null>(null);
  private readonly _ready = signal(false);
  private readonly restored: Promise<void>;

  readonly profile = this._profile.asReadonly();

  /** False until any stored session has been checked — guards await `whenReady()`. */
  readonly ready = this._ready.asReadonly();

  readonly isSignedIn = computed(() => this._profile() !== null);
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  readonly displayName = computed(() => {
    const profile = this._profile();
    return profile ? `${profile.firstName} ${profile.lastName}`.trim() : '';
  });

  constructor() {
    this.restored = this.restore();
  }

  /** Resolves once the stored session has been restored (or found invalid). */
  whenReady(): Promise<void> {
    return this.restored;
  }

  private async restore(): Promise<void> {
    if (this.tokens.hasSession()) {
      try {
        await this.loadProfile();
      } catch {
        // An expired or revoked session is not an error worth showing anyone.
        this.tokens.clear();
        this._profile.set(null);
      }
    }
    this._ready.set(true);
  }

  async loadProfile(): Promise<UserProfile | null> {
    if (!this.tokens.hasSession()) {
      this._profile.set(null);
      return null;
    }

    const profile = await firstValueFrom(this.http.get<UserProfile>(apiUrl('/auth/me')));
    this._profile.set(profile);
    return profile;
  }

  async signUp(details: SignUpDetails): Promise<void> {
    await this.authenticate('/auth/register', {
      username: details.username.trim().toLowerCase(),
      password: details.password,
      firstName: details.firstName.trim(),
      lastName: details.lastName.trim(),
      mobile: details.mobile.trim(),
      companyName: details.companyName?.trim() || undefined,
      teamName: details.teamName.trim(),
    });
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.authenticate('/auth/login', {
      username: username.trim().toLowerCase(),
      password,
    });
  }

  async signOut(): Promise<void> {
    this.tokens.clear();
    this._profile.set(null);
  }

  async updateProfile(patch: ProfilePatch): Promise<void> {
    try {
      const profile = await firstValueFrom(
        this.http.patch<UserProfile>(apiUrl('/me'), patch),
      );
      this._profile.set(profile);
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<void>(apiUrl('/me/password'), { currentPassword, newPassword }),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** Moves an order placed as a guest onto this account. */
  async claimOrder(orderNumber: string, mobile: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(apiUrl('/me/claim-order'), { orderNumber, mobile }),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  private async authenticate(path: string, body: unknown): Promise<void> {
    try {
      const session = await firstValueFrom(this.http.post<AuthSession>(apiUrl(path), body));
      this.tokens.set({ accessToken: session.accessToken, refreshToken: session.refreshToken });
      this._profile.set(session.user);
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }
}
