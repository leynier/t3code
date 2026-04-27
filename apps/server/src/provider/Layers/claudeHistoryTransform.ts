import {
  forkSession,
  getSessionMessages,
  type SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeCompatibleProviderId } from "@t3tools/shared/claudeCustomProviders";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ClaudeCompatibleHistoryTransformer {
  readonly transformHistory: (
    messages: ReadonlyArray<SessionMessage>,
  ) => ReadonlyArray<SessionMessage>;
}

function stripThinkingContentForClaude(messages: ReadonlyArray<SessionMessage>) {
  let changed = false;
  const transformed: SessionMessage[] = [];

  for (const message of messages) {
    const sdkMessage = message.message as {
      readonly role?: unknown;
      readonly content?: unknown;
    };
    if (sdkMessage.role !== "assistant" || !Array.isArray(sdkMessage.content)) {
      transformed.push(message);
      continue;
    }

    const content = sdkMessage.content.filter(
      (block) =>
        typeof block !== "object" ||
        block === null ||
        !("type" in block) ||
        block.type !== "thinking",
    );
    if (content.length === sdkMessage.content.length) {
      transformed.push(message);
      continue;
    }

    changed = true;
    if (content.length === 0) {
      continue;
    }

    transformed.push({
      ...message,
      message: {
        ...(message.message as object),
        content,
      },
    });
  }

  return changed ? transformed : messages;
}

export const defaultClaudeHistoryTransformer: ClaudeCompatibleHistoryTransformer = {
  transformHistory: stripThinkingContentForClaude,
};

const compatibleProviderHistoryTransformer: ClaudeCompatibleHistoryTransformer = {
  transformHistory: (messages) => messages,
};

const zaiHistoryTransformer: ClaudeCompatibleHistoryTransformer =
  compatibleProviderHistoryTransformer;
const kimiHistoryTransformer: ClaudeCompatibleHistoryTransformer =
  compatibleProviderHistoryTransformer;
const minimaxHistoryTransformer: ClaudeCompatibleHistoryTransformer =
  compatibleProviderHistoryTransformer;

export function getClaudeCompatibleHistoryTransformer(
  providerId: ClaudeCompatibleProviderId,
): ClaudeCompatibleHistoryTransformer {
  switch (providerId) {
    case "zai":
      return zaiHistoryTransformer;
    case "kimi":
      return kimiHistoryTransformer;
    case "minimax":
      return minimaxHistoryTransformer;
  }
}

export interface RewriteSessionTranscriptOptions {
  readonly dir?: string;
  readonly claudeConfigDir?: string;
}

type TranscriptEntry = Record<string, unknown>;

function sanitizeClaudeProjectKey(projectPath: string): string {
  return projectPath.replace(/[^a-zA-Z0-9]/g, "-");
}

function getClaudeConfigDir(options?: Pick<RewriteSessionTranscriptOptions, "claudeConfigDir">) {
  return (
    options?.claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")
  );
}

async function listTranscriptCandidates(
  sessionId: string,
  options?: RewriteSessionTranscriptOptions,
): Promise<string[]> {
  const projectsDir = path.join(getClaudeConfigDir(options), "projects");
  const candidates: string[] = [];

  if (options?.dir) {
    candidates.push(
      path.join(
        projectsDir,
        sanitizeClaudeProjectKey(path.resolve(options.dir)),
        `${sessionId}.jsonl`,
      ),
    );
  }

  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        candidates.push(path.join(projectsDir, entry.name, `${sessionId}.jsonl`));
      }
    }
  } catch {
    // Missing project storage is handled by the caller as "session not found".
  }

  return [...new Set(candidates)];
}

async function findTranscriptPath(
  sessionId: string,
  options?: RewriteSessionTranscriptOptions,
): Promise<string | undefined> {
  for (const candidate of await listTranscriptCandidates(sessionId, options)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function parseTranscriptEntries(raw: string): TranscriptEntry[] {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TranscriptEntry);
}

function isConversationTranscriptEntry(
  entry: TranscriptEntry,
): entry is TranscriptEntry & { readonly uuid: string } {
  return (
    (entry.type === "user" || entry.type === "assistant" || entry.type === "system") &&
    typeof entry.uuid === "string"
  );
}

function rewriteTranscriptEntries(
  entries: ReadonlyArray<TranscriptEntry>,
  messages: ReadonlyArray<SessionMessage>,
  sessionId: string,
): TranscriptEntry[] {
  const transformedByUuid = new Map(messages.map((message) => [message.uuid, message]));
  let previousUuid: string | null = null;
  const rewritten: TranscriptEntry[] = [];

  for (const entry of entries) {
    if (!isConversationTranscriptEntry(entry)) {
      rewritten.push(entry);
      continue;
    }

    const uuid = entry.uuid;
    const transformed = transformedByUuid.get(uuid);
    if (!transformed) {
      continue;
    }

    const nextEntry = {
      ...entry,
      type: transformed.type,
      message: transformed.message,
      parentUuid: previousUuid,
      sessionId,
      ...("session_id" in entry ? { session_id: sessionId } : {}),
    };
    previousUuid = uuid;
    rewritten.push(nextEntry);
  }

  return rewritten;
}

/**
 * Rewrites a forked Claude Code JSONL transcript before resuming it with a
 * different Claude-compatible endpoint. This intentionally depends on the
 * Claude Agent SDK's local JSONL storage format, which is not a public API; keep
 * the SDK version pinned and rely on roundtrip tests when upgrading it.
 */
export async function rewriteSessionTranscript(
  originalSessionId: string,
  transformer: ClaudeCompatibleHistoryTransformer,
  options?: RewriteSessionTranscriptOptions,
): Promise<string> {
  const forked = await forkSession(
    originalSessionId,
    options?.dir ? { dir: options.dir } : undefined,
  );
  const forkedMessages = await getSessionMessages(forked.sessionId, {
    ...(options?.dir ? { dir: options.dir } : {}),
    includeSystemMessages: true,
  });
  const transformedMessages = transformer.transformHistory(forkedMessages);

  if (transformedMessages === forkedMessages) {
    return forked.sessionId;
  }

  const transcriptPath = await findTranscriptPath(forked.sessionId, options);
  if (!transcriptPath) {
    throw new Error(`Claude transcript for forked session '${forked.sessionId}' was not found.`);
  }

  const entries = parseTranscriptEntries(await readFile(transcriptPath, "utf8"));
  const rewritten = rewriteTranscriptEntries(entries, transformedMessages, forked.sessionId);
  await writeFile(
    transcriptPath,
    `${rewritten.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  );

  return forked.sessionId;
}
