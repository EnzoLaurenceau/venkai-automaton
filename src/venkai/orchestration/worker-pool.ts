/**
 * Venkai Worker Pool — orchestration backend abstraction.
 * Two implementations: inline (default) and subprocess (forge-engine Rust binary,
 * env FORGE_ENGINE_BIN, JSON-lines protocol: {"id","task","payload"} -> {"id","status","result"}).
 */

import { spawn } from "node:child_process";

export interface WorkTask {
  id: string;
  task: string;
  payload?: Record<string, unknown>;
}

export interface WorkResult {
  id: string;
  status: "ok" | "error";
  result?: unknown;
  error?: string;
}

export interface WorkerPool {
  submit(task: WorkTask): Promise<WorkResult>;
  close(): Promise<void>;
}

export function createInlinePool(handler: (task: WorkTask) => Promise<unknown> | unknown): WorkerPool {
  return {
    async submit(task) {
      try {
        return { id: task.id, status: "ok", result: await handler(task) };
      } catch (e) {
        return { id: task.id, status: "error", error: String(e) };
      }
    },
    async close() {},
  };
}

/**
 * Subprocess pool: one long-lived worker speaking JSON-lines on stdin/stdout.
 * forge-engine plugs in here via FORGE_ENGINE_BIN; any binary respecting the protocol works.
 */
export function createSubprocessPool(binPath: string, args: string[] = []): WorkerPool {
  const child = spawn(binPath, args, { stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map<string, (r: WorkResult) => void>();
  let buffer = "";

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const result = JSON.parse(line) as WorkResult;
        const resolve = pending.get(result.id);
        if (resolve) {
          pending.delete(result.id);
          resolve(result);
        }
      } catch {
        // ignore malformed lines
      }
    }
  });

  return {
    submit(task) {
      return new Promise<WorkResult>((resolve) => {
        pending.set(task.id, resolve);
        child.stdin.write(JSON.stringify(task) + "\n");
      });
    },
    async close() {
      child.stdin.end();
      child.kill();
    },
  };
}

export function createWorkerPool(): WorkerPool {
  const bin = process.env.FORGE_ENGINE_BIN;
  return bin ? createSubprocessPool(bin) : createInlinePool(async (t) => ({ handled: t.task }));
}
