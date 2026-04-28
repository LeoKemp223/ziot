export type DeviceShadowState = {
  reported: Record<string, unknown>;
  desired: Record<string, unknown>;
  version: number;
};

export function mergeReportedShadow(
  current: DeviceShadowState,
  reportedPatch: Record<string, unknown>
): DeviceShadowState {
  return {
    reported: {
      ...current.reported,
      ...reportedPatch
    },
    desired: current.desired,
    version: current.version + 1
  };
}
