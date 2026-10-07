import type { PaginationMeta } from './response';

export interface PageParams {
  page: number;
  limit: number;
}

export interface BuildMetaParams extends PageParams {
  total: number;
}

/** A page of results plus the `meta` block the response envelope carries. */
export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Turning `?page=&limit=` into a database query and back into `meta`.
 *
 * `page` is 1-based, because that is what a person reads on screen.
 */
/** Page 3 of 20 per page skips the first 40 documents. */
export function getSkip({ page, limit }: PageParams): number {
  return (page - 1) * limit;
}

export function buildPaginationMeta({
  page,
  limit,
  total,
}: BuildMetaParams): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
