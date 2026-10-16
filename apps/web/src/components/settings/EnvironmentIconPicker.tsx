import {
  AuthSettingsWriteScope,
  isEnvironmentMachineKind,
  resolveEnvironmentMachineKind,
  type EnvironmentId,
  type EnvironmentMachineKind,
  type ServerConfig,
} from "@t3tools/contracts";
import { Fragment } from "react";

import { useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironmentScope } from "../../state/session";
import { ENVIRONMENT_MACHINE_KIND_LABELS, EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
} from "../ui/menu";

/**
 * Why the picker is inert, in the order the user can do something about it.
 * Null means it can be changed.
 */
export function resolveEnvironmentIconPickerLock(input: {
  readonly serverConfig: ServerConfig | null;
  readonly operateAccess: "granted" | "denied" | "pending";
}): string | null {
  if (input.serverConfig === null) {
    return "Connect to this environment to change its icon.";
  }
  if (input.serverConfig.environment.capabilities.environmentIcon !== true) {
    return "This environment's server is too old to keep an icon. Update it to choose one.";
  }
  if (input.operateAccess !== "granted") {
    return "Your session on this environment cannot change its settings.";
  }
  return null;
}

export const ENVIRONMENT_ICON_GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly kinds: ReadonlyArray<EnvironmentMachineKind>;
}> = [
  {
    label: "Machines",
    kinds: [
      "server",
      "cloud",
      "desktop",
      "laptop",
      "mac-mini",
      "mac-studio",
      "raspberry-pi",
      "docker",
    ],
  },
  { label: "Systems", kinds: ["macos", "windows", "linux", "wsl"] },
  {
    label: "Linux distributions",
    kinds: ["debian", "ubuntu", "fedora", "arch", "mint", "opensuse", "nixos", "alpine"],
  },
];

// What servers that predate `environmentIconKinds` accept.
const LEGACY_ENVIRONMENT_ICON_KINDS: ReadonlyArray<EnvironmentMachineKind> = [
  "server",
  "cloud",
  "linux",
  "desktop",
  "laptop",
  "mac-mini",
  "mac-studio",
];

/**
 * The picker's sections, limited to kinds the environment's server can store
 * so an older server never receives a value it would reject.
 */
export function resolveEnvironmentIconGroups(serverConfig: ServerConfig | null) {
  const accepted: ReadonlyArray<string> =
    serverConfig?.environment.capabilities.environmentIconKinds ?? LEGACY_ENVIRONMENT_ICON_KINDS;
  return ENVIRONMENT_ICON_GROUPS.map((group) => ({
    label: group.label,
    kinds: group.kinds.filter((kind) => accepted.includes(kind)),
  })).filter((group) => group.kinds.length > 0);
}

/**
 * "Icon" submenu for an environment's row menu. Lists the machine kinds with
 * the server's own detection marked, so the user can tell whether detection
 * got it right before overriding. Picking the detected kind clears the
 * override. Locked environments show the reason as a disabled item instead of
 * hiding the submenu, so the current icon still reads.
 */
export function EnvironmentIconMenu({
  environmentId,
  serverConfig,
}: {
  readonly environmentId: EnvironmentId;
  readonly serverConfig: ServerConfig | null;
}) {
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const operateAccess = useEnvironmentScope(environmentId, AuthSettingsWriteScope)
    ? "granted"
    : "denied";
  const lock = resolveEnvironmentIconPickerLock({ serverConfig, operateAccess });
  // With no detection the server falls back to "server", so picking that
  // kind clears the override the same way picking the detected kind does.
  const detected = serverConfig?.environment.platform.machine ?? "server";
  const resolved = resolveEnvironmentMachineKind(serverConfig);

  return (
    <MenuSub>
      <MenuSubTrigger>
        <EnvironmentMachineIcon kind={resolved} />
        Icon
      </MenuSubTrigger>
      <MenuSubPopup>
        {lock !== null ? (
          <>
            <MenuItem disabled className="whitespace-normal">
              {lock}
            </MenuItem>
            <MenuSeparator />
          </>
        ) : null}
        <MenuRadioGroup
          value={resolved}
          onValueChange={(next) => {
            if (lock !== null || !isEnvironmentMachineKind(next)) return;
            updateSettings({ environmentIcon: next === detected ? null : next });
          }}
        >
          {resolveEnvironmentIconGroups(serverConfig).map((group, index) => (
            <Fragment key={group.label}>
              {index > 0 ? <MenuSeparator /> : null}
              <MenuGroup>
                <MenuGroupLabel>{group.label}</MenuGroupLabel>
                {group.kinds.map((kind) => (
                  <MenuRadioItem key={kind} value={kind} disabled={lock !== null}>
                    <span className="flex min-w-0 items-center gap-2">
                      <EnvironmentMachineIcon kind={kind} className="size-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        {ENVIRONMENT_MACHINE_KIND_LABELS[kind]}
                      </span>
                      {kind === detected ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {serverConfig?.environment.platform.machine ? "detected" : "default"}
                        </span>
                      ) : null}
                    </span>
                  </MenuRadioItem>
                ))}
              </MenuGroup>
            </Fragment>
          ))}
        </MenuRadioGroup>
      </MenuSubPopup>
    </MenuSub>
  );
}
