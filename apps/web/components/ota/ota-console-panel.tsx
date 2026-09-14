"use client";

import {
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode
} from "react";
import { Play, Plus, RefreshCw, Search, Square, Trash2, X } from "lucide-react";
import { usePermissions } from "@/components/console/use-permissions";
import { PaginationBar, type ListPagination } from "@/components/ui/pagination-bar";
import { FirmwareStatusBadge, TaskStatusBadge } from "@/components/ota/ota-status";

type Product = {
  id: string;
  name: string;
  device_count: number;
};

type ProductList = {
  items: Product[];
};

type Firmware = {
  id: string;
  product_id: string;
  product_name: string;
  version: string;
  base_version?: string | null;
  target_sha256?: string | null;
  patch_format?: string | null;
  file_url: string;
  // 对象存储固件的短时效预签名直链;遗留/外部固件为 null,回退 file_url
  download_url?: string | null;
  file_size: number;
  sha256: string;
  status: string;
  created_at: string;
};

type TargetStrategy = {
  target_type?: "all" | "devices" | "group";
  device_ids?: string[];
  group_id?: string;
};

type OtaTask = {
  id: string;
  name: string;
  product_name: string;
  firmware_version: string;
  status: string;
  created_at: string;
  strategy: TargetStrategy;
  record_counts: { total: number; success: number; failed: number; cancelled: number };
};

// 任务弹窗里供勾选的设备(按固件产品过滤,接口分页上限 100)
type ModalDevice = {
  id: string;
  name: string;
  device_key: string;
  online_status: string;
};

function taskScopeLabel(strategy: TargetStrategy) {
  if (strategy?.target_type === "devices") {
    return `指定 ${strategy.device_ids?.length ?? 0} 台设备`;
  }
  if (strategy?.target_type === "group") {
    return "按设备分组";
  }
  return "全部设备";
}

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

type PaginatedList<T> = {
  items: T[];
  pagination: ListPagination;
};

export function OtaConsolePanel() {
  const { isLoaded, hasPermission } = usePermissions();
  const canWriteOta = isLoaded && hasPermission("ota:write");
  const canExecuteOta = isLoaded && hasPermission("ota:execute");
  const [products, setProducts] = useState<Product[]>([]);
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [allFirmwares, setAllFirmwares] = useState<Firmware[]>([]);
  const [firmwarePagination, setFirmwarePagination] = useState<ListPagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [tasks, setTasks] = useState<OtaTask[]>([]);
  const [taskPagination, setTaskPagination] = useState<ListPagination>({
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 1
  });
  const [lastUploadedFirmware, setLastUploadedFirmware] = useState<Firmware | null>(null);
  const [taskName, setTaskName] = useState("");
  const [selectedFirmwareId, setSelectedFirmwareId] = useState("");
  const [targetType, setTargetType] = useState<"all" | "devices">("all");
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [modalDevices, setModalDevices] = useState<ModalDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceKeyword, setDeviceKeyword] = useState("");
  const [firmwareModalOpen, setFirmwareModalOpen] = useState(false);
  const [firmwareFileName, setFirmwareFileName] = useState("");
  const [deltaModalOpen, setDeltaModalOpen] = useState(false);
  const [deltaBaseFileName, setDeltaBaseFileName] = useState("");
  const [deltaTargetFileName, setDeltaTargetFileName] = useState("");
  const [deltaPending, setDeltaPending] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [firmwarePending, setFirmwarePending] = useState(false);
  const [deletingFirmware, setDeletingFirmware] = useState<Firmware | null>(null);
  const [deletingTask, setDeletingTask] = useState<OtaTask | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [blockingTasks, setBlockingTasks] = useState<OtaTask[] | null>(null);
  const [blockActionId, setBlockActionId] = useState("");
  const [taskPending, setTaskPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load(
    firmwarePage = firmwarePagination.page,
    taskPage = taskPagination.page,
    silent = false
  ) {
    // 轮询走 silent,不闪 loading 态(禁用分页/转圈)
    if (!silent) {
      setLoading(true);
    }
    setError("");

    try {
      const firmwareParams = new URLSearchParams({
        page: String(firmwarePage),
        page_size: String(firmwarePagination.page_size)
      });
      const taskParams = new URLSearchParams({
        page: String(taskPage),
        page_size: String(taskPagination.page_size)
      });
      const [productsResponse, allFirmwaresResponse, firmwaresResponse, tasksResponse] =
        await Promise.all([
          fetch("/api/v1/products?page_size=100", { cache: "no-store" }),
          // 创建任务下拉需要全部固件,单独拉一页大列表
          fetch("/api/v1/firmwares?page_size=100", { cache: "no-store" }),
          fetch(`/api/v1/firmwares?${firmwareParams.toString()}`, {
            cache: "no-store"
          }),
          fetch(`/api/v1/ota/tasks?${taskParams.toString()}`, { cache: "no-store" })
        ]);
      const productsBody = (await productsResponse.json()) as ApiResponse<ProductList>;
      const allFirmwaresBody = (await allFirmwaresResponse.json()) as ApiResponse<
        PaginatedList<Firmware>
      >;
      const firmwaresBody = (await firmwaresResponse.json()) as ApiResponse<
        PaginatedList<Firmware>
      >;
      const tasksBody = (await tasksResponse.json()) as ApiResponse<
        PaginatedList<OtaTask>
      >;

      if (!productsResponse.ok || productsBody.code !== 0 || !productsBody.data) {
        setError(productsBody.message);
        return;
      }

      if (
        !allFirmwaresResponse.ok ||
        allFirmwaresBody.code !== 0 ||
        !allFirmwaresBody.data
      ) {
        setError(allFirmwaresBody.message);
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
      setAllFirmwares(allFirmwaresBody.data.items);
      setFirmwares(firmwaresBody.data.items);
      setFirmwarePagination(firmwaresBody.data.pagination);
      setTasks(tasksBody.data.items);
      setTaskPagination(tasksBody.data.pagination);
    } catch {
      setError("请求失败，请确认 Web 服务状态。");
    } finally {
      setLoading(false);
    }
  }

  // 选定固件后按其产品拉取可选设备;固件变化时清空已勾选(设备归属可能换了产品)。
  // 依赖解析出的 product_id 而非固件列表引用,避免列表刷新(引用变化)清掉用户勾选
  const selectedProductId =
    allFirmwares.find((item) => item.id === selectedFirmwareId)?.product_id ?? "";

  useEffect(() => {
    setSelectedDeviceIds([]);
    setModalDevices([]);
    setDeviceKeyword("");

    if (!selectedFirmwareId || !selectedProductId) {
      return;
    }

    let cancelled = false;
    setDevicesLoading(true);
    fetch(`/api/v1/devices?product_id=${encodeURIComponent(selectedProductId)}&page_size=100`)
      .then(async (response) => {
        const body = (await response.json()) as ApiResponse<PaginatedList<ModalDevice>>;
        if (!cancelled && body.code === 0 && body.data) {
          setModalDevices(body.data.items);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setDevicesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFirmwareId, selectedProductId]);

  async function createFirmware(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("请选择固件文件。");
      return;
    }

    setFirmwarePending(true);

    try {
      const response = await fetch("/api/v1/firmwares/upload", {
        method: "POST",
        body: form
      });
      const body = (await response.json()) as ApiResponse<Firmware>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      const uploaded = body.data;
      formElement.reset();
      setFirmwareFileName("");
      setLastUploadedFirmware(uploaded);
      // 立即并入固件列表,任务弹窗下拉马上能选中,不等列表刷新
      setAllFirmwares((current) => [
        uploaded,
        ...current.filter((item) => item.id !== uploaded.id)
      ]);
      // 上传后自动衔接:预填升级任务并打开创建任务弹窗
      setSelectedFirmwareId(body.data.id);
      setTaskName(`${body.data.product_name} ${body.data.version} 升级`);
      setFirmwareModalOpen(false);
      setTaskModalOpen(true);
      setMessage("固件已上传，已为你预填升级任务，确认后点击“创建任务”。");
      await load(1);
    } catch {
      setError("上传固件失败。");
    } finally {
      setFirmwarePending(false);
    }
  }

  async function createDeltaFirmware(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const baseFile = form.get("file_base");
    const targetFile = form.get("file_target");

    if (
      !(baseFile instanceof File) ||
      baseFile.size === 0 ||
      !(targetFile instanceof File) ||
      targetFile.size === 0
    ) {
      setError("请选择基线与目标固件文件。");
      return;
    }

    setDeltaPending(true);

    try {
      const response = await fetch("/api/v1/firmwares/delta", {
        method: "POST",
        body: form
      });
      const body = (await response.json()) as ApiResponse<Firmware>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      const uploaded = body.data;
      formElement.reset();
      setDeltaBaseFileName("");
      setDeltaTargetFileName("");
      setLastUploadedFirmware(uploaded);
      setAllFirmwares((current) => [
        uploaded,
        ...current.filter((item) => item.id !== uploaded.id)
      ]);
      setSelectedFirmwareId(body.data.id);
      setTaskName(`${body.data.product_name} ${body.data.version} 升级`);
      setDeltaModalOpen(false);
      setTaskModalOpen(true);
      setMessage("差分固件已生成，已为你预填升级任务，确认后点击“创建任务”。");
      await load(1);
    } catch {
      setError("生成差分固件失败。");
    } finally {
      setDeltaPending(false);
    }
  }

  async function loadBlockingTasks(firmwareId: string) {
    try {
      const response = await fetch(
        `/api/v1/ota/tasks?firmware_id=${firmwareId}&page_size=100`,
        { cache: "no-store" }
      );
      const body = (await response.json()) as ApiResponse<PaginatedList<OtaTask>>;

      if (body.code === 0 && body.data) {
        setBlockingTasks(body.data.items);
      }
    } catch {
      setBlockingTasks([]);
    }
  }

  async function deleteFirmware(firmwareId: string) {
    setDeletePending(true);
    setDeleteError("");
    const response = await fetch(`/api/v1/firmwares/${firmwareId}`, {
      method: "DELETE"
    });
    const body = (await response.json()) as ApiResponse<{ id: string }>;

    if (!response.ok || body.code !== 0) {
      setDeleteError(body.message);
      // 被任务引用时不关弹窗,列出引用任务供用户就地删除
      if (body.message.includes("请先删除相关任务")) {
        await loadBlockingTasks(firmwareId);
      }
    } else {
      setMessage("固件已删除。");
      setDeletingFirmware(null);
      setBlockingTasks(null);
      // 删掉当前页最后一条时回退上一页,避免停留在空页
      const nextPage =
        firmwares.length === 1 && firmwarePagination.page > 1
          ? firmwarePagination.page - 1
          : firmwarePagination.page;
      await load(nextPage);
    }

    setDeletePending(false);
  }

  async function blockingTaskAction(task: OtaTask, action: "cancel" | "delete") {
    if (!deletingFirmware) {
      return;
    }

    setBlockActionId(task.id);
    setDeleteError("");
    const response = await fetch(
      action === "delete"
        ? `/api/v1/ota/tasks/${task.id}`
        : `/api/v1/ota/tasks/${task.id}/cancel`,
      { method: action === "delete" ? "DELETE" : "POST" }
    );
    const body = (await response.json()) as ApiResponse<{ id: string }>;

    if (!response.ok || body.code !== 0) {
      setDeleteError(body.message);
    } else {
      await Promise.all([
        loadBlockingTasks(deletingFirmware.id),
        load()
      ]);
    }

    setBlockActionId("");
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTaskPending(true);
    setMessage("");
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    if (targetType === "devices" && selectedDeviceIds.length === 0) {
      setError("请至少勾选一台目标设备。");
      return;
    }

    try {
      const response = await fetch("/api/v1/ota/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firmware_id: String(form.get("firmware_id") ?? ""),
          name: String(form.get("name") ?? ""),
          strategy:
            targetType === "devices"
              ? { target_type: "devices", device_ids: selectedDeviceIds }
              : { target_type: "all" }
        })
      });
      const body = (await response.json()) as ApiResponse<OtaTask>;

      if (!response.ok || body.code !== 0 || !body.data) {
        setError(body.message);
        return;
      }

      setMessage("OTA 任务已创建，请在下方任务列表点击“启动”开始推送。");
      formElement.reset();
      setTaskName("");
      setSelectedFirmwareId("");
      setTargetType("all");
      setDeviceKeyword("");
      setTaskModalOpen(false);
      await load(undefined, 1);
    } catch {
      setError("创建 OTA 任务失败。");
    } finally {
      setTaskPending(false);
    }
  }

  async function deleteTask(taskId: string) {
    setDeletePending(true);
    setMessage("");
    setError("");
    const response = await fetch(`/api/v1/ota/tasks/${taskId}`, {
      method: "DELETE"
    });
    const body = (await response.json()) as ApiResponse<{ id: string }>;

    if (!response.ok || body.code !== 0) {
      setError(body.message);
    } else {
      setMessage("OTA 任务已删除。");
      // 删掉当前页最后一条时回退上一页,避免停留在空页
      const nextPage =
        tasks.length === 1 && taskPagination.page > 1
          ? taskPagination.page - 1
          : taskPagination.page;
      await load(undefined, nextPage);
    }

    setDeletePending(false);
    setDeletingTask(null);
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

  async function cancelTask(taskId: string) {
    setMessage("");
    setError("");
    const response = await fetch(`/api/v1/ota/tasks/${taskId}/cancel`, {
      method: "POST"
    });
    const body = (await response.json()) as ApiResponse<OtaTask>;

    if (!response.ok || body.code !== 0) {
      setError(body.message);
      return;
    }

    setMessage("OTA 任务已取消，未完成的设备记录已一并取消。");
    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  // 存在进行中的任务时每 5s 静默轮询(任务进度列实时更新);无进行中任务则停
  const hasActiveTask = tasks.some(
    (task) => !["finished", "cancelled"].includes(task.status)
  );

  useEffect(() => {
    if (!hasActiveTask) {
      return;
    }

    const timer = window.setInterval(() => {
      void load(undefined, undefined, true);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [hasActiveTask, firmwarePagination.page, taskPagination.page]);

  // 默认选有设备的产品,避免上传后建任务才发现"目标设备为空"
  const defaultProductId =
    products.find((product) => product.device_count > 0)?.id ?? products[0]?.id ?? "";
  const releasedFirmwares = allFirmwares.filter(
    (firmware) => firmware.status !== "deprecated"
  );
  // 设备搜索:按名称/device_key 前端过滤当前已加载的列表
  const deviceKeywordLower = deviceKeyword.trim().toLowerCase();
  const filteredDevices = deviceKeywordLower
    ? modalDevices.filter(
        (device) =>
          device.name.toLowerCase().includes(deviceKeywordLower) ||
          device.device_key.toLowerCase().includes(deviceKeywordLower)
      )
    : modalDevices;
  const allFilteredSelected =
    filteredDevices.length > 0 &&
    filteredDevices.every((device) => selectedDeviceIds.includes(device.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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
        {canWriteOta ? (
          <div className="ml-auto flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setMessage("");
                setError("");
                setFirmwareFileName("");
                setFirmwareModalOpen(true);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              创建固件
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setMessage("");
                setError("");
                setDeltaBaseFileName("");
                setDeltaTargetFileName("");
                setDeltaModalOpen(true);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              差分固件
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
              onClick={() => {
                setMessage("");
                setError("");
                setTaskModalOpen(true);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              创建任务
            </button>
          </div>
        ) : null}
      </div>

      {lastUploadedFirmware ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 shadow-sm">
          <div className="border-b border-emerald-200 px-5 py-4">
            <h2 className="text-base font-semibold text-emerald-950">最近上传结果</h2>
          </div>
          <dl className="grid gap-3 p-5 text-sm md:grid-cols-[120px_1fr]">
            <dt className="font-medium text-emerald-900">文件大小</dt>
            <dd className="font-mono text-emerald-950">{lastUploadedFirmware.file_size} B</dd>
            <dt className="font-medium text-emerald-900">SHA256 校验</dt>
            <dd className="break-all font-mono text-xs text-emerald-950">
              {lastUploadedFirmware.sha256}
            </dd>
            <dt className="font-medium text-emerald-900">下载地址</dt>
            <dd>
              <a
                className="break-all font-mono text-xs text-blue-700 hover:underline"
                href={lastUploadedFirmware.download_url || lastUploadedFirmware.file_url}
                rel="noreferrer"
                target="_blank"
              >
                {lastUploadedFirmware.download_url || lastUploadedFirmware.file_url}
              </a>
            </dd>
          </dl>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">固件列表</h2>
        </div>
        <Table
          empty="暂无固件。"
          headers={["版本", "产品", "状态", "文件大小", "SHA256", "下载地址", "操作"]}
          rows={firmwares.map((firmware) => [
            firmware.base_version ? (
              <span className="inline-flex items-center gap-1.5" key={firmware.id}>
                <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                  差分
                </span>
                <span className="font-medium">
                  {firmware.base_version} → {firmware.version}
                </span>
              </span>
            ) : (
              firmware.version
            ),
            firmware.product_name,
            <FirmwareStatusBadge key={firmware.id} value={firmware.status} />,
            `${firmware.file_size} B`,
            <span
              className="block max-w-[140px] truncate font-mono text-xs"
              key="sha256"
              title={firmware.sha256}
            >
              {firmware.sha256}
            </span>,
            <a
              className="block max-w-[220px] truncate font-mono text-xs text-blue-600 hover:underline"
              href={firmware.download_url || firmware.file_url}
              key="url"
              rel="noreferrer"
              target="_blank"
              title={firmware.download_url || firmware.file_url}
            >
              {firmware.download_url || firmware.file_url}
            </a>,
            canWriteOta ? (
              <button
                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                key={firmware.id}
                onClick={() => {
                  setMessage("");
                  setError("");
                  setDeleteError("");
                  setBlockingTasks(null);
                  setDeletingFirmware(firmware);
                }}
                type="button"
              >
                <Trash2 className="h-3 w-3" />
                删除
              </button>
            ) : (
              "-"
            )
          ])}
        />
        <PaginationBar
          disabled={loading}
          onPageChange={(page) => void load(page)}
          pagination={firmwarePagination}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">OTA 任务</h2>
        </div>
        <Table
          empty="暂无 OTA 任务。"
          headers={["任务", "产品", "固件", "状态", "进度", "操作"]}
          rows={tasks.map((task) => [
            <div className="space-y-0.5" key={task.id}>
              <a className="font-medium text-blue-600" href={`/ota/tasks/${task.id}`}>
                {task.name}
              </a>
              <div className="text-xs text-slate-400">{taskScopeLabel(task.strategy)}</div>
            </div>,
            task.product_name,
            task.firmware_version,
            <TaskStatusBadge key={task.id} value={task.status} />,
            `${task.record_counts.success}/${task.record_counts.total} 成功`,
            !["finished", "cancelled"].includes(task.status) ? (
              canExecuteOta ? (
                <div className="flex justify-end gap-2" key={task.id}>
                  {["created", "scheduled"].includes(task.status) ? (
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => void startTask(task.id)}
                      type="button"
                    >
                      <Play className="h-3 w-3" />
                      启动
                    </button>
                  ) : null}
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    onClick={() => void cancelTask(task.id)}
                    type="button"
                  >
                    <Square className="h-3 w-3" />
                    取消
                  </button>
                </div>
              ) : (
                "-"
              )
            ) : canExecuteOta || canWriteOta ? (
              <div className="flex justify-end gap-2" key={task.id}>
                {canExecuteOta && task.record_counts.success < task.record_counts.total ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => void startTask(task.id)}
                    type="button"
                  >
                    <Play className="h-3 w-3" />
                    重新启动
                  </button>
                ) : null}
                {canWriteOta ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      setMessage("");
                      setError("");
                      setDeletingTask(task);
                    }}
                    type="button"
                  >
                    <Trash2 className="h-3 w-3" />
                    删除
                  </button>
                ) : null}
              </div>
            ) : (
              "-"
            )
          ])}
        />
        <PaginationBar
          disabled={loading}
          onPageChange={(page) => void load(undefined, page)}
          pagination={taskPagination}
        />
      </section>

      {firmwareModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-xl rounded-lg bg-white shadow-xl"
            onSubmit={createFirmware}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">创建固件</h2>
                <p className="mt-1 text-sm text-slate-500">
                  固件上传后即为已发布状态，单文件不超过 5MB，每个用户最多保留 10 个（删除可释放名额）。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setFirmwareModalOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">所属产品</span>
                <Select name="product_id" value={defaultProductId}>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">版本号</span>
                <Input name="version" placeholder="v1.0.1" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">固件文件</span>
                <span className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm hover:border-blue-300">
                  <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white">
                    选择文件
                  </span>
                  <span className="truncate text-slate-500">
                    {firmwareFileName || "未选择文件"}
                  </span>
                  <input
                    accept=".bin,.hex,.img,.ota,.uf2,.zip,.tar,.gz,application/octet-stream"
                    className="hidden"
                    name="file"
                    onChange={(event) =>
                      setFirmwareFileName(event.currentTarget.files?.[0]?.name ?? "")
                    }
                    type="file"
                  />
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  发布说明(可选)
                </span>
                <textarea
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  name="release_note"
                  placeholder="修复问题或新增能力"
                  rows={3}
                />
              </label>
              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setFirmwareModalOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={firmwarePending}
                type="submit"
              >
                {firmwarePending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                上传并创建
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deltaModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-xl rounded-lg bg-white shadow-xl"
            onSubmit={createDeltaFirmware}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">创建差分固件</h2>
                <p className="mt-1 text-sm text-slate-500">
                  上传两个 .bin 裸二进制固件，平台自动生成 bsdiff+heatshrink
                  差分补丁，原文件不保留，单文件不超过 5MB，目标版本需不同于基线版本。差分包需设备端支持对应解补丁能力。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setDeltaModalOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">所属产品</span>
                <Select name="product_id" value={defaultProductId}>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    基线版本（V1）
                  </span>
                  <Input name="base_version" placeholder="v1.0.0" required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    目标版本（V2）
                  </span>
                  <Input name="version" placeholder="v1.0.1" required />
                </label>
              </div>
              {[
                {
                  label: "基线固件文件（V1.bin）",
                  name: "file_base",
                  fileName: deltaBaseFileName,
                  setFileName: setDeltaBaseFileName
                },
                {
                  label: "目标固件文件（V2.bin）",
                  name: "file_target",
                  fileName: deltaTargetFileName,
                  setFileName: setDeltaTargetFileName
                }
              ].map((field) => (
                <label className="block" key={field.name}>
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {field.label}
                  </span>
                  <span className="flex h-10 w-full cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 text-sm hover:border-blue-300">
                    <span className="inline-flex h-7 shrink-0 items-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white">
                      选择文件
                    </span>
                    <span className="truncate text-slate-500">
                      {field.fileName || "未选择文件"}
                    </span>
                    <input
                      accept=".bin"
                      className="hidden"
                      name={field.name}
                      onChange={(event) =>
                        field.setFileName(event.currentTarget.files?.[0]?.name ?? "")
                      }
                      type="file"
                    />
                  </span>
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  发布说明(可选)
                </span>
                <textarea
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  name="release_note"
                  placeholder="修复问题或新增能力"
                  rows={3}
                />
              </label>
              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setDeltaModalOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deltaPending}
                type="submit"
              >
                {deltaPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                生成并创建
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deletingFirmware ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">删除固件</h2>
                <p className="mt-1 text-sm text-slate-500">
                  删除后将同时清理已上传的固件文件，该操作不可恢复。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => {
                  setDeletingFirmware(null);
                  setBlockingTasks(null);
                }}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-950">
                  {deletingFirmware.product_name} / {deletingFirmware.version}
                </div>
                <div className="mt-1 truncate font-mono text-xs text-slate-400">
                  {deletingFirmware.sha256}
                </div>
              </div>
              {deleteError ? (
                <div className="mt-3 text-sm text-rose-600">{deleteError}</div>
              ) : null}
              {blockingTasks !== null && blockingTasks.length > 0 ? (
                <div className="mt-3">
                  <div className="text-sm font-medium text-slate-700">
                    引用该固件的任务（删除全部任务后即可删除固件）
                  </div>
                  <div className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200">
                    {blockingTasks.map((task) => (
                      <div
                        className="flex items-center justify-between gap-3 px-3 py-2"
                        key={task.id}
                      >
                        <div className="min-w-0">
                          <a
                            className="block truncate text-sm font-medium text-blue-600 hover:underline"
                            href={`/ota/tasks/${task.id}`}
                          >
                            {task.name}
                          </a>
                          <div className="text-xs text-slate-400">
                            {task.product_name} / {task.firmware_version} ·{" "}
                            {task.record_counts.total} 条设备记录
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <TaskStatusBadge value={task.status} />
                          {["finished", "cancelled"].includes(task.status) ? (
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-rose-200 px-2 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={blockActionId !== ""}
                              onClick={() =>
                                void blockingTaskAction(task, "delete")
                              }
                              type="button"
                            >
                              <Trash2 className="h-3 w-3" />
                              {blockActionId === task.id ? "删除中" : "删除"}
                            </button>
                          ) : (
                            <button
                              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={blockActionId !== ""}
                              onClick={() =>
                                void blockingTaskAction(task, "cancel")
                              }
                              type="button"
                            >
                              <Square className="h-3 w-3" />
                              {blockActionId === task.id ? "取消中" : "先取消"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setDeletingFirmware(null);
                  setBlockingTasks(null);
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deletePending}
                onClick={() => void deleteFirmware(deletingFirmware.id)}
                type="button"
              >
                {deletePending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {blockingTasks !== null && blockingTasks.length > 0
                  ? "重试删除固件"
                  : "删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletingTask ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">删除 OTA 任务</h2>
                <p className="mt-1 text-sm text-slate-500">
                  任务的设备升级进度记录将一并删除，该操作不可恢复。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setDeletingTask(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-950">{deletingTask.name}</div>
                <div className="mt-1 text-slate-500">
                  {deletingTask.product_name} / {deletingTask.firmware_version} · 共{" "}
                  {deletingTask.record_counts.total} 条设备记录
                </div>
              </div>
              {error ? (
                <div className="mt-3 text-sm text-rose-600">{error}</div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setDeletingTask(null)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deletePending}
                onClick={() => void deleteTask(deletingTask.id)}
                type="button"
              >
                {deletePending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {taskModalOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4"
          role="dialog"
        >
          <form
            className="w-full max-w-xl rounded-lg bg-white shadow-xl"
            onSubmit={createTask}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">创建 OTA 任务</h2>
                <p className="mt-1 text-sm text-slate-500">
                  选择固件创建升级任务，创建后需手动启动。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setTaskModalOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">任务名称</span>
                <Input
                  name="name"
                  onChange={(event) => setTaskName(event.currentTarget.value)}
                  placeholder="演示升级任务"
                  required
                  value={taskName}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">升级固件</span>
                <select
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  name="firmware_id"
                  onChange={(event) => setSelectedFirmwareId(event.currentTarget.value)}
                  required
                  value={selectedFirmwareId}
                >
                  <option value="">选择固件</option>
                  {releasedFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmware.product_name} / {firmware.version}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="block">
                <legend className="mb-1 block text-sm font-medium text-slate-700">目标范围</legend>
                <div className="flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={targetType === "all"}
                      name="target_type"
                      onChange={() => setTargetType("all")}
                      type="radio"
                      value="all"
                    />
                    全部设备
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      checked={targetType === "devices"}
                      name="target_type"
                      onChange={() => setTargetType("devices")}
                      type="radio"
                      value="devices"
                    />
                    指定设备
                  </label>
                </div>
              </fieldset>
              {targetType === "devices" ? (
                <div className="block">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      选择设备
                      {selectedDeviceIds.length > 0 ? `（已选 ${selectedDeviceIds.length} 台）` : ""}
                      {deviceKeywordLower ? ` / 匹配 ${filteredDevices.length} 台` : ""}
                    </span>
                    {filteredDevices.length > 0 ? (
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() =>
                          setSelectedDeviceIds((current) =>
                            allFilteredSelected
                              ? // 清空仅移除当前过滤命中的,保留其它已选
                                current.filter(
                                  (id) => !filteredDevices.some((device) => device.id === id)
                                )
                              : Array.from(
                                  new Set([
                                    ...current,
                                    ...filteredDevices.map((device) => device.id)
                                  ])
                                )
                          )
                        }
                        type="button"
                      >
                        {allFilteredSelected ? "清空" : "全选"}
                      </button>
                    ) : null}
                  </div>
                  {modalDevices.length > 0 ? (
                    <div className="relative mb-2">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        aria-label="搜索设备"
                        className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        onChange={(event) => setDeviceKeyword(event.currentTarget.value)}
                        placeholder="搜索设备名称或 device_key"
                        type="search"
                        value={deviceKeyword}
                      />
                    </div>
                  ) : null}
                  {devicesLoading ? (
                    <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
                      正在加载设备…
                    </p>
                  ) : modalDevices.length === 0 ? (
                    <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
                      该产品下暂无可选设备。
                    </p>
                  ) : filteredDevices.length === 0 ? (
                    <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-500">
                      没有匹配的设备。
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 px-3 py-2">
                      {modalDevices.length >= 100 ? (
                        <p className="pb-1 text-xs text-slate-400">
                          设备较多，仅显示前 100 台，可搜索缩小范围。
                        </p>
                      ) : null}
                      {filteredDevices.map((device) => (
                        <label
                          className="flex items-center gap-2 text-sm text-slate-700"
                          key={device.id}
                        >
                          <input
                            checked={selectedDeviceIds.includes(device.id)}
                            onChange={(event) => {
                              // currentTarget 在异步 updater 回调里会被置空,先同步取出
                              const checked = event.currentTarget.checked;
                              setSelectedDeviceIds((current) =>
                                checked
                                  ? [...current, device.id]
                                  : current.filter((id) => id !== device.id)
                              );
                            }}
                            type="checkbox"
                          />
                          <span className="min-w-0 flex-1 truncate">{device.name}</span>
                          <span className="text-xs text-slate-400">{device.device_key}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
              <p className="text-xs text-slate-400">
                {targetType === "devices"
                  ? `启动后仅向已选的 ${selectedDeviceIds.length} 台设备推送升级。`
                  : "启动后将对所选固件产品下的全部设备推送升级。"}
              </p>
              {error ? <div className="text-sm text-rose-600">{error}</div> : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button
                className="inline-flex h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setTaskModalOpen(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={taskPending}
                type="submit"
              >
                {taskPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                创建任务
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
