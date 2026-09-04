import { spawn } from "node:child_process";

// 差分补丁格式标识,随固件记录与 notify payload 下发,设备端据此选择对应解补丁实现
export const PATCH_FORMAT = "bsdiff-heatshrink";

export const DEFAULT_PATCH_TOOL_TIMEOUT_MS = 120_000;

const maxStderrBytes = 8 * 1024;

export function patchToolBin(): string {
  return process.env.DETOOLS_BIN ?? "detools";
}

function patchError(message: string) {
  return Object.assign(new Error(message), { code: 500001 });
}

// 调用 detools 生成 bsdiff+heatshrink 补丁(detools 本身即 esp_delta_ota 官方补丁工具的底层)
export function runPatchTool(input: {
  basePath: string;
  targetPath: string;
  patchPath: string;
  timeoutMs?: number;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      patchToolBin(),
      [
        "create_patch",
        "--compression",
        "heatshrink",
        input.basePath,
        input.targetPath,
        input.patchPath
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < maxStderrBytes) {
        stderr += chunk.toString("utf8");
      }
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(patchError("生成差分固件超时，请重试或减小固件体积"));
    }, input.timeoutMs ?? DEFAULT_PATCH_TOOL_TIMEOUT_MS);

    const settle = (error: unknown) => {
      clearTimeout(timeout);
      reject(error);
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        settle(
          patchError(
            "差分工具 detools 未安装：请在服务器安装 detools（pip install detools）或通过环境变量 DETOOLS_BIN 指定路径"
          )
        );
        return;
      }

      settle(patchError(`生成差分固件失败：${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        clearTimeout(timeout);
        resolve();
        return;
      }

      const detail = stderr.trim().split("\n").filter(Boolean).slice(-1)[0];

      settle(
        patchError(
          `生成差分固件失败${detail ? `：${detail}` : ""}（detools 退出码 ${code ?? "unknown"}）`
        )
      );
    });
  });
}
