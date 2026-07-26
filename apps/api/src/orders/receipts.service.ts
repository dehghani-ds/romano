import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MESSAGES } from '../common/messages';
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from '../common/validation';
import type { AppConfig } from '../config/configuration';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'application/pdf': '.pdf',
};

/**
 * Receipts on disk.
 *
 * Under Supabase these were objects in a private bucket whose whole
 * authorization model was "the first path segment is your user id". Guests have
 * no user id, so the key is now scoped by order instead and the *endpoint*
 * decides who may read it — see OrdersService.assertCanView.
 */
@Injectable()
export class ReceiptsService {
  private readonly root: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.root = config.get('uploadDir', { infer: true });
  }

  /** Persists the upload and returns the storage key to record on the payment. */
  async save(orderId: string, file: Express.Multer.File): Promise<string> {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'receipt_required',
        message: MESSAGES.payment.receiptRequired,
      });
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new BadRequestException({
        code: 'receipt_too_large',
        message: MESSAGES.payment.fileTooLarge,
      });
    }
    if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'receipt_type_not_allowed',
        message: MESSAGES.payment.fileTypeNotAllowed,
      });
    }

    const extension = EXTENSION_BY_MIME[file.mimetype] ?? extname(file.originalname) ?? '';
    const key = `${orderId}/${randomUUID()}${extension}`;
    const target = this.absolutePath(key);

    await mkdir(join(this.root, orderId), { recursive: true });
    await writeFile(target, file.buffer);

    return key;
  }

  openStream(key: string): NodeJS.ReadableStream {
    const path = this.absolutePath(key);
    if (!existsSync(path)) {
      throw new NotFoundException({
        code: 'receipt_missing',
        message: MESSAGES.payment.receiptMissing,
      });
    }
    return createReadStream(path);
  }

  contentTypeOf(key: string): string {
    const extension = extname(key).toLowerCase();
    const match = Object.entries(EXTENSION_BY_MIME).find(([, ext]) => ext === extension);
    return match?.[0] ?? 'application/octet-stream';
  }

  /** Best-effort cleanup when a receipt is replaced. Never fails the request. */
  async discard(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await unlink(this.absolutePath(key));
    } catch {
      // The row is the source of truth; a stale file on disk is not worth a 500.
    }
  }

  /**
   * Keys are generated here, never supplied by a caller — but resolving them
   * defensively costs nothing and closes the path-traversal door for good.
   */
  private absolutePath(key: string): string {
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(this.root + sep)) {
      throw new BadRequestException({
        code: 'receipt_invalid_path',
        message: MESSAGES.generic.validationFailed,
      });
    }
    return path;
  }
}
