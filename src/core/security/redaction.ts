const SENSITIVE_KEYS = ["token", "secret", "password", "encrypt", "key", "authorization"];

export function redactSensitiveData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactSensitiveData(item),
      ]),
    );
  }

  return value;
}

export function redactJsonString(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(redactSensitiveData(parsed));
  } catch {
    return raw;
  }
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((item) => normalized.includes(item));
}
