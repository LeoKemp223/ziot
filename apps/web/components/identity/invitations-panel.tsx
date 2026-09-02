"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, RefreshCw, X } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { PaginationBar, type ListPagination } from "@/components/ui/pagination-bar";

type RoleItem = {
  id: string;
  code: string;
  name: string;
};

type InvitationItem = {
  id: string;
  code: string | null;
  role_id: string;
  role_name: string;
  max_uses: number;
  used_count: number;
  status: string;
  expires_at: string;
  created_at: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export function InvitationsPanel() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [pagination, setPagination] = useState<ListPagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [codesCopied, setCodesCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [disablingId, setDisablingId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState("");

  async function copyCreatedCodes() {
    const copied = await copyTextToClipboard(createdCodes.join("\n"));

    setCodesCopied(copied);
    if (copied) {
      window.setTimeout(() => setCodesCopied(false), 2000);
    }
  }

  async function loadData(page = pagination.page) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pagination.page_size)
      });
      const [rolesResponse, invitationsResponse] = await Promise.all([
        fetch("/api/v1/roles"),
        fetch(`/api/v1/invitations?${params.toString()}`)
      ]);
      const rolesBody = (await rolesResponse.json()) as ApiResponse<RoleItem[]>;
      const invitationsBody = (await invitationsResponse.json()) as ApiResponse<{
        items: InvitationItem[];
        pagination: ListPagination;
      }>;

      if (!rolesResponse.ok || rolesBody.code !== 0 || !rolesBody.data) {
        setError(rolesBody.message);
        return;
      }

      if (
        !invitationsResponse.ok ||
        invitationsBody.code !== 0 ||
        !invitationsBody.data
      ) {
        setError(invitationsBody.message);
        return;
      }

      const loadedRoles = rolesBody.data;
      setRoles(loadedRoles);
      // 默认选中普通用户(org_member),创建邀请码最常用
      setRoleId((current) => {
        if (current) {
          return current;
        }
        const memberRole = loadedRoles.find((role) => role.code === "org_member");
        return memberRole?.id ?? loadedRoles[0]?.id ?? "";
      });
      setInvitations(invitationsBody.data.items);
      setPagination(invitationsBody.data.pagination);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    setCreatedCodes([]);
    setCodesCopied(false);

    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role_id: String(form.get("role_id") ?? ""),
          count: Number(form.get("count") ?? "1"),
          max_uses: Number(form.get("max_uses") ?? "1")
        })
      });
      const body = (await response.json()) as ApiResponse<InvitationItem[]>;

      if (!response.ok || body.code !== 0 || !Array.isArray(body.data)) {
        setError(body.message);
        return;
      }

      setCreatedCodes(
        body.data
          .map((invitation) => invitation.code)
          .filter((code): code is string => Boolean(code))
      );
      formElement.reset();
      await loadData(1);
    } catch {
      setError("创建邀请码失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function disableInvitation(invitation: InvitationItem) {
    setDisablingId(invitation.id);
    setError("");

    try {
      const response = await fetch(`/api/v1/invitations/${invitation.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "disabled" })
      });
      const body = (await response.json()) as ApiResponse<InvitationItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setInvitations((current) =>
        current.map((item) => (item.id === body.data?.id ? body.data : item))
      );
    } catch {
      setError("禁用邀请码失败，请稍后重试。");
    } finally {
      setDisablingId("");
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      {createdCodes.length > 0 ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  邀请码已创建
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  共创建 {createdCodes.length} 个邀请码，可一键复制分发。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setCreatedCodes([])}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-emerald-200 bg-emerald-50 p-3">
                {createdCodes.map((code) => (
                  <div
                    className="break-all font-mono text-sm text-emerald-900"
                    key={code}
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => void copyCreatedCodes()}
                type="button"
              >
                <Copy className="h-4 w-4" />
                {codesCopied ? "已复制" : "复制全部"}
              </button>
              <button
                className="inline-flex h-10 items-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
                onClick={() => setCreatedCodes([])}
                type="button"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">创建邀请码</h2>
          <p className="mt-1 text-sm text-slate-500">
            可一次创建多个邀请码，创建后弹窗展示并支持复制
          </p>
        </div>
        <form className="space-y-4 p-5" onSubmit={createInvitation}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">角色</span>
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              name="role_id"
              onChange={(event) => setRoleId(event.currentTarget.value)}
              required
              value={roleId}
            >
              <option value="">选择角色</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">创建数量</span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                defaultValue={1}
                max={100}
                min={1}
                name="count"
                required
                type="number"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                每个最大使用次数
              </span>
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                defaultValue={1}
                max={100}
                min={1}
                name="max_uses"
                required
                type="number"
              />
            </label>
          </div>
          {error ? <div className="text-sm text-rose-600">{error}</div> : null}
          <button
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending || loading}
            type="submit"
          >
            {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
            创建
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">邀请码列表</h2>
            <p className="mt-1 text-sm text-slate-500">当前组织的邀请记录</p>
          </div>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
            onClick={() => void loadData()}
            type="button"
          >
            <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
            刷新
          </button>
        </div>
        {invitations.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">
            {loading ? "正在加载邀请码..." : "暂无邀请码。"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">邀请码</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3">使用量</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">过期时间</th>
                  <th className="px-4 py-3">创建时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invitations.map((invitation) => (
                  <tr className="hover:bg-slate-50" key={invitation.id}>
                    <td className="px-5 py-4 font-mono text-sm text-slate-900">
                      {invitation.code ? (
                        <span className="rounded-md bg-slate-100 px-2 py-1 uppercase">
                          {invitation.code}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-950">
                      {invitation.role_name}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {invitation.used_count} / {invitation.max_uses}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                        {invitation.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(invitation.expires_at)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(invitation.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        className="inline-flex h-8 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          invitation.status !== "active" ||
                          disablingId === invitation.id
                        }
                        onClick={() => void disableInvitation(invitation)}
                        type="button"
                      >
                        {disablingId === invitation.id ? "处理中" : "禁用"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          disabled={loading}
          onPageChange={(page) => void loadData(page)}
          pagination={pagination}
        />
      </section>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
