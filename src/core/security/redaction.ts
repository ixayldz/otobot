const SECRET_PATTERNS = [
  /(api[_-]?key)\s*[:=]\s*[^\s]+/gi,
  /(token)\s*[:=]\s*[^\s]+/gi,
  /(password)\s*[:=]\s*[^\s]+/gi,
  /(authorization:\s*bearer\s+)[^\s]+/gi,
  /\bsk-[A-Za-z0-9-_]{16,}\b/g,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
];

const EMAIL_PATTERN = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

export function redactSecrets(input: string): string {
  let output = input;

  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (_m, prefix?: string) => {
      if (prefix) {
        return `${prefix}=<redacted>`;
      }
      return "<redacted>";
    });
  }

  output = output.replace(EMAIL_PATTERN, (_m, first, domain) => `${first}***@${domain}`);

  return output;
}

export function sanitizeObject<T>(value: T): T {
  const text = JSON.stringify(value);
  const redacted = redactSecrets(text);
  return JSON.parse(redacted) as T;
}
