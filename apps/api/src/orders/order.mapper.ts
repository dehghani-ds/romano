import { Prisma } from '../generated/prisma/client';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '../generated/prisma/enums';
import { dateToIso } from '../common/tehran';

/**
 * The shape the two front ends read. It replaces the old `order_details` view.
 *
 * Two deliberate differences from that view: the receipt's storage key never
 * leaves the server (callers get `hasReceipt` and fetch the file through a
 * guarded endpoint instead), and the guest token is never echoed back except at
 * the one moment it is issued.
 */
export interface OrderItemView {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPaymentView {
  id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  hasReceipt: boolean;
  reference: string | null;
  rejectReason: string | null;
  paidAt: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryDate: string;
  totalAmount: number;
  currency: string;
  notes: string | null;
  adminNote: string | null;

  contactName: string;
  contactMobile: string;
  companyName: string;
  teamName: string;

  isGuest: boolean;
  customerUsername: string | null;

  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;

  items: OrderItemView[];
  totalCups: number;
  productNames: string;
  payment: OrderPaymentView | null;
}

export interface OrderStatusHistoryView {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
}

export const ORDER_DETAIL_INCLUDE = {
  items: { include: { product: true } },
  payment: true,
  user: { select: { username: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

export function toOrderDetail(order: OrderWithDetail): OrderDetail {
  const items: OrderItemView[] = order.items.map((item) => ({
    productId: item.productId,
    productName: item.product.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toNumber(),
    lineTotal: item.unitPrice.mul(item.quantity).toNumber(),
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    deliveryDate: dateToIso(order.deliveryDate),
    totalAmount: order.totalAmount.toNumber(),
    currency: order.currency,
    notes: order.notes,
    adminNote: order.adminNote,

    contactName: order.contactName,
    contactMobile: order.contactMobile,
    companyName: order.companyName,
    teamName: order.teamName,

    isGuest: order.userId === null,
    customerUsername: order.user?.username ?? null,

    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),

    items,
    totalCups: items.reduce((sum, item) => sum + item.quantity, 0),
    productNames: items
      .map((item) => item.productName)
      .sort((a, b) => a.localeCompare(b, 'fa'))
      .join('، '),

    payment: order.payment
      ? {
          id: order.payment.id,
          status: order.payment.status,
          method: order.payment.method,
          hasReceipt: order.payment.receiptPath !== null,
          reference: order.payment.reference,
          rejectReason: order.payment.rejectReason,
          paidAt: order.payment.paidAt?.toISOString() ?? null,
        }
      : null,
  };
}
