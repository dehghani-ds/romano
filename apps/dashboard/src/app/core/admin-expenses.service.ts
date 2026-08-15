import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  CreateExpenseRequest,
  Expense,
  ExpensePayer,
  UpdateExpenseRequest,
} from '@romano/domain';

import { apiUrl, toUserMessage } from './api';

/**
 * The expense ledger. Admin-only in full — there is no customer-facing
 * counterpart to this service, because what Romano costs to run is nobody
 * else's business.
 */
@Injectable({ providedIn: 'root' })
export class AdminExpensesService {
  private readonly http = inject(HttpClient);

  async list(): Promise<Expense[]> {
    try {
      return await firstValueFrom(this.http.get<Expense[]>(apiUrl('/admin/expenses')));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** The admins an expense may be attributed to. */
  async payers(): Promise<ExpensePayer[]> {
    try {
      return await firstValueFrom(this.http.get<ExpensePayer[]>(apiUrl('/admin/expenses/payers')));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async create(input: CreateExpenseRequest): Promise<Expense> {
    try {
      return await firstValueFrom(this.http.post<Expense>(apiUrl('/admin/expenses'), input));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  /** A patch: send the fields that changed, and the rest are left as they are. */
  async update(id: string, patch: UpdateExpenseRequest): Promise<Expense> {
    try {
      return await firstValueFrom(
        this.http.patch<Expense>(apiUrl(`/admin/expenses/${id}`), patch),
      );
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete<void>(apiUrl(`/admin/expenses/${id}`)));
    } catch (error) {
      throw new Error(toUserMessage(error));
    }
  }
}
