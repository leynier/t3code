import type { ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vitest";

import { getAppModelOptions, resolveAppModelSelection } from "./modelSelection";

const CLAUDE_PROVIDER_WITH_LEGACY_MODELS: ReadonlyArray<ServerProvider> = [
  {
    provider: "claudeAgent",
    displayName: "Claude",
    enabled: true,
    installed: true,
    version: "2.1.111",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-04-26T00:00:00.000Z",
    models: [
      {
        slug: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "custom-claude/kimi/haiku",
        name: "Haiku",
        shortName: "Haiku",
        subProvider: "Kimi",
        isCustom: true,
        capabilities: null,
      },
      {
        slug: "custom-claude/kimi/sonnet",
        name: "Sonnet",
        shortName: "Sonnet",
        subProvider: "Kimi",
        isCustom: true,
        capabilities: null,
      },
      {
        slug: "claude-compatible/kimi/kimi-k2.6",
        name: "Kimi · Kimi K2.6",
        shortName: "Kimi K2.6",
        subProvider: "Kimi",
        isCustom: false,
        capabilities: null,
      },
    ],
    slashCommands: [],
    skills: [],
  },
];

describe("modelSelection", () => {
  it("filters legacy Claude custom provider alias rows from the picker", () => {
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providers: {
        ...DEFAULT_UNIFIED_SETTINGS.providers,
        claudeAgent: {
          ...DEFAULT_UNIFIED_SETTINGS.providers.claudeAgent,
          customModels: ["custom-claude/kimi/opus", "claude-compatible/kimi/kimi-k2.6"],
        },
      },
    };
    const options = getAppModelOptions(
      settings,
      CLAUDE_PROVIDER_WITH_LEGACY_MODELS,
      "claudeAgent",
      "custom-claude/kimi/sonnet",
    );

    expect(options.map((option) => option.slug)).not.toContain("custom-claude/kimi/haiku");
    expect(options.map((option) => option.slug)).not.toContain("custom-claude/kimi/sonnet");
    expect(options.map((option) => option.slug)).not.toContain("custom-claude/kimi/opus");
    expect(options.map((option) => option.slug)).toContain("claude-compatible/kimi/kimi-k2.6");
    expect(options.map((option) => option.name)).toContain("Kimi · Kimi K2.6");
    expect(options.map((option) => option.name)).not.toContain("Sonnet");
  });

  it("falls back from a selected legacy Claude custom provider slug", () => {
    expect(
      resolveAppModelSelection(
        "claudeAgent",
        DEFAULT_UNIFIED_SETTINGS,
        CLAUDE_PROVIDER_WITH_LEGACY_MODELS,
        "custom-claude/kimi/sonnet",
      ),
    ).toBe("claude-sonnet-4-6");
  });

  it("rebuilds Claude-compatible picker rows from current settings", () => {
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      providers: {
        ...DEFAULT_UNIFIED_SETTINGS.providers,
        claudeAgent: {
          ...DEFAULT_UNIFIED_SETTINGS.providers.claudeAgent,
          customModels: ["claude-compatible/kimi/kimi-k2.6"],
          claudeCompatibleProviders: {
            ...DEFAULT_UNIFIED_SETTINGS.providers.claudeAgent.claudeCompatibleProviders,
            kimi: {
              ...DEFAULT_UNIFIED_SETTINGS.providers.claudeAgent.claudeCompatibleProviders.kimi,
              enabled: false,
            },
          },
        },
      },
    };

    const options = getAppModelOptions(
      settings,
      CLAUDE_PROVIDER_WITH_LEGACY_MODELS,
      "claudeAgent",
      "claude-compatible/kimi/kimi-k2.6",
    );

    expect(options.map((option) => option.slug)).not.toContain("claude-compatible/kimi/kimi-k2.6");
  });
});
