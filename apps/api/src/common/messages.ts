import { OrderStatus } from '../generated/prisma/enums';

/**
 * Every message a person can end up reading.
 *
 * These used to be Persian string literals inside `raise exception` in the
 * Postgres functions. They live here now for the same reason they lived there:
 * an error reaching the user is copy, not a log line. Keep them written for a
 * person, in Persian, and keep the client free to display them verbatim.
 */

export const STATUS_LABEL_FA: Record<OrderStatus, string> = {
  pending: 'در انتظار',
  in_progress: 'در حال آماده‌سازی',
  done: 'تحویل شده',
  cancelled: 'لغو شده',
};

export const MESSAGES = {
  auth: {
    invalidCredentials: 'نام کاربری یا رمز عبور درست نیست.',
    usernameTaken: 'این نام کاربری قبلاً گرفته شده است.',
    mobileTaken: 'این شماره موبایل قبلاً ثبت شده است.',
    inactiveAccount: 'حساب شما فعال نیست.',
    signInRequired: 'برای این کار باید وارد حساب شوید.',
    adminOnly: 'این بخش فقط در دسترس مدیر است.',
    sessionExpired: 'نشست شما منقضی شده است. دوباره وارد شوید.',
    currentPasswordWrong: 'رمز عبور فعلی درست نیست.',
    userNotFound: 'حساب کاربری پیدا نشد.',
  },

  order: {
    notFound: 'سفارش پیدا نشد.',
    forbidden: 'به این سفارش دسترسی ندارید.',
    quantityRange: 'تعداد هر مورد باید بین ۱ تا ۲۰ باشد.',
    productUnavailable: 'این محصول در دسترس نیست.',
    basketEmpty: 'سبد شما خالی است. دست‌کم یک محصول انتخاب کنید.',
    duplicateProduct: 'هر محصول فقط یک بار در سبد می‌آید — تعدادش را زیاد کنید.',
    mixedCurrency: 'همهٔ محصول‌های یک سفارش باید با یک واحد پول باشند.',
    futureDateRequired: 'سفارش باید برای یک روز آینده ثبت شود (دست‌کم فردا).',
    cancelOnlyPending: 'فقط سفارشی که هنوز در انتظار است را می‌توانید خودتان لغو کنید.',
    transition: (from: OrderStatus, to: OrderStatus) =>
      `سفارش را نمی‌توان از «${STATUS_LABEL_FA[from]}» به «${STATUS_LABEL_FA[to]}» برد.`,
    couldNotAllocateNumber: 'ثبت سفارش موقتاً ممکن نشد. چند لحظه بعد دوباره تلاش کنید.',
    trackNotFound: 'سفارشی با این شماره و شمارهٔ موبایل پیدا نشد.',
    alreadyOwned: 'این سفارش قبلاً به یک حساب کاربری وصل شده است.',
  },

  product: {
    notFound: 'محصول پیدا نشد.',
    slugTaken: 'محصولی با این شناسه از قبل هست. شناسهٔ دیگری بنویسید.',
    created: 'محصول ثبت شد.',
  },

  expense: {
    notFound: 'این هزینه پیدا نشد.',
    futureDateRejected: 'تاریخ خرج نمی‌تواند در آینده باشد.',
    payerNotAdmin: 'پرداخت‌کننده باید یکی از مدیران فعال باشد.',
    deleted: 'هزینه حذف شد.',
  },

  payment: {
    notFound: 'پرداخت این سفارش پیدا نشد.',
    receiptRequired: 'فایل رسید لازم است.',
    receiptMissing: 'برای این سفارش هنوز رسیدی بارگذاری نشده است.',
    orderClosed: (status: OrderStatus) => `این سفارش هم‌اکنون «${STATUS_LABEL_FA[status]}» است.`,
    rejectNeedsReason: 'برای رد کردن رسید باید دلیل بنویسید.',
    fileTooLarge: 'حجم فایل رسید باید کمتر از ۵ مگابایت باشد.',
    fileTypeNotAllowed: 'فقط تصویر (JPEG، PNG، WebP، HEIC) یا PDF پذیرفته می‌شود.',
  },

  generic: {
    validationFailed: 'اطلاعات واردشده درست نیست.',
    unexpected: 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.',
    tooManyRequests: 'درخواست‌های زیادی فرستادید. کمی صبر کنید و دوباره تلاش کنید.',
    notFound: 'صفحه یا منبع درخواستی پیدا نشد.',
  },
} as const;
