export type ExecutionState = "ACTIVE" | "COMPLETED" | "FAILED";

export interface ExecutionRecord {
  taskId: string;
  leaseId: string;
  state: ExecutionState;
}

export interface ExecutionLedger {
  tryStart(taskId: string, leaseId: string): boolean | Promise<boolean>;
  complete(taskId: string, leaseId: string): void | Promise<void>;
  fail(taskId: string, leaseId: string, error?: unknown): void | Promise<void>;
}

export class InMemoryExecutionLedger implements ExecutionLedger {
  private readonly records = new Map<string, ExecutionRecord>();

  tryStart(taskId: string, leaseId: string): boolean {
    const existing = this.records.get(taskId);
    if (!existing) {
      this.records.set(taskId, { taskId, leaseId, state: "ACTIVE" });
      return true;
    }
    if (existing.state === "FAILED" && existing.leaseId !== leaseId) {
      this.records.set(taskId, { taskId, leaseId, state: "ACTIVE" });
      return true;
    }
    return false;
  }

  complete(taskId: string, leaseId: string): void {
    const current = this.records.get(taskId);
    if (!current || current.leaseId !== leaseId || current.state !== "ACTIVE") {
      throw new Error("EXECUTION_LEDGER_STATE_INVALID");
    }
    current.state = "COMPLETED";
  }

  fail(taskId: string, leaseId: string): void {
    const current = this.records.get(taskId);
    if (!current || current.leaseId !== leaseId || current.state !== "ACTIVE") return;
    current.state = "FAILED";
  }
}
