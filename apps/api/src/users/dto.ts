import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Length, Matches, MinLength } from 'class-validator';

import {
  FIELD_ERRORS,
  MIN_PASSWORD_LENGTH,
  MOBILE_PATTERN,
} from '../common/validation';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class UpdateProfileDto {
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

  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.companyName })
  companyName!: string;

  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.teamName })
  teamName!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: FIELD_ERRORS.password })
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, { message: FIELD_ERRORS.password })
  newPassword!: string;
}

export class ClaimOrderDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: FIELD_ERRORS.orderNumber })
  orderNumber!: string;

  @trim()
  @Matches(MOBILE_PATTERN, { message: FIELD_ERRORS.mobile })
  mobile!: string;
}
