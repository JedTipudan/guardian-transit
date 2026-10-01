import { StudentHeader } from '../../components/layout/StudentShell';
import { Icon } from '../../components/Icon';
import { useDocumentTitle } from '../../lib/hooks';
import { useNotifications } from '../../state/NotificationsContext';
import NotificationsPage from '../shared/NotificationsPage';

/** Student notifications: the shared feed inside the student app bar. */
export default function StudentNotifications() {
  useDocumentTitle('Notifications · Guardian Transit');
  const { unread, loading, refresh } = useNotifications();

  return (
    <>
      <StudentHeader
        title="Notifications"
        subtitle={loading ? 'Checking for updates…' : `${unread} unread`}
        backTo="/student"
        right={
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh notifications"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-border text-heading transition hover:bg-canvas-alt"
          >
            <Icon name="refresh-cw" size={17} />
          </button>
        }
      />

      <div className="px-5 pb-7 pt-[18px]">
        <NotificationsPage />
      </div>
    </>
  );
}
