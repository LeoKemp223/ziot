export type CommandStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "success"
  | "failed"
  | "timeout"
  | "cancelled";

const commandTransitions: Record<CommandStatus, CommandStatus[]> = {
  // 传输语义:投递成功直接落 success;failed 仅在 EMQX 发布重试耗尽时出现。
  // sent/delivered/timeout 仅存量历史命令使用(旧版等待设备应答的语义)。
  pending: ["sent", "success", "failed", "cancelled"],
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
