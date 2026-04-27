import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  forkSession: vi.fn(),
  getSessionMessages: vi.fn(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => sdkMocks);

import {
  getClaudeCompatibleHistoryTransformer,
  rewriteSessionTranscript,
} from "./claudeHistoryTransform.ts";

function makeSessionMessage(
  type: "user" | "assistant" | "system",
  uuid: string,
  message: unknown,
): SessionMessage {
  return {
    type,
    uuid,
    session_id: "forked-session",
    parent_tool_use_id: null,
    message,
  };
}

function sanitizeClaudeProjectKey(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, "-");
}

describe("claude history transform", () => {
  it("exposes no-op transformers for fixed compatible providers", () => {
    const messages = [
      makeSessionMessage("user", "user-1", {
        role: "user",
        content: "hello",
      }),
    ];

    expect(getClaudeCompatibleHistoryTransformer("zai").transformHistory(messages)).toBe(messages);
  });

  it("rewrites a forked transcript with transformed messages", async () => {
    const claudeConfigDir = await mkdtemp(path.join(os.tmpdir(), "t3-claude-config-"));
    const dir = await mkdtemp(path.join(os.tmpdir(), "t3-claude-work-"));
    const forkedSessionId = "550e8400-e29b-41d4-a716-446655440001";
    const projectDir = path.join(
      claudeConfigDir,
      "projects",
      sanitizeClaudeProjectKey(path.resolve(dir)),
    );
    const transcriptPath = path.join(projectDir, `${forkedSessionId}.jsonl`);

    await mkdir(projectDir, { recursive: true });
    await writeFile(
      transcriptPath,
      [
        JSON.stringify({
          type: "permission-mode",
          permissionMode: "bypassPermissions",
          sessionId: forkedSessionId,
        }),
        JSON.stringify({
          type: "user",
          uuid: "user-1",
          parentUuid: null,
          sessionId: forkedSessionId,
          message: {
            role: "user",
            content: "hello",
          },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "assistant-1",
          parentUuid: "user-1",
          sessionId: forkedSessionId,
          message: {
            role: "assistant",
            content: [{ type: "text", text: "old" }],
          },
        }),
      ].join("\n") + "\n",
    );

    const forkSession = vi.mocked(sdkMocks.forkSession);
    const getSessionMessages = vi.mocked(sdkMocks.getSessionMessages);
    forkSession.mockResolvedValueOnce({ sessionId: forkedSessionId });
    getSessionMessages.mockResolvedValueOnce([
      makeSessionMessage("user", "user-1", {
        role: "user",
        content: "hello",
      }),
      makeSessionMessage("assistant", "assistant-1", {
        role: "assistant",
        content: [{ type: "text", text: "new" }],
      }),
    ]);

    try {
      await expect(
        rewriteSessionTranscript(
          "550e8400-e29b-41d4-a716-446655440000",
          {
            transformHistory: (messages) => messages.map((message) => ({ ...message })),
          },
          { dir, claudeConfigDir },
        ),
      ).resolves.toBe(forkedSessionId);

      const entries = (await readFile(transcriptPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(entries).toHaveLength(3);
      expect(entries[0]?.type).toBe("permission-mode");
      expect(entries[1]).toMatchObject({
        type: "user",
        uuid: "user-1",
        parentUuid: null,
        sessionId: forkedSessionId,
      });
      expect(entries[2]).toMatchObject({
        type: "assistant",
        uuid: "assistant-1",
        parentUuid: "user-1",
        sessionId: forkedSessionId,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "new" }],
        },
      });
    } finally {
      await rm(claudeConfigDir, { recursive: true, force: true });
      await rm(dir, { recursive: true, force: true });
    }
  });
});
