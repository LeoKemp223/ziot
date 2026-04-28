export type OtaRecordStatus =
  | "created"
  | "scheduled"
  | "notified"
  | "downloading"
  | "installing"
  | "success"
  | "failed"
  | "cancelled";

const otaRecordTransitions: Record<OtaRecordStatus, OtaRecordStatus[]> = {
  created: ["scheduled", "cancelled"],
  scheduled: ["notified", "cancelled"],
  notified: ["downloading", "failed"],
  downloading: ["installing", "failed"],
  installing: ["success", "failed"],
  success: [],
  failed: [],
  cancelled: []
};

export function canTransitionOtaRecord(
  from: OtaRecordStatus,
  to: OtaRecordStatus
): boolean {
  return otaRecordTransitions[from].includes(to);
}
