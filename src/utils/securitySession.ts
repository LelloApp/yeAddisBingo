// 1-Hour Security PIN Session Manager for Owner, Super Admin, and Admin

const SESSION_DURATION_MS = 60 * 60 * 1000; // 1 Hour

export function getSecuritySession(role: 'owner' | 'super_admin' | 'admin', targetId?: string): boolean {
  try {
    const key = `sec_pin_session_${role}_${targetId || 'default'}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const now = Date.now();
    if (now - parsed.timestamp < SESSION_DURATION_MS) {
      return true;
    }
    localStorage.removeItem(key);
    return false;
  } catch {
    return false;
  }
}

export function setSecuritySession(role: 'owner' | 'super_admin' | 'admin', targetId?: string): void {
  try {
    const key = `sec_pin_session_${role}_${targetId || 'default'}`;
    localStorage.setItem(key, JSON.stringify({ timestamp: Date.now() }));
  } catch {
    // localstorage policy fallback
  }
}

export function clearSecuritySession(role: 'owner' | 'super_admin' | 'admin', targetId?: string): void {
  try {
    const key = `sec_pin_session_${role}_${targetId || 'default'}`;
    localStorage.removeItem(key);
  } catch {
    // localstorage fallback
  }
}
