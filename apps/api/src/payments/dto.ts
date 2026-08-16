import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

import { SETTINGS_ERRORS } from '../common/validation';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** An absolute URL, or the empty string meaning "clear this". */
const OPTIONAL_URL = /^(https?:\/\/\S+)?$/;

/**
 * Editing the payment settings.
 *
 * Every field is optional and absence means "leave it alone". That is not
 * decoration on `zibalMerchant`: the dashboard is never told the current key, so
 * it has nothing to send back, and a missing field has to mean "keep" rather
 * than "clear". Clearing it is done on purpose, by sending an empty string.
 */
export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsBoolean()
  cardToCardEnabled?: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 80, { message: SETTINGS_ERRORS.cardHolder })
  cardHolder?: string;

  @IsOptional()
  @trim()
  @Matches(/^\d{16}$/, { message: SETTINGS_ERRORS.cardNumber })
  cardNumber?: string;

  @IsOptional()
  @IsBoolean()
  onlineEnabled?: boolean;

  /**
   * The gateway credential. Write-only: it can be set here and is never read
   * back through any endpoint.
   */
  @IsOptional()
  @trim()
  @IsString()
  @Matches(/^([A-Za-z0-9._-]{4,128})?$/, { message: SETTINGS_ERRORS.zibalMerchant })
  zibalMerchant?: string;

  @IsOptional()
  @trim()
  @Matches(/^https?:\/\/\S+$/, { message: SETTINGS_ERRORS.zibalBaseUrl })
  zibalBaseUrl?: string;

  @IsOptional()
  @trim()
  @Matches(OPTIONAL_URL, { message: SETTINGS_ERRORS.zibalCallbackUrl })
  zibalCallbackUrl?: string;

  @IsOptional()
  @trim()
  @Matches(OPTIONAL_URL, { message: SETTINGS_ERRORS.webBaseUrl })
  webBaseUrl?: string;
}
