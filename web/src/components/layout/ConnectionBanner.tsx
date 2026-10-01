import { useNotifications } from '../../state/NotificationsContext';
import { Icon } from '../Icon';

/**
 * Honest connectivity feedback. Live location is only ever advertised while
 * the socket is actually online — offline means "reconnecting", never "live".
 */
export function ConnectionBanner() {
  const { connection, browserPermission, requestBrowserPermission } = useNotifications();

  return (
    <>
      {connection === 'offline' || connection === 'connecting' ? (
        <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-[12px] font-semibold text-warning">
          <Icon name="wifi-off" size={15} />
          {connection === 'connecting' ? 'Reconnecting to live updates…' : 'Connection lost — live updates are paused.'}
        </div>
      ) : null}

      {browserPermission === 'default' ? (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-primary-soft px-4 py-2 text-[12px] text-primary">
          <Icon name="bell" size={15} />
          <span>Get trip and safety alerts as browser notifications.</span>
          <button
            type="button"
            onClick={() => void requestBrowserPermission()}
            className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-white"
          >
            Enable notifications
          </button>
        </div>
      ) : null}
    </>
  );
}
