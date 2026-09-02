export type PaginationMeta = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export function clampPage(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

export function clampPageSize(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) {
    return 20;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

export function buildPagination(
  page: number,
  pageSize: number,
  total: number
): PaginationMeta {
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize))
  };
}
