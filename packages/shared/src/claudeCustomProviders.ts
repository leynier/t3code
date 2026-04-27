import type { ClaudeSettings, ServerProviderModel } from "@t3tools/contracts";
import { createModelCapabilities } from "./model.ts";

export const CLAUDE_COMPATIBLE_MODEL_SLUG_PREFIX = "claude-compatible";
export const CLAUDE_LEGACY_CUSTOM_MODEL_SLUG_PREFIX = "custom-claude";
export const CLAUDE_COMPATIBLE_PROVIDER_ALIASES = ["haiku", "sonnet", "opus"] as const;
export type ClaudeCompatibleProviderAlias = (typeof CLAUDE_COMPATIBLE_PROVIDER_ALIASES)[number];

export const CLAUDE_COMPATIBLE_PROVIDER_IDS = ["zai", "minimax", "kimi"] as const;
export type ClaudeCompatibleProviderId = (typeof CLAUDE_COMPATIBLE_PROVIDER_IDS)[number];

export type ClaudeCompatibleProviderSettings =
  ClaudeSettings["claudeCompatibleProviders"][ClaudeCompatibleProviderId];

export interface ClaudeCompatibleProviderModelDefinition {
  readonly id: string;
  readonly name: string;
}

export interface ClaudeCompatibleProviderDefinition {
  readonly id: ClaudeCompatibleProviderId;
  readonly name: string;
  readonly baseUrl: string;
  readonly modelAliases: Record<ClaudeCompatibleProviderAlias, string>;
  readonly models: ReadonlyArray<ClaudeCompatibleProviderModelDefinition>;
}

const EMPTY_CAPABILITIES = createModelCapabilities({
  optionDescriptors: [],
});

const ALIAS_PRIORITY: ReadonlyArray<ClaudeCompatibleProviderAlias> = ["opus", "sonnet", "haiku"];

function trimmedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export const CLAUDE_COMPATIBLE_PROVIDER_CATALOG: ReadonlyArray<ClaudeCompatibleProviderDefinition> =
  [
    {
      id: "zai",
      name: "Z.ai",
      baseUrl: "https://api.z.ai/api/anthropic",
      modelAliases: {
        haiku: "glm-5-turbo",
        sonnet: "glm-5.1",
        opus: "glm-5.1",
      },
      models: [
        { id: "glm-5.1", name: "GLM 5.1" },
        { id: "glm-5-turbo", name: "GLM 5 Turbo" },
      ],
    },
    {
      id: "minimax",
      name: "MiniMax",
      baseUrl: "https://api.minimax.io/anthropic",
      modelAliases: {
        haiku: "MiniMax-M2.7",
        sonnet: "MiniMax-M2.7",
        opus: "MiniMax-M2.7",
      },
      models: [{ id: "MiniMax-M2.7", name: "MiniMax M2.7" }],
    },
    {
      id: "kimi",
      name: "Kimi",
      baseUrl: "https://api.kimi.com/coding/",
      modelAliases: {
        haiku: "kimi-k2.6",
        sonnet: "kimi-k2.6",
        opus: "kimi-k2.6",
      },
      models: [{ id: "kimi-k2.6", name: "Kimi K2.6" }],
    },
  ];

export function isClaudeCompatibleProviderId(value: string): value is ClaudeCompatibleProviderId {
  return (CLAUDE_COMPATIBLE_PROVIDER_IDS as ReadonlyArray<string>).includes(value);
}

export function makeClaudeCompatibleProviderModelSlug(
  providerId: ClaudeCompatibleProviderId,
  modelId: string,
): string {
  return `${CLAUDE_COMPATIBLE_MODEL_SLUG_PREFIX}/${providerId}/${encodeURIComponent(modelId)}`;
}

export function parseClaudeCompatibleProviderModelSlug(
  model: string | null | undefined,
): { providerId: ClaudeCompatibleProviderId; modelId: string } | null {
  const trimmed = model?.trim();
  if (!trimmed) return null;
  const [prefix, providerId, encodedModelId, ...rest] = trimmed.split("/");
  if (
    prefix !== CLAUDE_COMPATIBLE_MODEL_SLUG_PREFIX ||
    !providerId ||
    !encodedModelId ||
    rest.length > 0 ||
    !isClaudeCompatibleProviderId(providerId)
  ) {
    return null;
  }
  try {
    const modelId = decodeURIComponent(encodedModelId);
    return modelId.length > 0 ? { providerId, modelId } : null;
  } catch {
    return null;
  }
}

export function isLegacyClaudeCustomProviderModelSlug(model: string | null | undefined): boolean {
  return model?.trim().startsWith(`${CLAUDE_LEGACY_CUSTOM_MODEL_SLUG_PREFIX}/`) === true;
}

export function getClaudeCompatibleProviderDefinition(
  providerId: ClaudeCompatibleProviderId,
): ClaudeCompatibleProviderDefinition {
  const provider = CLAUDE_COMPATIBLE_PROVIDER_CATALOG.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`Unknown Claude-compatible provider '${providerId}'.`);
  }
  return provider;
}

function getConfiguredProviderSettings(
  claudeSettings: Pick<ClaudeSettings, "claudeCompatibleProviders">,
  providerId: ClaudeCompatibleProviderId,
): ClaudeCompatibleProviderSettings {
  return claudeSettings.claudeCompatibleProviders[providerId];
}

export function resolveClaudeCompatibleAliasForModel(
  provider: ClaudeCompatibleProviderDefinition,
  modelId: string,
): ClaudeCompatibleProviderAlias | null {
  for (const alias of ALIAS_PRIORITY) {
    if (provider.modelAliases[alias] === modelId) {
      return alias;
    }
  }
  return null;
}

export type ClaudeCompatibleProviderResolution =
  | { readonly kind: "none" }
  | { readonly kind: "stale" }
  | {
      readonly kind: "resolved";
      readonly provider: ClaudeCompatibleProviderDefinition;
      readonly settings: ClaudeCompatibleProviderSettings;
      readonly alias: ClaudeCompatibleProviderAlias;
      readonly upstreamModel: string;
      readonly modelName: string;
    };

export function resolveClaudeCompatibleProviderForModel(
  claudeSettings: Pick<ClaudeSettings, "claudeCompatibleProviders">,
  model: string | null | undefined,
): ClaudeCompatibleProviderResolution {
  const parsed = parseClaudeCompatibleProviderModelSlug(model);
  if (!parsed) return { kind: "none" };

  const provider = getClaudeCompatibleProviderDefinition(parsed.providerId);
  const settings = getConfiguredProviderSettings(claudeSettings, parsed.providerId);
  if (settings.enabled === false) return { kind: "stale" };

  const alias = resolveClaudeCompatibleAliasForModel(provider, parsed.modelId);
  const modelDefinition = provider.models.find((entry) => entry.id === parsed.modelId);
  if (!alias || !modelDefinition) return { kind: "stale" };

  return {
    kind: "resolved",
    provider,
    settings,
    alias,
    upstreamModel: parsed.modelId,
    modelName: modelDefinition.name,
  };
}

export function buildClaudeCompatibleProviderEnv(
  resolution: Extract<ClaudeCompatibleProviderResolution, { kind: "resolved" }>,
): Record<string, string | undefined> {
  return {
    ANTHROPIC_BASE_URL: resolution.provider.baseUrl,
    ANTHROPIC_AUTH_TOKEN: trimmedOrUndefined(resolution.settings.authToken),
    ANTHROPIC_API_KEY: trimmedOrUndefined(resolution.settings.apiKey),
    ANTHROPIC_MODEL: resolution.upstreamModel,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: resolution.provider.modelAliases.haiku,
    ANTHROPIC_DEFAULT_SONNET_MODEL: resolution.provider.modelAliases.sonnet,
    ANTHROPIC_DEFAULT_OPUS_MODEL: resolution.provider.modelAliases.opus,
  };
}

export function buildClaudeCompatibleProviderModelRows(
  claudeSettings: Pick<ClaudeSettings, "claudeCompatibleProviders">,
): ReadonlyArray<ServerProviderModel> {
  const models: ServerProviderModel[] = [];

  const sortedProviders = [...CLAUDE_COMPATIBLE_PROVIDER_CATALOG].sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const provider of sortedProviders) {
    const settings = getConfiguredProviderSettings(claudeSettings, provider.id);
    if (settings.enabled === false) continue;

    const seen = new Set<string>();
    for (const alias of ALIAS_PRIORITY) {
      const modelId = provider.modelAliases[alias];
      if (seen.has(modelId)) continue;
      seen.add(modelId);
      const model = provider.models.find((entry) => entry.id === modelId);
      if (!model) continue;
      models.push({
        slug: makeClaudeCompatibleProviderModelSlug(provider.id, model.id),
        name: `${provider.name} · ${model.name}`,
        shortName: model.name,
        subProvider: provider.name,
        isCustom: false,
        capabilities: EMPTY_CAPABILITIES,
      });
    }
  }

  return models;
}
