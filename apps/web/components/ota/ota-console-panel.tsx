"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode
} from "react";
import { Play, Plus, RefreshCw } from "lucide-react";

type Product = {
  id: string;
  name: string;
};

type ProductList = {
  items: Product[];
};

type Firmware = {
  id: string;
  product_id: string;
  product_name: string;
  version: string;
  file_url: string;
  file_size: number;
  sha256: string;
  status: string;
  created_at: string;
};

type OtaTask = {
  id: string;
  name: string;
  product_name: string;
  firmware_version: string;
  status: string;
  created_at: string;
  record_counts: { total: number; success: number; failed: number; cancelled: number };
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

const demoSha = "0".repeat(64);

export function OtaConsolePanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [tasks, setTasks] = useState<OtaTask[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [productsResponse, firmwaresResponse, tasksResponse] = await Promise.all([
        fetch("/api/v1/products"),
        fetch("/api/v1/firmwares"),
        fetch("/api/v1/ota/tasks")
      ]);
      const productsBody = (await productsResponse.json()) as ApiResponse<ProductList>;
      const firmwaresBody = (await firmwaresResponse.json()) as ApiResponse<Firmware[]>;
      const tasksBody = (await tasksResponse.json()) as ApiResponse<OtaTask[]>;

      if (!productsResponse.ok || productsBody.code !== 0 || !productsBody.data) {
        setError(productsBody.message);
        return;
      }

      if (!firmwaresResponse.ok || firmwaresBody.code !== 0 || !firmwaresBody.data) {
        setError(firmwaresBody.message);
        return;
      }

      if (!tasksResponse.ok || tasksBody.code !== 0 || !tasksBody.data) {
        setError(tasksBody.message);
        return;
      }

      setProducts(productsBody.data.items);
      setFirmwares(firmwaresBody.data);
      setTasks(tasksBody.data);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  async function createFirmware(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/firmwares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product_id: String(form.get("product_id") ?? ""),
          version: String(form.get("version") ?? ""),
          file_url: String(form.get("file_url") ?? ""),
          file_size: Number(form.get("file_size") ?? 0),
          sha256: String(form.get("sha256") ?? ""),
          release_note: String(form.get("release_note") ?? "")
        })
      });
      const body = (await response.json()) as ApiResponse<Firmware>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      setMessage("固件已创建。");
      event.currentTarget.reset();
      await load();
    } catch {
      setError("创建固件失败。");
    }
  }

  async function updateFirmwareStatus(firmwareId: string, status: "released" | "deprecated") {
    setMessage("");
    setError("");
    const response = await fetch(`/api/v1/firmwares/${firmwareId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    const body = (await response.json()) as ApiResponse<Firmware>;

    if (!response.ok || body.code !== 0) {
      setError(body.message);
      return;
    }

    setMessage(status === "released" ? "固件已发布。" : "固件已废弃。");
    await load();
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/v1/ota/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firmware_id: String(form.get("firmware_id") ?? ""),
          name: String(form.get("name") ?? ""),
          strategy: { target_type: "all" }
        })
      });
      const body = (await response.json()) as ApiResponse<OtaTask>;

      if (!response.ok || body.code !== 0) {
        setError(body.message);
        return;
      }

      setMessage("OTA 任务已创建。");
      event.currentTarget.reset();
      await load();
    } catch {
      setError("创建 OTA 任务失败。");
    }
  }

  async function startTask(taskId: string) {
    setMessage("");
    setError("");
    const response = await fetch(`/api/v1/ota/tasks/${taskId}/start`, {
      method: "POST"
    });
    const body = (await response.json()) as ApiResponse<OtaTask>;

    if (!response.ok || body.code !== 0) {
      setError(body.message);
      return;
    }

    setMessage("OTA 任务已启动。");
    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  const defaultProductId = products[0]?.id ?? "";
  const releasedFirmwares = firmwares.filter((firmware) => firmware.status !== "deprecated");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />
          刷新
        </button>
        {message ? <span className="text-sm text-emerald-600">{message}</span> : null}
        {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">创建固件</h2>
        </div>
        <form className="grid gap-4 p-5 md:grid-cols-2" onSubmit={createFirmware}>
          <Select name="product_id" value={defaultProductId}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <Input name="version" placeholder="v1.0.1" required />
          <Input name="file_url" placeholder="https://example.com/firmware.bin" required />
          <Input name="file_size" placeholder="1024" required type="number" />
          <Input name="sha256" placeholder={demoSha} required />
          <Input name="release_note" placeholder="修复问题或新增能力" />
          <div className="md:col-span-2">
            <button className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" />
              创建固件
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">固件列表</h2>
        </div>
        <Table
          empty="暂无固件。"
          headers={["版本", "产品", "状态", "大小", "操作"]}
          rows={firmwares.map((firmware) => [
            firmware.version,
            firmware.product_name,
            firmware.status,
            `${firmware.file_size} B`,
            <div className="flex gap-2" key={firmware.id}>
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                onClick={() => void updateFirmwareStatus(firmware.id, "released")}
                type="button"
              >
                发布
              </button>
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                onClick={() => void updateFirmwareStatus(firmware.id, "deprecated")}
                type="button"
              >
                废弃
              </button>
            </div>
          ])}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">创建 OTA 任务</h2>
        </div>
        <form className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_auto]" onSubmit={createTask}>
          <Input name="name" placeholder="演示升级任务" required />
          <Select name="firmware_id" value={releasedFirmwares[0]?.id ?? ""}>
            {releasedFirmwares.map((firmware) => (
              <option key={firmware.id} value={firmware.id}>
                {firmware.product_name} / {firmware.version}
              </option>
            ))}
          </Select>
          <button className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" />
            创建任务
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">OTA 任务</h2>
        </div>
        <Table
          empty="暂无 OTA 任务。"
          headers={["任务", "产品", "固件", "状态", "进度", "操作"]}
          rows={tasks.map((task) => [
            <a className="font-medium text-blue-600" href={`/ota/tasks/${task.id}`} key={task.id}>
              {task.name}
            </a>,
            task.product_name,
            task.firmware_version,
            task.status,
            `${task.record_counts.success}/${task.record_counts.total} 成功`,
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
              key={task.id}
              onClick={() => void startTask(task.id)}
              type="button"
            >
              <Play className="h-3 w-3" />
              启动
            </button>
          ])}
        />
      </section>
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      {...props}
    />
  );
}

function Select({
  children,
  name,
  value
}: {
  children: ReactNode;
  name: string;
  value: string;
}) {
  return (
    <select
      className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      defaultValue={value}
      name={name}
    >
      {children}
    </select>
  );
}

function Table({
  empty,
  headers,
  rows
}: {
  empty: string;
  headers: string[];
  rows: ReactNode[][];
}) {
  if (rows.length === 0) {
    return <div className="p-8 text-sm text-slate-500">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            {headers.map((header) => (
              <th className="px-5 py-3" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr className="hover:bg-slate-50" key={index}>
              {row.map((cell, cellIndex) => (
                <td className="px-5 py-4" key={cellIndex}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
