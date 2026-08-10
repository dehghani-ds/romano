import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { OrderStatus } from '../generated/prisma/enums';
import {
  FIELD_ERRORS,
  MAX_BASKET_LINES,
  MAX_QUANTITY,
  MIN_QUANTITY,
  MOBILE_PATTERN,
} from '../common/validation';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/**
 * Checkout.
 *
 * Contact and destination fields are optional here because a signed-in customer
 * inherits them from their profile. For a guest they are required — but only the
 * service knows whether the caller is a guest, so that check lives there and
 * this DTO validates shape only.
 */
/** One basket line. Quantity is capped per line, not across the basket. */
export class OrderLineDto {
  @IsUUID('all', { message: FIELD_ERRORS.productId })
  productId!: string;

  @Type(() => Number)
  @IsInt({ message: FIELD_ERRORS.quantity })
  @Min(MIN_QUANTITY, { message: FIELD_ERRORS.quantity })
  @Max(MAX_QUANTITY, { message: FIELD_ERRORS.quantity })
  quantity!: number;
}

export class PlaceOrderDto {
  @IsArray({ message: FIELD_ERRORS.basketEmpty })
  @ArrayMinSize(1, { message: FIELD_ERRORS.basketEmpty })
  @ArrayMaxSize(MAX_BASKET_LINES, { message: FIELD_ERRORS.basketTooManyLines })
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500, { message: FIELD_ERRORS.notes })
  notes?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: FIELD_ERRORS.deliveryDate })
  deliveryDate?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 60, { message: FIELD_ERRORS.firstName })
  contactName?: string;

  @IsOptional()
  @trim()
  @Matches(MOBILE_PATTERN, { message: FIELD_ERRORS.mobile })
  contactMobile?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.companyName })
  companyName?: string;

  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 80, { message: FIELD_ERRORS.teamName })
  teamName?: string;
}

/** Guest lookup: order number plus the mobile it was placed with. */
export class TrackOrderDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: FIELD_ERRORS.orderNumber })
  orderNumber!: string;

  @trim()
  @Matches(MOBILE_PATTERN, { message: FIELD_ERRORS.mobile })
  mobile!: string;
}

export class SetOrderStatusDto {
  @IsIn(Object.values(OrderStatus), { message: FIELD_ERRORS.status })
  status!: OrderStatus;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500, { message: FIELD_ERRORS.notes })
  note?: string;
}

export class ReviewPaymentDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300, { message: FIELD_ERRORS.reason })
  reason?: string;
}

export class AdminOrderQueryDto {
  @IsOptional()
  @IsIn([...Object.values(OrderStatus), 'all'], { message: FIELD_ERRORS.status })
  status?: OrderStatus | 'all';

  @IsOptional()
  @Matches(ISO_DATE, { message: FIELD_ERRORS.deliveryDate })
  deliveryDate?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
