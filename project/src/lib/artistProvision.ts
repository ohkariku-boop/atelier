import { supabase } from '@/lib/supabase';

/**
 * Ensure the current user has an artists row linked on profiles.artist_id.
 * Safe to call repeatedly (returns existing id).
 */
export async function ensureArtistProfile(displayName?: string): Promise<{
  artistId?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('ensure_artist_profile', {
    p_display_name: displayName || null,
  });

  if (error) {
    // Fallback: client-side provision if RPC not migrated yet
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: error.message };

    const { data: profile } = await supabase
      .from('profiles')
      .select('artist_id, role, display_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.artist_id) return { artistId: profile.artist_id };

    if (profile?.role !== 'artist' && profile?.role !== 'admin') {
      return { error: error.message };
    }

    const name = displayName || profile.display_name || 'Artist';
    const { data: artist, error: aErr } = await supabase
      .from('artists')
      .insert({
        name,
        studio_verified: false,
        biography: `${name} — studio on Atelier.`,
        creative_philosophy: 'Made by human hands.',
      })
      .select('id')
      .single();

    if (aErr || !artist) return { error: aErr?.message || 'Failed to create artist' };

    const { error: pErr } = await supabase
      .from('profiles')
      .update({ artist_id: artist.id, role: 'artist' })
      .eq('id', user.id);

    if (pErr) return { error: pErr.message };
    return { artistId: artist.id };
  }

  return { artistId: data as string };
}
