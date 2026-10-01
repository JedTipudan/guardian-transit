import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import type { NotificationItem } from '../lib/types';
import { getSocket, onConnectionChange, type ConnectionState } from '../lib/socket';
import { useAuth } from './AuthContext';

export type BrowserPermission = 'unsupported' | 'default' | 'granted' | 'denied';

interface NotificationsContextValue {
  notifications: NotificationItem[];
  unread: number;
  loading: boolean;
  connection: ConnectionState;
  browserPermission: BrowserPermission;
  /** Must be called from a user gesture — never on page load. */
  requestBrowserPermission: () => Promise<BrowserPermission>;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function readPermission(): BrowserPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as BrowserPermission;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>(() => readPermission());

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      return;
    }
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        api.get<{ notifications: NotificationItem[] }>('/notifications', { query: { limit: 40 } }),
        api.get<{ count: number }>('/notifications/unread-count'),
      ]);
      setNotifications(list.notifications);
      setUnread(count.count);
    } catch {
      /* the socket stream keeps the UI honest even if this poll fails */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onConnectionChange(setConnection), []);

  // Live updates pushed by the server.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    const onNew = (notification: NotificationItem) => {
      setNotifications((current) => [notification, ...current].slice(0, 60));
      setUnread((count) => count + 1);
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const body = new Notification(notification.title, { body: notification.body, tag: notification.id });
          body.onclick = () => {
            window.focus();
            body.close();
          };
        } catch {
          /* some platforms block construction; the in-app feed still shows it */
        }
      }
    };

    const onRead = (payload: { id: string }) => {
      setNotifications((current) =>
        current.map((item) => (item.id === payload.id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)),
      );
      setUnread((count) => Math.max(0, count - 1));
    };

    const onReadAll = () => {
      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnread(0);
    };

    socket.on('notification:new', onNew);
    socket.on('notification:read', onRead);
    socket.on('notification:read-all', onReadAll);

    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:read', onRead);
      socket.off('notification:read-all', onReadAll);
    };
  }, [user]);

  const requestBrowserPermission = useCallback(async (): Promise<BrowserPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      const next = result as BrowserPermission;
      setBrowserPermission(next);
      await api.post('/notifications/permission', { permission: next }).catch(() => undefined);
      return next;
    } catch {
      return 'denied';
    }
  }, []);

  const markRead = useCallback(
    async (id: string) => {
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)),
      );
      setUnread((count) => Math.max(0, count - 1));
      try {
        await api.post(`/notifications/${id}/read`);
      } catch {
        await refresh();
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnread(0);
    try {
      await api.post('/notifications/read-all');
    } catch {
      await refresh();
    }
  }, [refresh]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unread,
      loading,
      connection,
      browserPermission,
      requestBrowserPermission,
      refresh,
      markRead,
      markAllRead,
    }),
    [
      notifications,
      unread,
      loading,
      connection,
      browserPermission,
      requestBrowserPermission,
      refresh,
      markRead,
      markAllRead,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return context;
}
