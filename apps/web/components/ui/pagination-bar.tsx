"use client";

export type ListPagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export function PaginationBar({
  disabled,
  onPageChange,
  pagination
}: {
  disabled: boolean;
  onPageChange: (page: number) => void;
  pagination: ListPagination;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4">
      <div className="text-sm text-slate-500">
        第 {pagination.page} / {pagination.total_pages} 页，共{" "}
        {pagination.total} 条
      </div>
      <div className="flex items-center gap-2">
        <button
          className="h-8 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          disabled={disabled || pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
          type="button"
        >
          上一页
        </button>
        <button
          className="h-8 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          disabled={disabled || pagination.page >= pagination.total_pages}
          onClick={() => onPageChange(pagination.page + 1)}
          type="button"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
