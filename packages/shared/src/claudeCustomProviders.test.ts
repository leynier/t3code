import { describe, expect, it } from "vitest";
import type { ClaudeSettings } from "@t3tools/contracts";

import {
  buildClaudeCompatibleProviderEnv,
  buildClaudeCompatibleProviderModelRows,
  isLegacyClaudeCustomProviderModelSlug,
  makeClaudeCompatibleProviderModelSlug,
  parseClaudeCompatibleProviderModelSlug,
  resolveClaudeCompatibleProviderForModel,
} from "./claudeCustomProviders.ts";

const settings: Pick<ClaudeSettings, "claudeCompatibleProviders"> = {
  claudeCompatibleProviders: {
    zai: {
      enabled: true,
      authToken: "zai-token",
      apiKey: "",
    },
    minimax: {
      enabled: true,
      authToken: "minimax-token",
      apiKey: "",
    },
    kimi: {
      enabled: true,
      authToken: "kimi-token",
      apiKey: "",
    },
  },
};

describe("claude compatible provider helpers", () => {
  it("parses fixed provider model slugs", () => {
    const slug = makeClaudeCompatibleProviderModelSlug("zai", "glm-5.1");
    expect(slug).toBe("claude-compatible/zai/glm-5.1");
    expect(parseClaudeCompatibleProviderModelSlug(slug)).toEqual({
      providerId: "zai",
      modelId: "glm-5.1",
    });
    expect(parseClaudeCompatibleProviderModelSlug("claude-sonnet-4-6")).toBeNull();
  });

  it("detects legacy open custom provider slugs", () => {
    expect(isLegacyClaudeCustomProviderModelSlug("custom-claude/kimi/sonnet")).toBe(true);
    expect(isLegacyClaudeCustomProviderModelSlug("claude-compatible/kimi/kimi-k2.6")).toBe(false);
    expect(isLegacyClaudeCustomProviderModelSlug("claude-sonnet-4-6")).toBe(false);
  });

  it("builds one selector row per fixed upstream model", () => {
    expect(buildClaudeCompatibleProviderModelRows(settings).map((model) => model.name)).toEqual([
      "Kimi · Kimi K2.6",
      "MiniMax · MiniMax M2.7",
      "Z.ai · GLM 5.1",
      "Z.ai · GLM 5 Turbo",
    ]);
  });

  it("resolves the highest available alias for selected upstream models", () => {
    const zaiMain = resolveClaudeCompatibleProviderForModel(
      settings,
      "claude-compatible/zai/glm-5.1",
    );
    expect(zaiMain.kind).toBe("resolved");
    if (zaiMain.kind === "resolved") {
      expect(zaiMain.alias).toBe("opus");
      expect(zaiMain.upstreamModel).toBe("glm-5.1");
    }

    const zaiTurbo = resolveClaudeCompatibleProviderForModel(
      settings,
      "claude-compatible/zai/glm-5-turbo",
    );
    expect(zaiTurbo.kind).toBe("resolved");
    if (zaiTurbo.kind === "resolved") {
      expect(zaiTurbo.alias).toBe("haiku");
      expect(zaiTurbo.upstreamModel).toBe("glm-5-turbo");
    }

    const kimi = resolveClaudeCompatibleProviderForModel(
      settings,
      "claude-compatible/kimi/kimi-k2.6",
    );
    expect(kimi.kind).toBe("resolved");
    if (kimi.kind === "resolved") {
      expect(kimi.alias).toBe("opus");
    }
  });

  it("treats disabled or unknown fixed provider model slugs as stale", () => {
    const disabledSettings: Pick<ClaudeSettings, "claudeCompatibleProviders"> = {
      claudeCompatibleProviders: {
        ...settings.claudeCompatibleProviders,
        kimi: {
          ...settings.claudeCompatibleProviders.kimi,
          enabled: false,
        },
      },
    };
    expect(
      resolveClaudeCompatibleProviderForModel(disabledSettings, "claude-compatible/kimi/kimi-k2.6")
        .kind,
    ).toBe("stale");
    expect(
      resolveClaudeCompatibleProviderForModel(settings, "claude-compatible/zai/not-a-model").kind,
    ).toBe("stale");
  });

  it("builds env with fixed endpoint, selected model, alias defaults, and auth", () => {
    const resolved = resolveClaudeCompatibleProviderForModel(
      settings,
      "claude-compatible/zai/glm-5.1",
    );
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") return;

    const env = buildClaudeCompatibleProviderEnv(resolved);
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.z.ai/api/anthropic");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("zai-token");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBe("glm-5.1");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("glm-5-turbo");
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("glm-5.1");
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe("glm-5.1");
  });
});
