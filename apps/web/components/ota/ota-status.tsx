type StatusMeta = {
  label: string;
  className: string;
};

function firmwareStatusMeta(value: string): StatusMeta {
  if (value === "deprecated") {
    return { label: "已废弃", className: "bg-zinc-100 text-zinc-600" };
  }

  // 历史数据可能仍有 draft 中间态,新固件上传即已发布
  return value === "draft"
    ? { label: "草稿", className: "bg-amber-50 text-amber-700" }
    : { label: "已发布", className: "bg-emerald-50 text-emerald-700" };
}

function taskStatusMeta(value: string): StatusMeta {
  if (value === "running") {
    return { label: "进行中", className: "bg-blue-50 text-blue-700" };
  }

  if (value === "finished") {
    return { label: "已完成", className: "bg-emerald-50 text-emerald-700" };
  }

  if (value === "cancelled") {
    return { label: "已取消", className: "bg-zinc-100 text-zinc-600" };
  }

  if (value === "scheduled") {
    return { label: "已排期", className: "bg-purple-50 text-purple-700" };
  }

  return { label: "待启动", className: "bg-slate-100 text-slate-600" };
}

function recordStatusMeta(value: string): StatusMeta {
  switch (value) {
    case "created":
      return { label: "已创建", className: "bg-slate-100 text-slate-600" };
    case "scheduled":
      return { label: "已排期", className: "bg-purple-50 text-purple-700" };
    case "notified":
      return { label: "已通知", className: "bg-blue-50 text-blue-700" };
    case "downloading":
      return { label: "下载中", className: "bg-blue-50 text-blue-700" };
    case "installing":
      return { label: "安装中", className: "bg-amber-50 text-amber-700" };
    case "success":
      return { label: "成功", className: "bg-emerald-50 text-emerald-700" };
    case "failed":
      return { label: "失败", className: "bg-rose-50 text-rose-700" };
    case "cancelled":
      return { label: "已取消", className: "bg-zinc-100 text-zinc-600" };
    default:
      return { label: value, className: "bg-slate-100 text-slate-600" };
  }
}

function StatusBadge({ meta }: { meta: StatusMeta }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function FirmwareStatusBadge({ value }: { value: string }) {
  return <StatusBadge meta={firmwareStatusMeta(value)} />;
}

export function TaskStatusBadge({ value }: { value: string }) {
  return <StatusBadge meta={taskStatusMeta(value)} />;
}

export function RecordStatusBadge({ value }: { value: string }) {
  return <StatusBadge meta={recordStatusMeta(value)} />;
}
