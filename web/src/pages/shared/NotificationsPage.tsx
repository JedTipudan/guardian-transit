import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, EmptyState, PageLoader, SegmentedControl } from '../../components/ui';
import { useNotifications } from '../../state/NotificationsContext';
import { useAuth } from '../../state/AuthContext';
import { formatDate, relativeTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { NotificationItem } from '../../lib/types';

function iconForType(type: string): string {
  if (type.includes('EMERGENCY') || type.includes('SOS')) return 'siren';
  if (type.includes('RIDE')) return 'car';
  if (type.includes('VERIFICATION')) return 'file-check';
  if (type.includes('REWARD') || type.includes('POINT')) return 'star';
  if (type.includes('REPORT')) return 'shield-alert';
  if (type.includes('SECURITY') || type.includes('LOGIN')) return 'shield-check';
  if (type.includes('GUARDIAN') || type.includes('CONNECTION')) return 'users';
  return 'bell';
}

function NotificationRow({
  item,
  onRead,
  to,
}: {
  item: NotificationItem;
  onRead: (id: string) => void;
  to?: string;
}) {
  const unread = !item.readAt;
  const body = (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${
          unread ? 'bg-primary-soft text-primary' : 'bg-canvas-alt text-muted'
        }`}
      >
        <Icon name={iconForType(item.type)} size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-[13px] leading-[1.5] ${unread ? 'font-bold text-heading' : 'font-semibold text-heading/90'}`}>
            {item.title}
          </p>
          <span className="shrink-0 text-[11px] text-muted">{relativeTime(item.createdAt)}</span>
        </div>
        <p className="mt-1 text-[12px] leading-[1.6] text-muted">{item.body}</p>
        <p className="mt-1.5 text-[11px] text-muted">{formatDate(item.createdAt)}</p>
      </div>
      {unread ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
    </div>
  );

  const rowClass =
    'block w-full rounded-[20px] border border-border bg-white p-4 text-left shadow-card transition hover:border-primary/40';

  if (to) {
    return (
      <Link to={to} onClick={() => onRead(item.id)} className={rowClass}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onRead(item.id)}
      className={`${rowClass} cursor-pointer`}
    >
      {body}
    </button>
  );
}

export default function NotificationsPage() {
  useDocumentTitle('Notifications · Guardian Transit');
  const { user } = useAuth();
  const {
    notifications,
    unread,
    loading,
    browserPermission,
    requestBrowserPermission,
    refresh,
    markRead,
    markAllRead,
  } = useNotifications();

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [permissionBusy, setPermissionBusy] = useState(false);

  const visible = useMemo(
    () => (filter === 'unread' ? notifications.filter((item) => !item.readAt) : notifications),
    [notifications, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const item of visible) {
      const key = formatDate(item.createdAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return Array.from(map.entries());
  }, [visible]);

  const rideLink = (item: NotificationItem): string | undefined => {
    const rideId = item.rideId ?? (item.data?.rideId as string | undefined);
    if (!rideId) return undefined;
    if (user?.role === 'STUDENT') return `/student/ride/${rideId}`;
    if (user?.role === 'DRIVER') return `/driver/ride/${rideId}`;
    if (user?.role === 'ADMIN') return `/admin/rides?ride=${rideId}`;
    return `/parent/ride/${rideId}`;
  };

  async function onEnableBrowserNotifications() {
    setPermissionBusy(true);
    try {
      await requestBrowserPermission();
    } finally {
      setPermissionBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[840px] flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[24px] font-bold leading-[1.2] text-heading">Notifications</h1>
          <p className="text-[13px] text-muted">
            {unread > 0 ? `You have ${unread} unread update${unread === 1 ? '' : 's'}.` : 'You are all caught up.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: `Unread${unread ? ` (${unread})` : ''}` },
            ]}
          />
          <Button variant="secondary" size="sm" icon="refresh-cw" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="check-check"
            onClick={() => void markAllRead()}
            disabled={unread === 0}
          >
            Mark all read
          </Button>
        </div>
      </div>

      {browserPermission !== 'granted' && browserPermission !== 'unsupported' ? (
        <div className="gt-notice gt-notice-primary">
          <Icon name="bell-ring" size={18} className="mt-0.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="mb-1 font-bold text-heading">
              {browserPermission === 'denied' ? 'Browser alerts are blocked' : 'Get alerts outside this tab'}
            </p>
            <p className="text-[12px] text-muted">
              {browserPermission === 'denied'
                ? 'Your browser is blocking notifications for this site. You can re-enable them in your browser settings.'
                : 'Allow notifications to hear about driver arrivals, trip updates and safety alerts even when this tab is in the background.'}
            </p>
            {browserPermission === 'default' ? (
              <Button
                variant="secondary"
                size="sm"
                icon="bell"
                className="mt-3"
                loading={permissionBusy}
                onClick={() => void onEnableBrowserNotifications()}
              >
                Enable browser notifications
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading && notifications.length === 0 ? (
        <PageLoader label="Loading notifications…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="bell-off"
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'Everything has been read. Switch to “All” to review past updates.'
              : 'Trip updates, safety alerts and reward milestones will appear here.'
          }
          action={
            filter === 'unread' ? (
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([day, items]) => (
            <section key={day} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted">{day}</h2>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    onRead={(id) => {
                      if (!item.readAt) void markRead(id);
                    }}
                    to={rideLink(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted">
        Need to change how often you hear from us? Manage alert preferences from your{' '}
        <Link to={user?.role === 'STUDENT' ? '/student/profile' : user?.role === 'DRIVER' ? '/driver/profile' : '/parent/profile'} className="font-semibold text-primary hover:underline">
          profile
        </Link>
        .
      </p>
    </div>
  );
}
