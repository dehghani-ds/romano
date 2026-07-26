import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthUser } from '../auth/auth.types';
import { AdminGuard, AuthGuard, CurrentUser } from '../auth/guards';
import { AdminOrderQueryDto, ReviewPaymentDto, SetOrderStatusDto } from './dto';
import type { OrderDetail, OrderStatusHistoryView } from './order.mapper';
import { OrdersService, type AdminOrderPage, type AdminStats } from './orders.service';

/** The dashboard's surface. Admin-only, top to bottom. */
@Controller('admin/orders')
@UseGuards(AuthGuard, AdminGuard)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: AdminOrderQueryDto): Promise<AdminOrderPage> {
    return this.orders.adminList(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDetail> {
    return this.orders.adminFindOne(id);
  }

  @Get(':id/history')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<OrderStatusHistoryView[]> {
    return this.orders.history(id, { user: admin });
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderStatusDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<OrderDetail> {
    return this.orders.adminSetStatus(id, dto.status, dto.note, admin);
  }

  @Post(':id/payment/review')
  @HttpCode(HttpStatus.OK)
  reviewPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewPaymentDto,
    @CurrentUser() admin: AuthUser,
  ): Promise<OrderDetail> {
    return this.orders.adminReviewPayment(id, dto.approve, dto.reason, admin);
  }

  @Get(':id/receipt')
  async openReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
    @CurrentUser() admin: AuthUser,
  ): Promise<void> {
    const { stream, contentType } = await this.orders.openReceipt(id, { user: admin });

    response.setHeader('Content-Type', contentType);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(response);
  }
}

@Controller('admin/stats')
@UseGuards(AuthGuard, AdminGuard)
export class AdminStatsController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  stats(): Promise<AdminStats> {
    return this.orders.adminStats();
  }
}
