/** When true (default), run legacy/start after handoff import or promote-to-stage. */
export function isLegacyHandoffAutoLegacyStartEnabled(): boolean {
  const v = process.env.LEGACY_HANDOFF_AUTO_LEGACY_START?.trim().toLowerCase();
  if (!v) return true;
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}
