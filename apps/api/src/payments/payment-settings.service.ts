import { BadRequestException, Injectable } from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdatePaymentSettingsDto } from './dto';

/** The row as the rest of the server needs it — merchant included. */
export interface PaymentSettings {
  cardToCardEnabled: boolean;
  cardHolder: string;
  cardNumber: string;
  onlineEnabled: boolean;
  zibalMerchant: string | null;
  zibalBaseUrl: string;
  zibalCallbackUrl: string | null;
  webBaseUrl: string | null;
}

/**
 * The row as an admin sees it. Note what is missing.
 *
 * There is no `zibalMerchant` here and there is no endpoint that will produce
 * one. The dashboard is told whether a key is set and shown four characters of
 * it, which is enough to answer "is this the key I think it is?" and not enough
 * to be one.
 */
export interface AdminPaymentSettings {
  cardToCardEnabled: boolean;
  cardHolder: string;
  cardNumber: string;
  onlineEnabled: boolean;
  zibalMerchantSet: boolean;
  zibalMerchantHint: string | null;
  zibalBaseUrl: string;
  zibalCallbackUrl: string | null;
  webBaseUrl: string | null;
  /** True when online payment would actually work if switched on. */
  onlineReady: boolean;
  updatedAt: string;
  updatedByUsername: string | null;
}

/** What the customer site is allowed to know. */
export interface PublicPaymentOptions {
  onlineEnabled: boolean;
  cardToCard: { holder: string; number: string } | null;
  minAmount: number;
  currency: string;
}

const SETTINGS_ID = 1;

/**
 * Payment settings: the card money is transferred to, and the gateway.
 *
 * Two rules hold everywhere in this class, and they exist because this row
 * contains the only credential in the database:
 *
 *  1. **`zibalMerchant` leaves the server in exactly one direction** — outbound,
 *     to Zibal, from `ZibalClient`. `forAdmin()` returns a hint, never the value,
 *     and there is no other read path.
 *  2. **It is never written to a log**, including when it fails validation.
 *
 * The row is cached because `options()` is read on every order page. The cache
 * is per-process and dropped on write, which is correct for one instance; a
 * multi-instance deployment would see a stale merchant on the other instances
 * until their next boot, the same caveat the in-memory throttler carries.
 */
@Injectable()
export class PaymentSettingsService {
  private cached: PaymentSettings | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** The settings, for server-side use. Callers must not echo the merchant. */
  async current(): Promise<PaymentSettings> {
    if (this.cached) return this.cached;

    const row = await this.prisma.paymentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) {
      // The migration seeds this row, so its absence means someone deleted it.
      // Failing loudly beats silently inventing a card number to pay into.
      throw new BadRequestException({
        code: 'payment_settings_missing',
        message: MESSAGES.settings.missing,
      });
    }

    this.cached = {
      cardToCardEnabled: row.cardToCardEnabled,
      cardHolder: row.cardHolder,
      cardNumber: row.cardNumber,
      onlineEnabled: row.onlineEnabled,
      zibalMerchant: row.zibalMerchant,
      zibalBaseUrl: row.zibalBaseUrl,
      zibalCallbackUrl: row.zibalCallbackUrl,
      webBaseUrl: row.webBaseUrl,
    };
    return this.cached;
  }

  /**
   * Whether online payment is genuinely usable.
   *
   * The admin's switch is necessary but not sufficient: a gateway with no
   * merchant or no callback URL would put a button on the page that fails at the
   * bank, which is worse than no button.
   */
  static isOnlineReady(settings: {
    onlineEnabled: boolean;
    zibalMerchant: string | null;
    zibalCallbackUrl: string | null;
  }): boolean {
    return Boolean(
      settings.onlineEnabled && settings.zibalMerchant?.trim() && settings.zibalCallbackUrl?.trim(),
    );
  }

  async forAdmin(): Promise<AdminPaymentSettings> {
    const row = await this.prisma.paymentSettings.findUnique({
      where: { id: SETTINGS_ID },
      include: { updatedBy: { select: { username: true } } },
    });
    if (!row) {
      throw new BadRequestException({
        code: 'payment_settings_missing',
        message: MESSAGES.settings.missing,
      });
    }

    return {
      cardToCardEnabled: row.cardToCardEnabled,
      cardHolder: row.cardHolder,
      cardNumber: row.cardNumber,
      onlineEnabled: row.onlineEnabled,
      zibalMerchantSet: Boolean(row.zibalMerchant),
      zibalMerchantHint: hintOf(row.zibalMerchant),
      zibalBaseUrl: row.zibalBaseUrl,
      zibalCallbackUrl: row.zibalCallbackUrl,
      webBaseUrl: row.webBaseUrl,
      onlineReady: PaymentSettingsService.isOnlineReady(row),
      updatedAt: row.updatedAt.toISOString(),
      updatedByUsername: row.updatedBy?.username ?? null,
    };
  }

  /**
   * Applies an admin's edit.
   *
   * A patch: a field that is absent is left alone. That matters most for
   * `zibalMerchant` — the dashboard cannot read the current key, so it cannot
   * send it back, and "not sent" has to mean "keep it" rather than "clear it".
   * Clearing is deliberate and explicit: send an empty string.
   */
  async update(dto: UpdatePaymentSettingsDto, admin: AuthUser): Promise<AdminPaymentSettings> {
    const current = await this.prisma.paymentSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!current) {
      throw new BadRequestException({
        code: 'payment_settings_missing',
        message: MESSAGES.settings.missing,
      });
    }

    const merchant =
      dto.zibalMerchant === undefined ? current.zibalMerchant : dto.zibalMerchant.trim() || null;

    const next = {
      cardToCardEnabled: dto.cardToCardEnabled ?? current.cardToCardEnabled,
      onlineEnabled: dto.onlineEnabled ?? current.onlineEnabled,
      zibalCallbackUrl: blankToNull(dto.zibalCallbackUrl, current.zibalCallbackUrl),
      zibalMerchant: merchant,
    };

    // A customer must always have some way to pay. Turning off the last one is
    // the single edit on this page that could take the shop offline, so it is
    // refused rather than warned about.
    if (!next.cardToCardEnabled && !PaymentSettingsService.isOnlineReady(next)) {
      throw new BadRequestException({
        code: 'no_payment_method',
        message: MESSAGES.settings.noMethodLeft,
      });
    }

    const row = await this.prisma.paymentSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        ...(dto.cardToCardEnabled === undefined ? {} : { cardToCardEnabled: dto.cardToCardEnabled }),
        ...(dto.cardHolder === undefined ? {} : { cardHolder: dto.cardHolder.trim() }),
        ...(dto.cardNumber === undefined ? {} : { cardNumber: dto.cardNumber.trim() }),
        ...(dto.onlineEnabled === undefined ? {} : { onlineEnabled: dto.onlineEnabled }),
        ...(dto.zibalMerchant === undefined ? {} : { zibalMerchant: merchant }),
        ...(dto.zibalBaseUrl === undefined ? {} : { zibalBaseUrl: trimSlashes(dto.zibalBaseUrl) }),
        ...(dto.zibalCallbackUrl === undefined
          ? {}
          : { zibalCallbackUrl: dto.zibalCallbackUrl.trim() || null }),
        ...(dto.webBaseUrl === undefined
          ? {}
          : { webBaseUrl: dto.webBaseUrl.trim() ? trimSlashes(dto.webBaseUrl) : null }),
        updatedById: admin.id,
      },
      include: { updatedBy: { select: { username: true } } },
    });

    this.cached = null;

    return {
      cardToCardEnabled: row.cardToCardEnabled,
      cardHolder: row.cardHolder,
      cardNumber: row.cardNumber,
      onlineEnabled: row.onlineEnabled,
      zibalMerchantSet: Boolean(row.zibalMerchant),
      zibalMerchantHint: hintOf(row.zibalMerchant),
      zibalBaseUrl: row.zibalBaseUrl,
      zibalCallbackUrl: row.zibalCallbackUrl,
      webBaseUrl: row.webBaseUrl,
      onlineReady: PaymentSettingsService.isOnlineReady(row),
      updatedAt: row.updatedAt.toISOString(),
      updatedByUsername: row.updatedBy?.username ?? null,
    };
  }
}

/**
 * `3f19ab7c204e8d5b6c1a9e42` → `3f19••••9e42`.
 *
 * Enough for an admin to recognise which key is installed, and not enough to be
 * one. A key too short to mask safely is shown as dots alone rather than
 * leaking a larger proportion of itself.
 */
export function hintOf(merchant: string | null): string | null {
  if (!merchant) return null;
  const value = merchant.trim();
  if (value.length < 12) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function blankToNull(next: string | undefined, current: string | null): string | null {
  if (next === undefined) return current;
  return next.trim() || null;
}

function trimSlashes(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
