import { InfoIcon } from "lucide-react";
import { CLAUDE_COMPATIBLE_PROVIDER_CATALOG } from "@t3tools/shared/claudeCustomProviders";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export function ClaudeCompatibleProvidersSettings() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  return (
    <div className="border-t border-border/60 px-4 py-3 sm:px-5">
      <div className="text-xs font-medium text-foreground">Claude-compatible providers</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Configure credentials for fixed Claude Code compatible endpoints.
      </p>
      <div className="mt-3 flex gap-2 rounded-md border border-warning/24 bg-warning/6 px-2.5 py-2 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>Tokens and API keys are stored in plaintext in server settings.</span>
      </div>

      <div className="mt-3 space-y-2">
        {CLAUDE_COMPATIBLE_PROVIDER_CATALOG.map((compatibleProvider) => {
          const providerSettings =
            settings.providers.claudeAgent.claudeCompatibleProviders[compatibleProvider.id];
          const updateCompatibleProvider = (update: typeof providerSettings) => {
            updateSettings({
              providers: {
                ...settings.providers,
                claudeAgent: {
                  ...settings.providers.claudeAgent,
                  claudeCompatibleProviders: {
                    ...settings.providers.claudeAgent.claudeCompatibleProviders,
                    [compatibleProvider.id]: update,
                  },
                },
              },
            });
          };

          return (
            <div
              key={compatibleProvider.id}
              className={cn(
                "rounded-md border border-border/70 bg-background/70 p-3 shadow-xs/5",
                !providerSettings.enabled && "bg-muted/20 opacity-72",
              )}
            >
              <div className="flex items-center gap-2">
                <Switch
                  checked={providerSettings.enabled}
                  onCheckedChange={(checked) =>
                    updateCompatibleProvider({
                      ...providerSettings,
                      enabled: Boolean(checked),
                    })
                  }
                  aria-label={`Enable ${compatibleProvider.name}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground">
                    {compatibleProvider.name}
                  </div>
                  <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {compatibleProvider.baseUrl}
                  </code>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Auth token (optional)
                  </span>
                  <Input
                    className="mt-1 h-8"
                    type="password"
                    autoComplete="off"
                    value={providerSettings.authToken}
                    onChange={(event) =>
                      updateCompatibleProvider({
                        ...providerSettings,
                        authToken: event.target.value,
                      })
                    }
                    placeholder="ANTHROPIC_AUTH_TOKEN"
                    spellCheck={false}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    API key (optional)
                  </span>
                  <Input
                    className="mt-1 h-8"
                    type="password"
                    autoComplete="off"
                    value={providerSettings.apiKey}
                    onChange={(event) =>
                      updateCompatibleProvider({
                        ...providerSettings,
                        apiKey: event.target.value,
                      })
                    }
                    placeholder="ANTHROPIC_API_KEY"
                    spellCheck={false}
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(["haiku", "sonnet", "opus"] as const).map((alias) => {
                  const modelId = compatibleProvider.modelAliases[alias];
                  const modelName =
                    compatibleProvider.models.find((model) => model.id === modelId)?.name ??
                    modelId;
                  return (
                    <div key={alias}>
                      <span className="text-[11px] font-medium capitalize text-muted-foreground">
                        {alias}
                      </span>
                      <div className="mt-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs text-foreground">
                        {modelName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
