export type CommandStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "success"
  | "failed"
  | "timeout"
  | "cancelled";

const commandTransitions: Record<CommandStatus, CommandStatus[]> = {
  pending: ["sent", "cancelled"],
  sent: ["delivered", "success", "failed", "timeout"],
  delivered: ["success", "failed", "timeout"],
  success: [],
  failed: [],
  timeout: [],
  cancelled: []
};

export function canTransitionCommand(
  from: CommandStatus,
  to: CommandStatus
): boolean {
  return commandTransitions[from].includes(to);
}
