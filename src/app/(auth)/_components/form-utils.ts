export type Translator = (key: string) => string;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : null;
}

function firstString(record: UnknownRecord | null, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

export function getAuthError(result: unknown): string | undefined {
  const record = asRecord(result);
  const error = record?.error;
  if (typeof error === "string") return error;
  return firstString(asRecord(error), ["message", "code"]);
}

export function needsTwoFactor(result: unknown): boolean {
  const record = asRecord(result);
  const data = asRecord(record?.data);
  if (record?.twoFactorRedirect === true || data?.twoFactorRedirect === true) return true;
  const redirect = firstString(data ?? record, ["redirect", "redirectTo"]);
  return typeof redirect === "string" && redirect.includes("two-factor");
}

export type AuthErrorCode =
  "invalidCredentials" | "generic" | "weakPassword" | "emailTaken" | "rateLimited";

export function authErrorCode(message?: string | null): AuthErrorCode {
  const value = (message ?? "").toLowerCase();
  if (!value) return "generic";
  if (/rate.?limit|too many (attempts|requests)|try again later|429/.test(value))
    return "rateLimited";
  if (/already (exists|registered|in use)|duplicate|taken|email.*exist/.test(value))
    return "emailTaken";
  if (/weak|too short|too long|minimum|maximum|at least|password.*(require|must)/.test(value)) {
    return "weakPassword";
  }
  if (/invalid|incorrect|wrong|not found|unauthorized|bad credentials/.test(value)) {
    return "invalidCredentials";
  }
  return "generic";
}

export type ActionInfo = {
  status: "idle" | "success" | "error";
  message?: string;
  acceptUrl?: string;
};

export function readActionState(state: unknown): ActionInfo {
  const record = asRecord(state);
  if (!record) return { status: "idle" };

  const explicit = firstString(record, ["status", "state"]);
  const success =
    explicit === "success" || explicit === "ok" || record.success === true || record.ok === true;
  const failure = explicit === "error" || explicit === "failed" || record.error != null;
  const status = success ? "success" : failure ? "error" : "idle";

  const data = asRecord(record.data);
  const invitation = asRecord(record.invitation) ?? asRecord(data?.invitation);

  return {
    status,
    message:
      firstString(record, ["message", "error", "detail"]) ??
      firstString(data, ["message", "error"]),
    acceptUrl:
      firstString(record, [
        "acceptUrl",
        "acceptURL",
        "invitationUrl",
        "invitationURL",
        "url",
        "link",
      ]) ??
      firstString(data, [
        "acceptUrl",
        "acceptURL",
        "invitationUrl",
        "invitationURL",
        "url",
        "link",
      ]) ??
      firstString(invitation, ["acceptUrl", "acceptURL", "url", "link"]),
  };
}

export type TotpEnrollment = {
  totpURI: string;
  backupCodes: string[];
};

export function readTotpEnrollment(result: unknown): TotpEnrollment | null {
  const top = asRecord(result);
  const data = asRecord(top?.data) ?? top;
  const totpURI = firstString(data, ["totpURI", "totpUri", "uri", "secret"]);
  if (!totpURI) return null;

  const rawCodes = data?.backupCodes;
  const backupCodes = Array.isArray(rawCodes)
    ? rawCodes.flatMap((code) => {
        if (typeof code === "string") return [code];
        const codeRecord = asRecord(code);
        const value = firstString(codeRecord, ["code", "value"]);
        return value ? [value] : [];
      })
    : [];

  return { totpURI, backupCodes };
}

const ruleIds = new Set(["minLength", "maxLength", "number", "symbol", "lowercase", "uppercase"]);

function normalizeRuleId(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (/^(min|minlength|min_length|length)/.test(normalized)) return "minLength";
  if (/^(max|maxlength|max_length)/.test(normalized)) return "maxLength";
  if (/number|digit|numeric/.test(normalized)) return "number";
  if (/symbol|special/.test(normalized)) return "symbol";
  if (/lowercase|lower/.test(normalized)) return "lowercase";
  if (/uppercase|upper/.test(normalized)) return "uppercase";
  return undefined;
}

export function passwordRuleHints(rules: unknown, t: Translator): string[] {
  const hints = new Set<string>();

  if (Array.isArray(rules)) {
    for (const rule of rules) {
      if (rule && typeof rule === "object") {
        const record = rule as UnknownRecord;
        if (record.enabled === false || record.active === false || record.required === false)
          continue;
      }
      const key =
        typeof rule === "string"
          ? rule
          : firstString(asRecord(rule), ["id", "key", "rule", "name", "label"]);
      const id = key ? normalizeRuleId(key) : undefined;
      if (id) hints.add(t(`signUp.rules.${id}`));
    }
    return [...hints];
  }

  const record = asRecord(rules);
  if (!record) return [];
  for (const [key, value] of Object.entries(record)) {
    if (!value && value !== 0) continue;
    const id = normalizeRuleId(key);
    if (id && ruleIds.has(id)) hints.add(t(`signUp.rules.${id}`));
  }
  return [...hints];
}
