import type { Response } from 'express';
import { any } from 'zod/v4';

/** Attached to paginated lists only. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SuccessResponseParams<T> {
  res: Response;
  data?: T;
  message?: string;
  meta?: PaginationMeta;
  statusCode?: number;
}

export class ResponseUtils {
  /**
   * A 200 (or any 2xx passed via `statusCode`).
   *
   * @param {SuccessResponseParams<T>} params
   * @param {Response} params.res - The Express response.
   * @param {T} [params.data] - The payload.
   * @param {string} [params.message] - Human-readable summary.
   * @param {PaginationMeta} [params.meta] - Pagination, for lists only.
   * @param {number} [params.statusCode] - Defaults to 200.
   */
  static success<T = any>({
    res,
    data,
    message = 'Request successful',
    meta,
    statusCode = 200,
  }: SuccessResponseParams<T>): void {
    res.status(statusCode).json({
      success: true,
      message,
      data: data ?? null,
      ...(meta ? { meta } : {}),
    });
  }

  /** A 201, for requests that created something. */
  static created<T = any>({
    res,
    data,
    message = 'Created successfully',
  }: Omit<SuccessResponseParams<T>, 'statusCode' | 'meta'>): void {
    ResponseUtils.success({ res, data, message, statusCode: 201 });
  }

  /** A 204. No envelope — a 204 cannot carry a body. */
  static noContent({ res }: Pick<SuccessResponseParams<never>, 'res'>): void {
    res.status(204).end();
  }
}
