import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

import {
  FIELD_ERRORS,
  MIN_PASSWORD_LENGTH,
  MOBILE_PATTERN,
  USERNAME_PATTERN,
} from '../common/validation';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const lower = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class RegisterDto {
  @lower()
  @Matches(USERNAME_PATTERN, { message: FIELD_ERRORS.username })
  username!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: FIELD_ERRORS.password })
  password!: string;

  @trim()
  @IsString()
  @Length(1, 60, { message: FIELD_ERRORS.firstName })
  firstName!: string;

  @trim()
  @IsString()
  @Length(1, 60, { message: FIELD_ERRORS.lastName })
  lastName!: string;

  @trim()
  @Matches(MOBILE_PATTERN, { message: FIELD_ERRORS.mobile })
  mobile!: string;

  /** Optional — falls back to the default company. */
  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.companyName })
  companyName?: string;

  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.teamName })
  teamName!: string;
}

export class LoginDto {
  @lower()
  @IsString()
  @IsNotEmpty({ message: FIELD_ERRORS.username })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: FIELD_ERRORS.password })
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
