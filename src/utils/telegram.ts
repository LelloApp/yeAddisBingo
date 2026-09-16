import WebApp from '@twa-dev/sdk';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramAppInit {
  user: TelegramUser | null;
  startParam: string | null;
  groupIdFromParam: string | null;
  roomIdFromParam: string | null;
  adminIdFromParam: string | null;
  isAvailable: boolean;
  platform: string;
}

export function initTelegramApp(): TelegramAppInit {
  let user: TelegramUser | null = null;
  let startParam: string | null = null;
  let isAvailable = false;
  let platform = 'unknown';
  let adminIdFromParam: string | null = null;
  let roomIdFromParam: string | null = null;

  if (typeof window !== 'undefined') {
    try {
      if (WebApp) {
        WebApp.ready();
        WebApp.expand(); // Make mini app fill full screen

        // Prevent accidental swipe-down closure on iOS
        WebApp.enableClosingConfirmation();

        isAvailable = true;
        platform = WebApp.platform || 'unknown';

        if (WebApp.initDataUnsafe?.user) {
          const u = WebApp.initDataUnsafe.user;
          user = {
            id: u.id,
            first_name: u.first_name,
            last_name: u.last_name,
            username: u.username,
            language_code: u.language_code,
            photo_url: u.photo_url,
          };
        }

        // 1. Get from WebApp SDK
        if (WebApp.initDataUnsafe?.start_param) {
          startParam = WebApp.initDataUnsafe.start_param;
        }
      }

      // 2. Fallback check: URL query parameters (?tgWebAppStartParam=... or ?startapp=... or ?room=... or ?admin=...)
      const urlParams = new URLSearchParams(window.location.search);
      if (!startParam) {
        startParam = urlParams.get('tgWebAppStartParam') || urlParams.get('startapp') || urlParams.get('room') || urlParams.get('group');
      }
      roomIdFromParam = urlParams.get('room') || urlParams.get('group');
      adminIdFromParam = urlParams.get('admin');

      // 3. Fallback check: URL hash fragment
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        if (!startParam) {
          startParam = hashParams.get('tgWebAppStartParam') || hashParams.get('startapp');
        }
        if (!roomIdFromParam) roomIdFromParam = hashParams.get('room') || hashParams.get('group');
        if (!adminIdFromParam) adminIdFromParam = hashParams.get('admin');
      }
    } catch (e) {
      console.error('Error initializing Telegram WebApp SDK:', e);
    }
  }

  // Parse group/room slug if format is 'group_<slug>' or 'room_<slug>'
  let groupIdFromParam: string | null = roomIdFromParam;
  if (startParam) {
    if (startParam.startsWith('group_')) {
      groupIdFromParam = startParam.replace('group_', '');
    } else if (startParam.startsWith('room_')) {
      groupIdFromParam = startParam.replace('room_', '');
    } else if (!groupIdFromParam) {
      groupIdFromParam = startParam;
    }
  }

  return {
    user,
    startParam,
    groupIdFromParam,
    roomIdFromParam: groupIdFromParam,
    adminIdFromParam,
    isAvailable,
    platform,
  };
}

// Telegram Haptic Feedback
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'medium') {
  try {
    if (WebApp?.HapticFeedback) {
      if (['light', 'medium', 'heavy'].includes(type)) {
        WebApp.HapticFeedback.impactOccurred(type as 'light' | 'medium' | 'heavy');
      } else {
        WebApp.HapticFeedback.notificationOccurred(type as 'error' | 'success' | 'warning');
      }
    }
  } catch {
    // Ignore if not in mobile Telegram client
  }
}

// Backward-compatible alias
export const initTelegram = initTelegramApp;

export function getTelegramDisplayName(user: TelegramUser | null): string {
  if (!user) return '';
  if (user.username) {
    return `@${user.username}`;
  }
  return user.first_name + (user.last_name ? ` ${user.last_name}` : '');
}

export function closeTelegramApp(): void {
  try {
    if (WebApp) {
      WebApp.close();
    }
  } catch (error) {
    console.error('Error closing Telegram Web App:', error);
  }
}

export function showTelegramAlert(message: string): void {
  try {
    if (WebApp) {
      WebApp.showAlert(message);
    } else {
      alert(message);
    }
  } catch (error) {
    console.error('Error showing Telegram alert:', error);
    alert(message);
  }
}

export function enableTelegramClosingConfirmation(): void {
  try {
    if (WebApp) {
      WebApp.enableClosingConfirmation();
    }
  } catch (error) {
    console.error('Error enabling closing confirmation:', error);
  }
}

export function disableTelegramClosingConfirmation(): void {
  try {
    if (WebApp) {
      WebApp.disableClosingConfirmation();
    }
  } catch (error) {
    console.error('Error disabling closing confirmation:', error);
  }
}

