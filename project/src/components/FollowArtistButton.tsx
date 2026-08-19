import { useEffect, useState } from 'react';
import { UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

interface FollowArtistButtonProps {
  artistId: string;
  className?: string;
}

export function FollowArtistButton({ artistId, className = '' }: FollowArtistButtonProps) {
  const { session } = useAuth();
  const { showToast } = useToast();
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session?.user?.id || !artistId) {
      setLoading(false);
      return;
    }
    supabase
      .from('artist_follows')
      .select('artist_id')
      .eq('user_id', session.user.id)
      .eq('artist_id', artistId)
      .maybeSingle()
      .then(({ data }) => {
        setFollowing(!!data);
        setLoading(false);
      });
  }, [session?.user?.id, artistId]);

  const toggle = async () => {
    if (!session) {
      showToast('Sign in to follow artists.', 'error');
      return;
    }
    setBusy(true);
    if (following) {
      const { error } = await supabase
        .from('artist_follows')
        .delete()
        .eq('user_id', session.user.id)
        .eq('artist_id', artistId);
      if (error) showToast(error.message, 'error');
      else setFollowing(false);
    } else {
      const { error } = await supabase.from('artist_follows').insert({
        user_id: session.user.id,
        artist_id: artistId,
      });
      if (error) showToast(error.message, 'error');
      else {
        setFollowing(true);
        showToast('Following artist', 'success');
      }
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <button className={`btn-secondary text-xs opacity-50 ${className}`} disabled>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`${following ? 'btn-secondary' : 'btn-primary'} text-xs flex items-center gap-1.5 ${className}`}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : following ? (
        <UserCheck className="w-3.5 h-3.5" />
      ) : (
        <UserPlus className="w-3.5 h-3.5" />
      )}
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
