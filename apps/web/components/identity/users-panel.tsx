"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

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
};

type UsersResponse = {
  code: number;
  message: string;
  data?: UserItem[];
};

export function UsersPanel() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/v1/users");
      const body = (await response.json()) as UsersResponse;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setUsers(body.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">用户列表</h2>
          <p className="mt-1 text-sm text-slate-500">当前组织成员与角色</p>
        </div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
          onClick={() => void loadUsers()}
          type="button"
        >
          <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
          刷新
        </button>
      </div>
      {error ? (
        <div className="p-8 text-sm text-amber-700">{error}</div>
      ) : users.length === 0 ? (
        <div className="p-8 text-sm text-slate-500">
          {loading ? "正在加载用户..." : "暂无用户。"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-5 py-3">用户</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">组织</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">最近登录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr className="hover:bg-slate-50" key={`${user.id}-${user.role.code}`}>
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
                  <td className="px-4 py-4">
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-slate-500">
                    {user.last_login_at ? formatDateTime(user.last_login_at) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
