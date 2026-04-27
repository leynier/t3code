import type { ClaudeSettings, ModelSelection } from "@t3tools/contracts";
import {
  buildClaudeCompatibleProviderEnv,
  parseClaudeCompatibleProviderModelSlug,
  resolveClaudeCompatibleProviderForModel,
  type ClaudeCompatibleProviderAlias,
  type ClaudeCompatibleProviderId,
} from "@t3tools/shared/claudeCustomProviders";
import {
  defaultClaudeHistoryTransformer,
  getClaudeCompatibleHistoryTransformer,
  type ClaudeCompatibleHistoryTransformer,
} from "./claudeHistoryTransform.ts";

export type { ClaudeCompatibleProviderId };

export interface ClaudeCompatibleRuntimeSelection {
  readonly providerId: ClaudeCompatibleProviderId;
  readonly providerName: string;
  readonly alias: ClaudeCompatibleProviderAlias;
  readonly upstreamModel: string;
  readonly modelName: string;
  readonly env: Record<string, string | undefined>;
}

export type ClaudeCompatibleRuntimeResolution =
  | { readonly kind: "none" }
  | { readonly kind: "stale" }
  | {
      readonly kind: "resolved";
      readonly selection: ClaudeCompatibleRuntimeSelection;
    };

export function resolveClaudeCompatibleRuntimeSelection(
  claudeSettings: Pick<ClaudeSettings, "claudeCompatibleProviders">,
  modelSelection: ModelSelection | undefined,
): ClaudeCompatibleRuntimeResolution {
  const resolution = modelSelection
    ? resolveClaudeCompatibleProviderForModel(claudeSettings, modelSelection.model)
    : ({ kind: "none" } as const);

  if (resolution.kind !== "resolved") {
    return resolution;
  }

  return {
    kind: "resolved",
    selection: {
      providerId: resolution.provider.id,
      providerName: resolution.provider.name,
      alias: resolution.alias,
      upstreamModel: resolution.upstreamModel,
      modelName: resolution.modelName,
      env: buildClaudeCompatibleProviderEnv(resolution),
    },
  };
}

export function isClaudeCompatibleModelSelection(modelSelection: ModelSelection | undefined) {
  return (
    modelSelection !== undefined &&
    parseClaudeCompatibleProviderModelSlug(modelSelection.model) !== null
  );
}

export function getClaudeProviderSwitchTransformer(
  targetCompatibleProviderId: ClaudeCompatibleProviderId | undefined,
): ClaudeCompatibleHistoryTransformer {
  return targetCompatibleProviderId
    ? getClaudeCompatibleHistoryTransformer(targetCompatibleProviderId)
    : defaultClaudeHistoryTransformer;
}
