const MEO_TOKEN_STORAGE_KEY = "meo_person_token";
const MEO_USER_STORAGE_KEY = "meo_user_id";
const DEFAULT_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

type StoredMeoToken = {
  token: string;
  userId?: string;
  expiresAt: number;
};

function decodeJwtExpiry(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function readStoredToken(): StoredMeoToken | null {
  const rawValue = localStorage.getItem(MEO_TOKEN_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as StoredMeoToken;
    if (!parsed.token || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeMeoToken(token: string, userId?: string) {
  const expiresAt = decodeJwtExpiry(token) ?? Date.now() + DEFAULT_TOKEN_LIFETIME_MS;

  const value: StoredMeoToken = {
    token,
    userId,
    expiresAt,
  };

  localStorage.setItem(MEO_TOKEN_STORAGE_KEY, JSON.stringify(value));

  if (userId) {
    localStorage.setItem(MEO_USER_STORAGE_KEY, userId);
  }
}

export function getMeoToken() {
  return readStoredToken()?.token ?? null;
}

export function getMeoUserId() {
  return localStorage.getItem(MEO_USER_STORAGE_KEY);
}

export function isMeoTokenValid() {
  const storedToken = readStoredToken();
  if (!storedToken?.token) return false;
  return storedToken.expiresAt > Date.now();
}

export function clearMeoTokens() {
  localStorage.removeItem(MEO_TOKEN_STORAGE_KEY);
  localStorage.removeItem(MEO_USER_STORAGE_KEY);
}
