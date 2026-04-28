"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";

type RoleItem = {
  id: string;
  code: string;
  name: string;
};

type InvitationItem = {
  id: string;
  role_id: string;
  role_name: string;
  max_uses: number;
  used_count: number;
  status: string;
  expires_at: string;
  created_at: string;
  code?: string;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

export function InvitationsPanel() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [createdCode, setCreatedCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [disablingId, setDisablingId] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [rolesResponse, invitationsResponse] = await Promise.all([
        fetch("/api/v1/roles"),
        fetch("/api/v1/invitations")
      ]);
      const rolesBody = (await rolesResponse.json()) as ApiResponse<RoleItem[]>;
      const invitationsBody =
        (await invitationsResponse.json()) as ApiResponse<InvitationItem[]>;

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

      setRoles(rolesBody.data);
      setInvitations(invitationsBody.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setCreatedCode("");

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role_id: String(form.get("role_id") ?? ""),
          max_uses: Number(form.get("max_uses") ?? "1")
        })
      });
      const body = (await response.json()) as ApiResponse<InvitationItem>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setCreatedCode(body.data.code ?? "");
      event.currentTarget.reset();
      await loadData();
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
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">创建邀请码</h2>
          <p className="mt-1 text-sm text-slate-500">明文邀请码只在创建后显示一次</p>
        </div>
        <form className="space-y-4 p-5" onSubmit={createInvitation}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">角色</span>
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              name="role_id"
              required
            >
              <option value="">选择角色</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">最大使用次数</span>
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
          {createdCode ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs font-medium text-emerald-700">邀请码</div>
              <div className="mt-1 break-all font-mono text-sm text-emerald-900">
                {createdCode}
              </div>
            </div>
          ) : null}
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
                  <th className="px-5 py-3">角色</th>
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
                    <td className="px-5 py-4 font-medium text-slate-950">
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
