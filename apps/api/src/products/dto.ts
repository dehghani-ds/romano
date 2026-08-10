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
  ValidateIf,
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

/** On a PATCH, a field left empty is the admin clearing it. */
const emptyToNull = () =>
  Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));

/**
 * Optional in the PATCH sense: absent means "leave it alone", and anything else
 * — `null` included — is validated. `@IsOptional()` would wave `null` through,
 * and `null` has no business reaching a `NOT NULL` column.
 */
const present = () => ValidateIf((_object, value) => value !== undefined);

/** The same, for the two columns where `null` is a legitimate value. */
const given = () => ValidateIf((_object, value) => value !== undefined && value !== null);

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

/**
 * Editing a product. A PATCH: a field that is absent is left alone, which is
 * what lets the dashboard send only what the admin actually touched.
 *
 * `slug` is not here, and that is the point — it is the product's identity in a
 * URL, and the add form promises in writing that it never changes. A rename
 * that has to change the slug is a new product plus deactivating the old one.
 */
export class UpdateProductDto {
  @present()
  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.productName })
  name?: string;

  /** `null` — or an empty field — clears the description; absent keeps it. */
  @given()
  @emptyToNull()
  @trim()
  @IsString()
  @MaxLength(500, { message: FIELD_ERRORS.productDescription })
  description?: string | null;

  /**
   * Changing the price never touches an order that already exists: `order_items`
   * snapshots `unitPrice` and `unit` at checkout, so history keeps its own copy.
   */
  @present()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: FIELD_ERRORS.productPrice })
  @Min(MIN_PRODUCT_PRICE, { message: FIELD_ERRORS.productPrice })
  @Max(MAX_PRODUCT_PRICE, { message: FIELD_ERRORS.productPrice })
  price?: number;

  @present()
  @trim()
  @Matches(CURRENCY_PATTERN, { message: FIELD_ERRORS.productCurrency })
  currency?: string;

  @present()
  @trim()
  @IsString()
  @Length(1, MAX_UNIT_LENGTH, { message: FIELD_ERRORS.productUnit })
  unit?: string;

  /** `null` — or an empty field — removes the image; absent keeps it. */
  @given()
  @emptyToNull()
  @trim()
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: FIELD_ERRORS.productImageUrl },
  )
  @MaxLength(500, { message: FIELD_ERRORS.productImageUrl })
  imageUrl?: string | null;

  @present()
  @IsBoolean()
  isActive?: boolean;

  @present()
  @Type(() => Number)
  @IsInt({ message: FIELD_ERRORS.productSortOrder })
  @Min(0, { message: FIELD_ERRORS.productSortOrder })
  @Max(999, { message: FIELD_ERRORS.productSortOrder })
  sortOrder?: number;
}
