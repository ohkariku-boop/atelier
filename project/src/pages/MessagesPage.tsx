import { useEffect, useState, useRef } from 'react';
import { Loader2, Send, MessageSquare, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { timeAgo } from '@/lib/theme';

interface MessagesPageProps {
  navigate: (path: string) => void;
  conversationId?: string;
}

interface ConversationRow {
  id: string;
  artwork_id: string | null;
  buyer_id: string;
  artist_user_id: string;
  updated_at: string;
  artwork_title?: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export function MessagesPage({ navigate, conversationId }: MessagesPageProps) {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(conversationId || null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, artwork_id, buyer_id, artist_user_id, updated_at')
        .order('updated_at', { ascending: false });
      if (error) {
        // Table may not exist yet
        setLoading(false);
        return;
      }
      const rows = (data || []) as ConversationRow[];
      const artworkIds = rows.map((r) => r.artwork_id).filter(Boolean) as string[];
      if (artworkIds.length) {
        const { data: arts } = await supabase.from('artworks').select('id, title').in('id', artworkIds);
        const map = new Map((arts || []).map((a: any) => [a.id, a.title]));
        rows.forEach((r) => {
          if (r.artwork_id) r.artwork_title = map.get(r.artwork_id);
        });
      }
      setConversations(rows);
      if (!activeId && rows[0]) setActiveId(rows[0].id);
      setLoading(false);
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeId || !session) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeId)
        .order('created_at', { ascending: true });
      setMessages((data || []) as MessageRow[]);
      channel = supabase
        .channel(`messages:${activeId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
          (payload) => setMessages((prev) => [...prev, payload.new as MessageRow])
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeId, session?.user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || !session) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      conversation_id: activeId,
      sender_id: session.user.id,
      body,
    });
    setSending(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    setDraft('');
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', activeId);
  };

  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="text-ink-400">Sign in to view messages.</p>
        <button onClick={() => navigate('auth')} className="btn-primary mt-4 text-sm">
          Sign In
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="w-5 h-5 text-accent-500" />
        <h1 className="font-serif text-2xl font-semibold">Messages</h1>
      </div>

      {conversations.length === 0 ? (
        <div className="card-surface p-10 text-center">
          <p className="text-ink-400">No conversations yet.</p>
          <p className="text-sm text-ink-500 mt-2">
            Open an auction and use “Message artist” to start a thread.
          </p>
          <button onClick={() => navigate('')} className="btn-secondary mt-6 text-sm">
            Browse Gallery
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-[240px_1fr] gap-4 min-h-[420px]">
          <aside className="border border-ink-200 dark:border-ink-800 overflow-y-auto max-h-[520px]">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-3 py-3 border-b border-ink-100 dark:border-ink-800 text-sm transition-colors ${
                  activeId === c.id
                    ? 'bg-ink-100 dark:bg-ink-800'
                    : 'hover:bg-ink-50 dark:hover:bg-ink-900'
                }`}
              >
                <p className="font-medium truncate">{c.artwork_title || 'Conversation'}</p>
                <p className="text-[10px] text-ink-400 mt-0.5">{timeAgo(c.updated_at)}</p>
              </button>
            ))}
          </aside>

          <div className="border border-ink-200 dark:border-ink-800 flex flex-col min-h-[420px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
              {messages.map((m) => {
                const mine = m.sender_id === session.user.id;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] px-3 py-2 text-sm ${
                        mine
                          ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                          : 'bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`text-[10px] mt-1 ${mine ? 'opacity-70' : 'text-ink-400'}`}>
                        {timeAgo(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-ink-200 dark:border-ink-800 p-3 flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                placeholder="Write a message…"
                className="flex-1 text-sm px-3 py-2 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 focus:outline-none"
                maxLength={4000}
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="btn-primary text-sm px-4 flex items-center gap-1.5"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
