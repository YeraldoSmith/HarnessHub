/**
 * Tauri's optional `isTauri` global is disabled unless `withGlobalTauri` is
 * enabled in the application configuration. Command IPC is nevertheless
 * available through this internal bridge, so detect the capability that the
 * Desktop client actually needs instead of a presentation-only global flag.
 */
export function isHarnessHubDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
