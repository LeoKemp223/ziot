"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import {
  PaginationBar,
  type ListPagination,
} from "@/components/ui/pagination-bar";

type UserItem = {
  id: string;
  account: string;
  display_name: string;
  status: string;
  role: {
    name: string;
    code: string;
  };
  organization: {
    name: string;
  };
  created_at: string;
  last_login_at: string | null;
  registration_invitation_code: string | null;
};

type UsersResponse = {
  code: number;
  message: string;
  data?: {
    items: UserItem[];
    pagination: ListPagination;
  };
};

type UserFilters = {
  phone: string;
  invitationCode: string;
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pagination, setPagination] = useState<ListPagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<UserFilters>({
    phone: "",
    invitationCode: "",
  });
  const [draftFilters, setDraftFilters] = useState<UserFilters>({
    phone: "",
    invitationCode: "",
  });

  async function loadUsers(page = pagination.page, activeFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pagination.page_size),
      });
      if (activeFilters.phone.trim()) {
        params.set("phone", activeFilters.phone.trim());
      }
      if (activeFilters.invitationCode.trim()) {
        params.set("invitation_code", activeFilters.invitationCode.trim());
      }
      const response = await fetch(`/api/v1/users?${params.toString()}`);
      const body = (await response.json()) as UsersResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setUsers(body.data.items);
      setPagination(body.data.pagination);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers(1);
  }, []);

  function applyFilters() {
    setFilters(draftFilters);
    void loadUsers(1, draftFilters);
  }

  function clearFilters() {
    const emptyFilters = { phone: "", invitationCode: "" };
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    void loadUsers(1, emptyFilters);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">用户列表</h2>
          <p className="mt-1 text-sm text-slate-500">当前组织成员与角色</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            手机号
            <input
              className="h-8 w-40 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              inputMode="numeric"
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  phone: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="手机号"
              value={draftFilters.phone}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            邀请码
            <input
              className="h-8 w-40 rounded-md border border-slate-200 px-2 font-mono text-sm uppercase outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  invitationCode: event.target.value.toUpperCase(),
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="INVXXXXXXX"
              value={draftFilters.invitationCode}
            />
          </label>
          <button
            className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
            onClick={applyFilters}
            type="button"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
          {filters.phone ||
          filters.invitationCode ||
          draftFilters.phone ||
          draftFilters.invitationCode ? (
            <button
              aria-label="清空搜索条件"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              disabled={loading}
              onClick={clearFilters}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <button
            aria-label="刷新用户列表"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
            onClick={() => void loadUsers()}
            type="button"
          >
            <RefreshCw
              className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")}
            />
          </button>
        </div>
      </div>
      {error ? (
        <div className="p-8 text-sm text-amber-700">{error}</div>
      ) : users.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">
          {loading
            ? "正在加载用户..."
            : filters.phone || filters.invitationCode
              ? "未找到匹配用户。"
              : "暂无用户。"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">用户</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">组织</th>
                <th className="px-4 py-3">注册邀请码</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">最近登录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr
                  className="hover:bg-slate-50"
                  key={`${user.id}-${user.role.code}`}
                >
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-950">
                      {user.display_name}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-400">
                      {user.account}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <div>{user.role.name}</div>
                    <div className="mt-1 font-mono text-xs text-slate-400">
                      {user.role.code}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {user.organization.name}
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-slate-500">
                    {user.registration_invitation_code ?? "-"}
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                    {user.last_login_at
                      ? formatDateTime(user.last_login_at)
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        disabled={loading}
        onPageChange={(page) => void loadUsers(page)}
        pagination={pagination}
      />
    </section>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
