import { useCallback, useEffect, useState } from "react";
import { fetchEnabledProviderInstances } from "@/lib/provider-instances-api";
import {
  fetchProviderCatalog,
  fetchUserAISettings,
  fetchUserProviderConfigs,
} from "@/lib/user-providers-api";
import { getStoredUser } from "@/utils/apiClient";
import {
  resolveDisplayVisionModel,
  resolveEffectiveProvider,
  type DisplayVisionModel,
  type EffectiveProviderInfo,
} from "@/utils/resolve-effective-provider";
import type { ProviderCatalogEntry } from "@/types/user-providers";

interface ActiveProviderState {
  info: EffectiveProviderInfo;
  catalog: ProviderCatalogEntry[];
  vision: DisplayVisionModel;
  loading: boolean;
  error: string | null;
}

const EMPTY: EffectiveProviderInfo = {
  source: "none",
  instance: null,
  personalConfig: null,
};

const EMPTY_VISION: DisplayVisionModel = {
  supportsVision: false,
  model: null,
  source: null,
};

function buildVisionDisplay(
  info: EffectiveProviderInfo,
  catalog: ProviderCatalogEntry[],
): DisplayVisionModel {
  const providerType =
    info.instance?.providerType ?? info.personalConfig?.provider ?? null;
  const catalogEntry = catalog.find((entry) => entry.id === providerType);
  const chatModel = info.instance?.chatModel ?? info.personalConfig?.chatModel ?? null;
  const visionModel = info.instance?.visionModel ?? info.personalConfig?.visionModel ?? null;
  const extras = info.instance?.extras ?? info.personalConfig?.extras ?? null;
  return resolveDisplayVisionModel(
    providerType,
    chatModel,
    visionModel,
    extras,
    catalogEntry,
  );
}

export function useActiveProviderInfo() {
  const [state, setState] = useState<ActiveProviderState>({
    info: EMPTY,
    catalog: [],
    vision: EMPTY_VISION,
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [instances, settings, configs, catalog] = await Promise.all([
        fetchEnabledProviderInstances(),
        fetchUserAISettings(),
        fetchUserProviderConfigs(),
        fetchProviderCatalog(),
      ]);
      const info = resolveEffectiveProvider(
        instances,
        settings,
        configs,
        getStoredUser()?.id,
      );
      setState({
        info,
        catalog,
        vision: buildVisionDisplay(info, catalog),
        loading: false,
        error: null,
      });
    } catch (e) {
      setState({
        info: EMPTY,
        catalog: [],
        vision: EMPTY_VISION,
        loading: false,
        error: e instanceof Error ? e.message : "No se pudo cargar el proveedor",
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}
