import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { ProfileWithSeat, SignUpDetails } from './models';
import { SUPABASE, toUserMessage } from './supabase.client';

const PROFILE_SELECT = `
  *,
  seats (
    *,
    zones ( id, code, name, floor ),
    refrigerators!seats_nearest_refrigerator_id_fkey ( id, code, label, description )
  )
`;

/**
 * Authentication and the signed-in user's profile.
 *
 * Users sign in with a username. Supabase Auth is email-based, so a username is
 * mapped onto a synthetic address (`<username>@<usernameEmailDomain>`) that is
 * never displayed and never receives mail. Everything the user sees — sign-up,
 * sign-in, their profile — is the username.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);

  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<ProfileWithSeat | null>(null);
  private readonly _ready = signal(false);

  readonly session = this._session.asReadonly();
  readonly profile = this._profile.asReadonly();

  /** False until the stored session has been restored — guards wait on this. */
  readonly ready = this._ready.asReadonly();

  readonly isSignedIn = computed(() => this._session() !== null);
  readonly isAdmin = computed(() => this._profile()?.role === 'admin');
  readonly displayName = computed(() => {
    const p = this._profile();
    return p ? `${p.first_name} ${p.last_name}`.trim() : '';
  });

  constructor() {
    void this.restore();

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
      if (session) {
        void this.loadProfile();
      } else {
        this._profile.set(null);
      }
    });
  }

  private async restore(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this._session.set(data.session);
    if (data.session) {
      await this.loadProfile();
    }
    this._ready.set(true);
  }

  /** Reload the profile of the currently signed-in user. */
  async loadProfile(): Promise<ProfileWithSeat | null> {
    const userId = this._session()?.user.id ?? (await this.supabase.auth.getUser()).data.user?.id;
    if (!userId) {
      this._profile.set(null);
      return null;
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load profile', error);
      return null;
    }

    const profile = (data as ProfileWithSeat | null) ?? null;
    this._profile.set(profile);
    return profile;
  }

  private emailFor(username: string): string {
    return `${username.trim().toLowerCase()}@${environment.usernameEmailDomain}`;
  }

  async signUp(details: SignUpDetails): Promise<void> {
    const username = details.username.trim().toLowerCase();

    const { data, error } = await this.supabase.auth.signUp({
      email: this.emailFor(username),
      password: details.password,
      options: {
        // handle_new_user() reads these to build the profile row.
        data: {
          username,
          first_name: details.firstName.trim(),
          last_name: details.lastName.trim(),
          mobile: details.mobile.trim(),
          seat_id: details.seatId,
        },
      },
    });

    if (error) throw new Error(toUserMessage(error));

    // Usernames map to a synthetic domain that receives no mail, so a
    // confirmation link would never arrive. If Supabase withheld the session,
    // "Confirm email" is still switched on for the project.
    if (!data.session) {
      throw new Error(
        'حساب شما ساخته شد اما ورود خودکار انجام نشد. مدیر باید گزینهٔ ' +
          '«Confirm email» را در پروژهٔ Supabase خاموش کند ' +
          '(Authentication → Sign In / Providers → Email).',
      );
    }

    await this.loadProfile();
  }

  async signIn(username: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email: this.emailFor(username),
      password,
    });

    if (error) throw new Error(toUserMessage(error));
    await this.loadProfile();
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this._profile.set(null);
    this._session.set(null);
  }

  /** Update the fields a user is allowed to change about themselves. */
  async updateProfile(patch: {
    first_name: string;
    last_name: string;
    mobile: string;
    seat_id: string;
  }): Promise<void> {
    const userId = this._session()?.user.id;
    if (!userId) throw new Error('شما وارد حساب نشده‌اید.');

    const { error } = await this.supabase.from('profiles').update(patch).eq('id', userId);
    if (error) throw new Error(toUserMessage(error));

    await this.loadProfile();
  }

  async changePassword(newPassword: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(toUserMessage(error));
  }
}
