/** Reviewed search-only backend from pi-web-access 0.35.0; unrelated extension types stay out of the app. */
export declare function callExaMcp(
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string>
