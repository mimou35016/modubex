const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const TOKEN_PATTERN = /\b[a-f0-9]{32,}\b/gi;

/** Keeps delivery diagnostics useful without exposing signed links or tokens. */
export function redactMailSecrets(value: string): string {
  return value.replace(URL_PATTERN, "[redacted-url]").replace(TOKEN_PATTERN, "[redacted-token]");
}
