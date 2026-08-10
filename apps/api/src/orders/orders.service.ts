import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MESSAGES } from '../common/messages';
import { isFutureDay, isoToDate, isoToYymmdd, tehranToday, tehranTomorrow } from '../common/tehran';
import { DEFAULT_COMPANY_NAME } from '../common/validation';
import type { AuthUser } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { OrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { AdminOrderQueryDto, PlaceOrderDto } from './dto';
import {
  ORDER_DETAIL_INCLUDE,
  toOrderDetail,
  type OrderDetail,
  type OrderStatusHistoryView,
} from './order.mapper';
import { ReceiptsService } from './receipts.service';

/**
 * The status machine. `done` and `cancelled` are terminal — an order that has
 * been handed over or called off never moves again.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

const ORDER_NUMBER_ATTEMPTS = 5;

/** How the caller proves the order is theirs. */
export interface Viewer {
  user?: AuthUser;
  guestToken?: string;
}

/** What a product has to look like to be priced into a basket. */
export interface PricedProduct {
  id: string;
  price: Prisma.Decimal;
  currency: string;
  unit: string;
  isActive: boolean;
}

export interface PricedLine {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  unit: string;
}

export interface PricedBasket {
  lines: PricedLine[];
  total: Prisma.Decimal;
  currency: string;
}

/**
 * Turns requested lines into priced ones, or explains why it cannot.
 *
 * Pure, and separate from `place` so the arithmetic and the refusals can be
 * tested without a database. Every price comes from the `products` row — the
 * request supplies a product id and a count, and nothing else is trusted.
 */
export function priceBasket(
  lines: readonly { productId: string; quantity: number }[],
  products: readonly PricedProduct[],
): PricedBasket {
  if (lines.length === 0) {
    throw new BadRequestException({ code: 'basket_empty', message: MESSAGES.order.basketEmpty });
  }

  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.productId)) {
      // The database would refuse this anyway — order_items is unique on
      // (order_id, product_id) — but a Persian sentence beats a 500.
      throw new BadRequestException({
        code: 'duplicate_product',
        message: MESSAGES.order.duplicateProduct,
      });
    }
    seen.add(line.productId);
  }

  const byId = new Map(products.map((product) => [product.id, product]));
  const priced: PricedLine[] = [];
  let total = new Prisma.Decimal(0);

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || !product.isActive) {
      throw new BadRequestException({
        code: 'product_unavailable',
        message: MESSAGES.order.productUnavailable,
      });
    }

    priced.push({
      productId: product.id,
      quantity: line.quantity,
      unitPrice: product.price,
      unit: product.unit,
    });
    total = total.add(product.price.mul(line.quantity));
  }

  const currencies = new Set(priced.map((line) => byId.get(line.productId)!.currency));
  if (currencies.size > 1) {
    throw new BadRequestException({
      code: 'mixed_currency',
      message: MESSAGES.order.mixedCurrency,
    });
  }

  return { lines: priced, total, currency: [...currencies][0] };
}

export interface PlacedOrder {
  order: OrderDetail;
  /** Returned exactly once, at checkout, and only for a guest. */
  guestToken: string | null;
}

export interface AdminOrderPage {
  items: OrderDetail[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminStats {
  byStatus: Record<OrderStatus, number>;
  tomorrow: { orders: number; quantity: number };
  awaitingReceiptReview: number;
}

/**
 * Orders, payments and the whole lifecycle.
 *
 * This service is the only thing in the system allowed to write to `orders`,
 * `order_items`, `payments` or `order_status_history`. There is no generic CRUD
 * endpoint for any of them. Under Supabase that guarantee came from row level
 * security; here it comes from there being no other code path, so keep it that
 * way when adding features.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptsService,
  ) {}

  // --- Placing --------------------------------------------------------------

  async place(dto: PlaceOrderDto, actor?: AuthUser): Promise<PlacedOrder> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.items.map((line) => line.productId) } },
    });
    const basket = priceBasket(dto.items, products);

    const deliveryDate = dto.deliveryDate ?? tehranTomorrow();
    if (!isFutureDay(deliveryDate)) {
      throw new BadRequestException({
        code: 'delivery_date_not_future',
        message: MESSAGES.order.futureDateRequired,
      });
    }

    const identity = await this.resolveIdentity(dto, actor);

    // The order number embeds a Tehran date and a per-day counter, so two
    // concurrent checkouts can pick the same one. Rather than lock a counter
    // table, let the unique index arbitrate and retry the loser.
    for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const orderNumber = await this.nextOrderNumber(tx);

          const order = await tx.order.create({
            data: {
              orderNumber,
              userId: identity.userId,
              guestToken: identity.guestToken,
              contactName: identity.contactName,
              contactMobile: identity.contactMobile,
              companyName: identity.companyName,
              teamName: identity.teamName,
              deliveryDate: isoToDate(deliveryDate),
              notes: dto.notes || null,
              currency: basket.currency,
              totalAmount: basket.total,
              items: {
                // Priced from the products table, never from the request.
                create: basket.lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  unit: line.unit,
                })),
              },
              payment: {
                create: {
                  userId: identity.userId,
                  amount: basket.total,
                  currency: basket.currency,
                  method: 'receipt_upload',
                  status: 'awaiting_receipt',
                },
              },
              history: {
                create: { toStatus: 'pending', changedById: identity.userId },
              },
            },
            include: ORDER_DETAIL_INCLUDE,
          });

          return order;
        });

        return { order: toOrderDetail(created), guestToken: identity.guestToken };
      } catch (error) {
        if (isOrderNumberCollision(error) && attempt < ORDER_NUMBER_ATTEMPTS - 1) continue;
        throw error;
      }
    }

    throw new ConflictException({
      code: 'order_number_unavailable',
      message: MESSAGES.order.couldNotAllocateNumber,
    });
  }

  /**
   * Who is this order for? A signed-in customer inherits their profile; a guest
   * must say. Either way the answer is snapshotted onto the order so that a
   * later profile edit does not rewrite an old order's destination.
   */
  private async resolveIdentity(dto: PlaceOrderDto, actor?: AuthUser) {
    if (actor) {
      const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
      if (!user || !user.isActive) {
        throw new ForbiddenException({
          code: 'inactive_account',
          message: MESSAGES.auth.inactiveAccount,
        });
      }

      return {
        userId: user.id,
        guestToken: null,
        contactName: dto.contactName || `${user.firstName} ${user.lastName}`.trim(),
        contactMobile: dto.contactMobile || user.mobile,
        companyName: dto.companyName || user.companyName || DEFAULT_COMPANY_NAME,
        teamName: dto.teamName || user.teamName,
      };
    }

    // Guest checkout: these are the fields there is nowhere else to get.
    const missing: string[] = [];
    if (!dto.contactName) missing.push('نام و نام خانوادگی');
    if (!dto.contactMobile) missing.push('شمارهٔ موبایل');
    if (!dto.teamName) missing.push('نام تیم');

    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'guest_details_required',
        message: `برای ثبت سفارش بدون حساب، ${missing.join(' و ')} لازم است.`,
      });
    }

    return {
      userId: null,
      guestToken: randomBytes(32).toString('base64url'),
      contactName: dto.contactName!,
      contactMobile: dto.contactMobile!,
      companyName: dto.companyName || DEFAULT_COMPANY_NAME,
      teamName: dto.teamName!,
    };
  }

  /** `RM-260726-0001` — Tehran date, then a counter that resets each day. */
  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const prefix = `RM-${isoToYymmdd(tehranToday())}-`;

    const latest = await tx.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    const previous = latest ? Number.parseInt(latest.orderNumber.slice(prefix.length), 10) : 0;
    // Past 9999 the counter simply grows a digit rather than wrapping onto an
    // number already used today.
    return prefix + String(previous + 1).padStart(4, '0');
  }

  // --- Reading --------------------------------------------------------------

  async findOne(orderId: string, viewer: Viewer): Promise<OrderDetail> {
    const order = await this.loadViewable(orderId, viewer);
    return toOrderDetail(order);
  }

  async history(orderId: string, viewer: Viewer): Promise<OrderStatusHistoryView[]> {
    await this.loadViewable(orderId, viewer);

    const entries = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return entries.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  async listMine(actor: AuthUser): Promise<OrderDetail[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId: actor.id },
      include: ORDER_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(toOrderDetail);
  }

  /** The orders a guest's browser still holds tokens for. */
  async listByGuestTokens(tokens: string[]): Promise<OrderDetail[]> {
    const wanted = tokens.filter(Boolean).slice(0, 50);
    if (wanted.length === 0) return [];

    const orders = await this.prisma.order.findMany({
      where: { guestToken: { in: wanted } },
      include: ORDER_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(toOrderDetail);
  }

  /**
   * Guest lookup by order number and the mobile it was placed with. Returns the
   * guest token so the browser can keep reading the order afterwards.
   */
  async track(orderNumber: string, mobile: string): Promise<PlacedOrder> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      include: ORDER_DETAIL_INCLUDE,
    });

    // One message for "no such order" and "wrong mobile" alike — otherwise this
    // endpoint answers "does order RM-260726-0001 exist?" for anyone who asks.
    if (!order || order.contactMobile !== mobile) {
      throw new NotFoundException({
        code: 'order_not_found',
        message: MESSAGES.order.trackNotFound,
      });
    }

    return { order: toOrderDetail(order), guestToken: order.guestToken };
  }

  // --- Customer actions -----------------------------------------------------

  async cancelOwn(orderId: string, viewer: Viewer): Promise<OrderDetail> {
    const order = await this.loadViewable(orderId, viewer);

    if (order.status !== 'pending') {
      throw new BadRequestException({
        code: 'cancel_only_pending',
        message: MESSAGES.order.cancelOnlyPending,
      });
    }

    return this.transition(order.id, 'cancelled', {
      actorId: viewer.user?.id ?? null,
      note: null,
    });
  }

  async attachReceipt(
    orderId: string,
    file: Express.Multer.File,
    viewer: Viewer,
  ): Promise<OrderDetail> {
    const order = await this.loadViewable(orderId, viewer);

    if (order.status === 'done' || order.status === 'cancelled') {
      throw new BadRequestException({
        code: 'order_closed',
        message: MESSAGES.payment.orderClosed(order.status),
      });
    }
    if (!order.payment) {
      throw new NotFoundException({
        code: 'payment_not_found',
        message: MESSAGES.payment.notFound,
      });
    }

    const previousKey = order.payment.receiptPath;
    const key = await this.receipts.save(order.id, file);

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        payment: {
          update: {
            receiptPath: key,
            status: 'submitted',
            paidAt: order.payment.paidAt ?? new Date(),
            // Re-uploading clears any earlier verdict — it is a new receipt.
            rejectReason: null,
            verifiedById: null,
            verifiedAt: null,
          },
        },
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    await this.receipts.discard(previousKey);
    return toOrderDetail(updated);
  }

  async openReceipt(
    orderId: string,
    viewer: Viewer,
  ): Promise<{ stream: NodeJS.ReadableStream; contentType: string }> {
    const order = await this.loadViewable(orderId, viewer);
    const key = order.payment?.receiptPath;

    if (!key) {
      throw new NotFoundException({
        code: 'receipt_missing',
        message: MESSAGES.payment.receiptMissing,
      });
    }

    return { stream: this.receipts.openStream(key), contentType: this.receipts.contentTypeOf(key) };
  }

  /** Attaches a guest order to the account of whoever placed it. */
  async claim(orderNumber: string, mobile: string, actor: AuthUser): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
    });

    if (!order || order.contactMobile !== mobile) {
      throw new NotFoundException({
        code: 'order_not_found',
        message: MESSAGES.order.trackNotFound,
      });
    }
    if (order.userId !== null) {
      throw new ConflictException({
        code: 'order_already_owned',
        message:
          order.userId === actor.id ? MESSAGES.order.alreadyOwned : MESSAGES.order.trackNotFound,
      });
    }

    const claimed = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        userId: actor.id,
        guestToken: null,
        payment: { update: { userId: actor.id } },
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    return toOrderDetail(claimed);
  }

  // --- Admin ----------------------------------------------------------------

  async adminList(query: AdminOrderQueryDto): Promise<AdminOrderPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = query.search?.trim();

    const where: Prisma.OrderWhereInput = {
      ...(query.status && query.status !== 'all' ? { status: query.status } : {}),
      ...(query.deliveryDate ? { deliveryDate: isoToDate(query.deliveryDate) } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { contactName: { contains: search, mode: 'insensitive' } },
              { contactMobile: { contains: search } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { teamName: { contains: search, mode: 'insensitive' } },
              { user: { username: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items: items.map(toOrderDetail), total, page, pageSize };
  }

  async adminFindOne(orderId: string): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException({ code: 'order_not_found', message: MESSAGES.order.notFound });
    }
    return toOrderDetail(order);
  }

  async adminSetStatus(
    orderId: string,
    status: OrderStatus,
    note: string | undefined,
    admin: AuthUser,
  ): Promise<OrderDetail> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException({ code: 'order_not_found', message: MESSAGES.order.notFound });
    }

    return this.transition(orderId, status, { actorId: admin.id, note: note?.trim() || null });
  }

  async adminReviewPayment(
    orderId: string,
    approve: boolean,
    reason: string | undefined,
    admin: AuthUser,
  ): Promise<OrderDetail> {
    const trimmedReason = reason?.trim() || null;
    if (!approve && !trimmedReason) {
      throw new BadRequestException({
        code: 'reject_needs_reason',
        message: MESSAGES.payment.rejectNeedsReason,
      });
    }

    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) {
      throw new NotFoundException({
        code: 'payment_not_found',
        message: MESSAGES.payment.notFound,
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        payment: {
          update: {
            status: approve ? 'verified' : 'rejected',
            verifiedById: admin.id,
            verifiedAt: new Date(),
            rejectReason: approve ? null : trimmedReason,
          },
        },
      },
      include: ORDER_DETAIL_INCLUDE,
    });

    return toOrderDetail(updated);
  }

  async adminStats(): Promise<AdminStats> {
    const tomorrow = isoToDate(tehranTomorrow());

    const [grouped, tomorrowOrders, awaitingReview] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.findMany({
        where: { deliveryDate: tomorrow, status: { in: ['pending', 'in_progress'] } },
        select: { items: { select: { quantity: true } } },
      }),
      this.prisma.payment.count({ where: { status: 'submitted' } }),
    ]);

    const byStatus = Object.fromEntries(
      Object.values(OrderStatus).map((status) => [status, 0]),
    ) as Record<OrderStatus, number>;
    for (const row of grouped) byStatus[row.status] = row._count._all;

    return {
      byStatus,
      tomorrow: {
        orders: tomorrowOrders.length,
        quantity: tomorrowOrders.reduce(
          (sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0),
          0,
        ),
      },
      awaitingReceiptReview: awaitingReview,
    };
  }

  // --- Shared internals -----------------------------------------------------

  /**
   * The single status-change path. Validates the move, stamps the matching
   * timestamp, appends to the audit trail, and — on acceptance — verifies a
   * receipt that is merely submitted. All in one transaction.
   */
  private async transition(
    orderId: string,
    next: OrderStatus,
    context: { actorId: string | null; note: string | null },
  ): Promise<OrderDetail> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, adminNote: true },
      });
      if (!current) {
        throw new NotFoundException({ code: 'order_not_found', message: MESSAGES.order.notFound });
      }

      if (current.status === next) {
        return tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: ORDER_DETAIL_INCLUDE,
        });
      }

      if (!ALLOWED_TRANSITIONS[current.status].includes(next)) {
        throw new BadRequestException({
          code: 'invalid_transition',
          message: MESSAGES.order.transition(current.status, next),
        });
      }

      const now = new Date();
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: next,
          adminNote: context.note ?? current.adminNote,
          ...(next === 'in_progress'
            ? { acceptedById: context.actorId, acceptedAt: now }
            : next === 'done'
              ? { completedAt: now }
              : { cancelledAt: now }),
        },
        include: ORDER_DETAIL_INCLUDE,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: current.status,
          toStatus: next,
          changedById: context.actorId,
          note: context.note,
        },
      });

      // Accepting an order with a receipt on file settles that receipt too. A
      // rejected or missing one is left alone — the admin decides separately.
      if (next === 'in_progress' && context.actorId) {
        await tx.payment.updateMany({
          where: { orderId, status: 'submitted' },
          data: { status: 'verified', verifiedById: context.actorId, verifiedAt: now },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_DETAIL_INCLUDE });
    });

    return toOrderDetail(updated);
  }

  private async loadViewable(orderId: string, viewer: Viewer) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_INCLUDE,
    });

    // "Not found" and "not yours" answer identically on purpose: an order id
    // should not be a probe for whether an order exists.
    if (!order || !canView(order, viewer)) {
      throw new NotFoundException({ code: 'order_not_found', message: MESSAGES.order.notFound });
    }

    return order;
  }
}

export function canView(
  order: { userId: string | null; guestToken: string | null },
  viewer: Viewer,
): boolean {
  if (viewer.user?.role === 'admin') return true;
  if (viewer.user && order.userId === viewer.user.id) return true;
  if (viewer.guestToken && order.guestToken) {
    return secureEquals(viewer.guestToken, order.guestToken);
  }
  return false;
}

function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isOrderNumberCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.['target'] ?? '').includes('order_number')
  );
}
