type Db = { [key: string]: any };

type AccessScope = {
  userId?: string;
  canAccessAll?: boolean;
};

type DashboardSummaryInput = AccessScope & {
  orgId: string;
  now?: Date;
};

function ownerFilter(input: AccessScope) {
  return input.canAccessAll || !input.userId ? {} : { created_by: input.userId };
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfHour(value: Date) {
  const date = new Date(value);
  date.setMinutes(0, 0, 0);
  return date;
}

function hourBuckets(now: Date) {
  const currentHour = startOfHour(now);

  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(currentHour.getTime() - (11 - index) * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      start,
      end,
      label: `${String(start.getHours()).padStart(2, "0")}:00`,
      reports: 0,
      commands: 0
    };
  });
}

function incrementBucket(
  buckets: ReturnType<typeof hourBuckets>,
  date: Date,
  field: "reports" | "commands"
) {
  const bucket = buckets.find((item) => date >= item.start && date < item.end);

  if (bucket) {
    bucket[field] += 1;
  }
}

function mapRecentError(log: any) {
  return {
    id: log.id,
    type: log.type,
    level: log.level,
    device_id: log.device_id,
    device_name: log.device?.name ?? "",
    product_name: log.product?.name ?? "",
    content: log.content,
    occurred_at: log.occurred_at.toISOString()
  };
}

export async function getDashboardSummary(db: Db, input: DashboardSummaryInput) {
  const now = input.now ?? new Date();
  const todayStart = startOfDay(now);
  const buckets = hourBuckets(now);
  const reportWindowStart = buckets[0]?.start ?? todayStart;
  const deviceScope = ownerFilter(input);
  const deviceWhere = {
    org_id: input.orgId,
    deleted_at: null,
    ...deviceScope
  };
  const deviceRelationScope = ownerFilter(input);
  const deviceLogWhere = {
    org_id: input.orgId,
    device: {
      deleted_at: null,
      ...deviceRelationScope
    }
  };
  const commandWhere = {
    org_id: input.orgId,
    device: {
      deleted_at: null,
      ...deviceRelationScope
    }
  };
  const productRelationScope = ownerFilter(input);

  const [
    totalDevices,
    onlineDevices,
    todayReports,
    todayCommands,
    runningOtaTasks,
    recentErrors,
    reportSeries,
    commandSeries
  ] = await Promise.all([
    db.device.count({ where: deviceWhere }),
    db.device.count({
      where: {
        ...deviceWhere,
        online_status: "online"
      }
    }),
    db.deviceLog.count({
      where: {
        ...deviceLogWhere,
        occurred_at: { gte: todayStart }
      }
    }),
    db.deviceCommand.count({
      where: {
        ...commandWhere,
        created_at: { gte: todayStart }
      }
    }),
    db.otaTask.count({
      where: {
        org_id: input.orgId,
        status: "running",
        product: {
          deleted_at: null,
          ...productRelationScope
        }
      }
    }),
    db.deviceLog.findMany({
      where: {
        ...deviceLogWhere,
        level: { in: ["warn", "error"] }
      },
      orderBy: { occurred_at: "desc" },
      take: 6,
      include: { product: true, device: true }
    }),
    db.deviceLog.findMany({
      where: {
        ...deviceLogWhere,
        occurred_at: { gte: reportWindowStart }
      },
      orderBy: { occurred_at: "asc" },
      take: 5000,
      select: { occurred_at: true }
    }),
    db.deviceCommand.findMany({
      where: {
        ...commandWhere,
        created_at: { gte: reportWindowStart }
      },
      orderBy: { created_at: "asc" },
      take: 5000,
      select: { created_at: true }
    })
  ]);

  reportSeries.forEach((item: any) =>
    incrementBucket(buckets, item.occurred_at, "reports")
  );
  commandSeries.forEach((item: any) =>
    incrementBucket(buckets, item.created_at, "commands")
  );

  return {
    total_devices: totalDevices,
    online_devices: onlineDevices,
    online_rate:
      totalDevices > 0 ? Number(((onlineDevices / totalDevices) * 100).toFixed(1)) : 0,
    today_reports: todayReports,
    today_commands: todayCommands,
    running_ota_tasks: runningOtaTasks,
    recent_errors: recentErrors.map((log: any) => mapRecentError(log)),
    traffic: buckets.map(({ label, reports, commands }) => ({
      label,
      reports,
      commands
    })),
    generated_at: now.toISOString()
  };
}
