import { useEffect, useState, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { timeAgo } from '@/lib/theme';
import type { AppNotification } from '@/types';

interface NotificationBellProps {
  navigate: (path: string) => void;
}

/** Route the user to the most relevant page for a notification type. */
function destinationFor(n: AppNotification): string {
  switch (n.type) {
    case 'payment_due':
    case 'sale_pending_payment':
      return n.order_id ? 'orders' : 'studio';
    case 'seller_review':
    case 'auction_no_bids':
      return 'studio';
    default:
      if (n.order_id) return 'orders';
      if (n.artwork_id) return 'studio';
      return 'gallery';
  }
}

export function NotificationBell({ navigate }: NotificationBellProps) {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setNotifications(data || []));

    const channel = supabase
      .channel(`notifications:${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => setNotifications((prev) => [payload.new as AppNotification, ...prev])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpen = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unreadCount > 0) {
      await supabase.rpc('mark_all_notifications_read');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const handleClickNotification = (n: AppNotification) => {
    setOpen(false);
    navigate(destinationFor(n));
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-50 transition-colors"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 shadow-lg z-50">
          <div className="px-3 py-2 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-ink-400 font-semibold">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="text-[10px] text-accent-600 dark:text-accent-400 font-medium">
                {unreadCount} new
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-ink-500 p-4 text-center">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickNotification(n)}
                className={`w-full text-left p-3 border-b border-ink-100 dark:border-ink-800 hover:bg-ink-50 dark:hover:bg-ink-800 last:border-b-0 transition-colors ${
                  !n.read ? 'bg-accent-50/50 dark:bg-accent-900/10' : ''
                }`}
              >
                <p className="text-xs font-semibold leading-snug">{n.title}</p>
                <p className="text-xs text-ink-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                <p className="text-[10px] text-ink-400 mt-1">{timeAgo(n.created_at)}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
