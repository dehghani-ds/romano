import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  CURRENCY_PATTERN,
  FIELD_ERRORS,
  MAX_PRODUCT_PRICE,
  MAX_UNIT_LENGTH,
  MIN_PRODUCT_PRICE,
  PRODUCT_SLUG_PATTERN,
} from '../common/validation';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Empty strings from a form field mean "not given", not "set it to empty". */
const emptyToUndefined = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value));

export class CreateProductDto {
  @trim()
  @Matches(PRODUCT_SLUG_PATTERN, { message: FIELD_ERRORS.productSlug })
  @MaxLength(60, { message: FIELD_ERRORS.productSlug })
  slug!: string;

  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.productName })
  name!: string;

  @IsOptional()
  @emptyToUndefined()
  @trim()
  @IsString()
  @MaxLength(500, { message: FIELD_ERRORS.productDescription })
  description?: string;

  /**
   * Rial, and whole units in practice — but the column is `Decimal(12, 2)`, so
   * two decimal places are accepted rather than silently truncated.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: FIELD_ERRORS.productPrice })
  @Min(MIN_PRODUCT_PRICE, { message: FIELD_ERRORS.productPrice })
  @Max(MAX_PRODUCT_PRICE, { message: FIELD_ERRORS.productPrice })
  price!: number;

  @IsOptional()
  @emptyToUndefined()
  @trim()
  @Matches(CURRENCY_PATTERN, { message: FIELD_ERRORS.productCurrency })
  currency?: string;

  /** فنجان, عدد, بسته — free text, because the list is not ours to fix. */
  @IsOptional()
  @emptyToUndefined()
  @trim()
  @IsString()
  @Length(1, MAX_UNIT_LENGTH, { message: FIELD_ERRORS.productUnit })
  unit?: string;

  @IsOptional()
  @emptyToUndefined()
  @trim()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: FIELD_ERRORS.productImageUrl },
  )
  @MaxLength(500, { message: FIELD_ERRORS.productImageUrl })
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: FIELD_ERRORS.productSortOrder })
  @Min(0, { message: FIELD_ERRORS.productSortOrder })
  @Max(999, { message: FIELD_ERRORS.productSortOrder })
  sortOrder?: number;
}
