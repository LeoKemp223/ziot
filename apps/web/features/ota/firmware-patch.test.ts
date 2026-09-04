import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runPatchTool } from "./firmware-patch";

const { spawnMock } = vi.hoisted(() => {
  return { spawnMock: vi.fn() };
});

vi.mock("node:child_process", () => {
  return { spawn: spawnMock };
});

type FakeChild = EventEmitter & {
  stderr: { on: (event: string, listener: (chunk: Buffer) => void) => void };
  kill: ReturnType<typeof vi.fn>;
};

function fakeChild() {
  const child = new EventEmitter() as FakeChild;

  child.stderr = { on: vi.fn() };
  child.kill = vi.fn();

  return child;
}

function emitStderr(child: FakeChild, text: string) {
  const calls = (child.stderr.on as ReturnType<typeof vi.fn>).mock.calls;
  const onData = calls.find(([event]) => event === "data")?.[1] as (
    chunk: Buffer
  ) => void;

  onData?.(Buffer.from(text));
}

const toolInput = {
  basePath: "/tmp/ziot-delta-x/base.bin",
  targetPath: "/tmp/ziot-delta-x/target.bin",
  patchPath: "/tmp/ziot-delta-x/patch.bin"
};

afterEach(() => {
  spawnMock.mockClear();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("runPatchTool", () => {
  it("spawns detools with heatshrink args and no shell", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValueOnce(child);

    const pending = runPatchTool(toolInput);
    child.emit("close", 0);
    await pending;

    expect(spawnMock).toHaveBeenCalledWith(
      "detools",
      [
        "create_patch",
        "--compression",
        "heatshrink",
        toolInput.basePath,
        toolInput.targetPath,
        toolInput.patchPath
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
  });

  it("honors DETOOLS_BIN override", async () => {
    vi.stubEnv("DETOOLS_BIN", "/opt/detools/bin/detools");
    const child = fakeChild();
    spawnMock.mockReturnValueOnce(child);

    const pending = runPatchTool(toolInput);
    child.emit("close", 0);
    await pending;

    expect(spawnMock.mock.calls.at(-1)?.[0]).toBe("/opt/detools/bin/detools");
  });

  it("rejects with stderr tail when the tool exits non-zero", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValueOnce(child);

    const pending = runPatchTool(toolInput);
    emitStderr(child, "first line\nUsageError: bad binary\n");
    child.emit("close", 1);

    await expect(pending).rejects.toMatchObject({
      code: 500001,
      message: expect.stringContaining("bad binary")
    });
  });

  it("kills the tool and rejects on timeout", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    spawnMock.mockReturnValueOnce(child);

    const pending = runPatchTool({ ...toolInput, timeoutMs: 1000 });
    vi.advanceTimersByTime(1000);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    await expect(pending).rejects.toMatchObject({
      code: 500001,
      message: expect.stringContaining("超时")
    });
  });

  it("reports a missing detools installation via ENOENT", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValueOnce(child);

    const pending = runPatchTool(toolInput);
    child.emit("error", Object.assign(new Error("spawn detools ENOENT"), {
      code: "ENOENT"
    }));

    await expect(pending).rejects.toMatchObject({
      code: 500001,
      message: expect.stringContaining("未安装")
    });
  });
});
