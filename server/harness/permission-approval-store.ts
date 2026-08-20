import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultHarnessRootDir } from "./run-event-store";
import type { ToolPermissionApprovalRecord } from "./tool-governance";

export type StoredPermissionApprovalRecord = ToolPermissionApprovalRecord & {
  approvedAt?: string;
  deniedAt?: string;
  replyMessage?: string;
};

export type PermissionApprovalStoreOptions = {
  rootDir?: string;
};

export type PermissionApprovalReply = {
  reply: "approve" | "reject" | "always";
  message?: string;
  repliedAt?: string;
};

export type PermissionApprovalStore = {
  add(record: ToolPermissionApprovalRecord): void;
  list(): StoredPermissionApprovalRecord[];
  approve(id: string, approvedAt?: string): StoredPermissionApprovalRecord | undefined;
  reply(id: string, reply: PermissionApprovalReply): StoredPermissionApprovalRecord | undefined;
  remove(id: string): void;
  savedApprovals(): StoredPermissionApprovalRecord[];
};

export function createPermissionApprovalStore(options: PermissionApprovalStoreOptions = {}): PermissionApprovalStore {
  const rootDir = options.rootDir ?? defaultHarnessRootDir();
  const path = join(rootDir, "permission-approvals.json");

  function list(): StoredPermissionApprovalRecord[] {
    if (!existsSync(path)) {
      return [];
    }

    return JSON.parse(readFileSync(path, "utf8")) as StoredPermissionApprovalRecord[];
  }

  function write(records: StoredPermissionApprovalRecord[]): void {
    mkdirSync(rootDir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }

  function add(record: ToolPermissionApprovalRecord): void {
    const records = list().filter((item) => item.id !== record.id);
    write([...records, record]);
  }

  function approve(id: string, approvedAt = new Date().toISOString()): StoredPermissionApprovalRecord | undefined {
    let updated: StoredPermissionApprovalRecord | undefined;
    const records = list().map((item) => {
      if (item.id !== id) {
        return item;
      }

      updated = {
        ...item,
        status: "approved",
        approvedAt
      };
      return updated;
    });

    write(records);
    return updated;
  }

  function reply(id: string, input: PermissionApprovalReply): StoredPermissionApprovalRecord | undefined {
    const repliedAt = input.repliedAt ?? new Date().toISOString();
    let updated: StoredPermissionApprovalRecord | undefined;
    const records = list().map((item) => {
      if (item.id !== id) {
        return item;
      }

      const base = {
        ...item,
        ...(input.message ? { replyMessage: input.message } : {})
      };

      if (input.reply === "reject") {
        updated = {
          ...base,
          status: "denied",
          deniedAt: repliedAt
        };
        return updated;
      }

      updated = {
        ...base,
        status: "approved",
        scope: input.reply === "always" ? "tool" : "run",
        approvedAt: repliedAt
      };
      return updated;
    });

    write(records);
    return updated;
  }

  function remove(id: string): void {
    write(list().filter((item) => item.id !== id));
  }

  function savedApprovals(): StoredPermissionApprovalRecord[] {
    return list().filter((item) => item.status === "approved");
  }

  return {
    add,
    list,
    approve,
    reply,
    remove,
    savedApprovals
  };
}
