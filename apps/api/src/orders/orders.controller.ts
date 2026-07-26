import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import type { AuthUser } from '../auth/auth.types';
import { AuthGuard, CurrentUser, OptionalAuthGuard } from '../auth/guards';
import { RECEIPT_MAX_BYTES } from '../common/validation';
import { PlaceOrderDto, TrackOrderDto } from './dto';
import { GuestToken } from './guest-token.decorator';
import type { OrderDetail, OrderStatusHistoryView } from './order.mapper';
import { OrdersService, type PlacedOrder, type Viewer } from './orders.service';

/**
 * Customer-facing orders.
 *
 * Every route runs under OptionalAuthGuard: one endpoint serves both a
 * signed-in customer and a guest holding a token. Which one is calling is
 * settled by `viewer()`, not by two parallel sets of routes.
 */
@Controller('orders')
@UseGuards(OptionalAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  // Guest checkout is unauthenticated by design; this keeps it from being a firehose.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  place(@Body() dto: PlaceOrderDto, @CurrentUser() user?: AuthUser): Promise<PlacedOrder> {
    return this.orders.place(dto, user);
  }

  /** Orders belonging to the signed-in customer. */
  @Get('mine')
  @UseGuards(AuthGuard)
  listMine(@CurrentUser() user: AuthUser): Promise<OrderDetail[]> {
    return this.orders.listMine(user);
  }

  /** Orders this browser still holds guest tokens for. */
  @Post('by-tokens')
  @HttpCode(HttpStatus.OK)
  listByTokens(@Body('tokens') tokens: string[] = []): Promise<OrderDetail[]> {
    return this.orders.listByGuestTokens(Array.isArray(tokens) ? tokens : []);
  }

  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  track(@Body() dto: TrackOrderDto): Promise<PlacedOrder> {
    return this.orders.track(dto.orderNumber, dto.mobile);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GuestToken() guestToken?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<OrderDetail> {
    return this.orders.findOne(id, viewer(user, guestToken));
  }

  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @GuestToken() guestToken?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<OrderStatusHistoryView[]> {
    return this.orders.history(id, viewer(user, guestToken));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @GuestToken() guestToken?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<OrderDetail> {
    return this.orders.cancelOwn(id, viewer(user, guestToken));
  }

  @Post(':id/receipt')
  @UseInterceptors(
    FileInterceptor('receipt', {
      storage: memoryStorage(),
      limits: { fileSize: RECEIPT_MAX_BYTES, files: 1 },
    }),
  )
  attachReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @GuestToken() guestToken?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<OrderDetail> {
    return this.orders.attachReceipt(id, file, viewer(user, guestToken));
  }

  /**
   * Streams the receipt to whoever may see the order. This replaces Supabase's
   * signed URLs — the file is never publicly addressable.
   */
  @Get(':id/receipt')
  async openReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
    @GuestToken() guestToken?: string,
    @CurrentUser() user?: AuthUser,
  ): Promise<void> {
    const { stream, contentType } = await this.orders.openReceipt(id, viewer(user, guestToken));

    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(response);
  }
}

function viewer(user?: AuthUser, guestToken?: string): Viewer {
  return { user, guestToken };
}
