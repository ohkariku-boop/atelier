// Automated artwork image verification:
// - HTTP reachability + content-type
// - duplicate URL detection
// - optional OpenAI Vision medium match when OPENAI_API_KEY is set
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: OPENAI_API_KEY
// Call with service role or admin JWT.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ArtworkRow = {
  id: string;
  title: string;
  medium: string | null;
  image_url: string | null;
};

async function probeImage(url: string): Promise<{ ok: boolean; contentType?: string; error?: string }> {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (head.ok) {
      const ct = head.headers.get('content-type') || undefined;
      if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
        // some CDNs omit image/* on HEAD — try GET range
      } else if (ct?.startsWith('image/')) {
        return { ok: true, contentType: ct };
      }
    }
    const get = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      redirect: 'follow',
    });
    if (!get.ok && get.status !== 206) {
      return { ok: false, error: `HTTP ${get.status}` };
    }
    const ct = get.headers.get('content-type') || undefined;
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream') && !ct.includes('webp')) {
      return { ok: false, error: `Not an image: ${ct}`, contentType: ct };
    }
    return { ok: true, contentType: ct };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function mediumFamily(medium: string | null): string {
  const m = (medium || '').toLowerCase();
  if (/ceramic|clay|raku|terracotta|earthen|porcelain|stoneware/.test(m)) return 'ceramic';
  if (/wood|oak|walnut|teak|cedar|maple|timber/.test(m) && !/panel/.test(m)) return 'wood';
  if (/charcoal|graphite|pencil|ink drawing/.test(m)) return 'drawing';
  if (/photo|giclée|giclee|print|digital/.test(m)) return 'print';
  if (/oil|acrylic|tempera|gouache|pastel|canvas|linen|impasto|mixed/.test(m)) return 'painting';
  return 'other';
}

async function visionMediumCheck(
  imageUrl: string,
  medium: string | null,
  title: string
): Promise<{ match: boolean; notes: string }> {
  if (!OPENAI_API_KEY) {
    return { match: true, notes: 'vision_skipped_no_key' };
  }
  const family = mediumFamily(medium);
  const prompt = `You verify art listing images for an auction house.
Artwork title: "${title}"
Listed medium: "${medium || 'unknown'}"
Expected family: ${family}

Look at the image. Reply ONLY JSON:
{"match":boolean,"seen":"short description","reason":"one sentence"}
match=true if the image plausibly shows that medium family
(ceramic=pottery/clay object, wood=wooden object/carving, painting=painted artwork on support, drawing=charcoal/graphite work, print=print/digital flat art).
match=false for food, plants-only, random stock unrelated to the medium, or clear mismatch.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { match: true, notes: `vision_error:${res.status}:${t.slice(0, 120)}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { match: true, notes: 'vision_parse_fail' };
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      match: !!parsed.match,
      notes: `${parsed.seen || ''} — ${parsed.reason || ''}`.trim(),
    };
  } catch (e) {
    return { match: true, notes: `vision_exception:${(e as Error).message}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Prefer admin user; allow service role bearer
    let allowed = false;
    if (authHeader.includes(SERVICE_ROLE_KEY)) {
      allowed = true;
    } else if (authHeader) {
      const userClient = createClient(SUPABASE_URL, ANON || SERVICE_ROLE_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) {
        const { data: prof } = await admin
          .from('profiles')
          .select('role')
          .eq('id', userData.user.id)
          .maybeSingle();
        if (prof?.role === 'admin') allowed = true;
      }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    let body: { artwork_ids?: string[]; use_vision?: boolean; limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    const useVision = body.use_vision !== false; // default on if key present
    const limit = Math.min(body.limit || 100, 200);

    let q = admin
      .from('artworks')
      .select('id, title, medium, image_url')
      .order('title')
      .limit(limit);
    if (body.artwork_ids?.length) {
      q = admin
        .from('artworks')
        .select('id, title, medium, image_url')
        .in('id', body.artwork_ids);
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const list = (rows || []) as ArtworkRow[];
    const urlCount = new Map<string, number>();
    for (const r of list) {
      if (!r.image_url) continue;
      urlCount.set(r.image_url, (urlCount.get(r.image_url) || 0) + 1);
    }

    const summary = {
      total: list.length,
      ok: 0,
      broken: 0,
      duplicate: 0,
      mismatch: 0,
      error: 0,
      vision_enabled: !!(OPENAI_API_KEY && useVision),
      results: [] as Array<Record<string, unknown>>,
    };

    for (const row of list) {
      const result: Record<string, unknown> = {
        id: row.id,
        title: row.title,
        medium: row.medium,
      };

      if (!row.image_url) {
        await admin
          .from('artworks')
          .update({
            image_status: 'broken',
            image_verified_at: new Date().toISOString(),
            image_verify_notes: 'Missing image_url',
            image_content_type: null,
          })
          .eq('id', row.id);
        summary.broken++;
        result.status = 'broken';
        result.notes = 'Missing image_url';
        summary.results.push(result);
        continue;
      }

      const probe = await probeImage(row.image_url);
      if (!probe.ok) {
        await admin
          .from('artworks')
          .update({
            image_status: 'broken',
            image_verified_at: new Date().toISOString(),
            image_verify_notes: probe.error || 'unreachable',
            image_content_type: probe.contentType || null,
          })
          .eq('id', row.id);
        summary.broken++;
        result.status = 'broken';
        result.notes = probe.error;
        summary.results.push(result);
        continue;
      }

      const dup = (urlCount.get(row.image_url) || 0) > 1;
      if (dup) {
        await admin
          .from('artworks')
          .update({
            image_status: 'duplicate',
            image_verified_at: new Date().toISOString(),
            image_verify_notes: 'Same image_url used on multiple artworks',
            image_content_type: probe.contentType || null,
          })
          .eq('id', row.id);
        summary.duplicate++;
        result.status = 'duplicate';
        summary.results.push(result);
        continue;
      }

      if (OPENAI_API_KEY && useVision) {
        const vision = await visionMediumCheck(row.image_url, row.medium, row.title);
        if (!vision.match && !vision.notes.startsWith('vision_error') && !vision.notes.startsWith('vision_exception')) {
          await admin
            .from('artworks')
            .update({
              image_status: 'mismatch',
              image_verified_at: new Date().toISOString(),
              image_verify_notes: vision.notes,
              image_content_type: probe.contentType || null,
            })
            .eq('id', row.id);
          summary.mismatch++;
          result.status = 'mismatch';
          result.notes = vision.notes;
          summary.results.push(result);
          continue;
        }
        if (vision.notes.startsWith('vision_error') || vision.notes.startsWith('vision_exception')) {
          // don't fail the lot — mark ok with note
          await admin
            .from('artworks')
            .update({
              image_status: 'ok',
              image_verified_at: new Date().toISOString(),
              image_verify_notes: vision.notes,
              image_content_type: probe.contentType || null,
            })
            .eq('id', row.id);
          summary.ok++;
          result.status = 'ok';
          result.notes = vision.notes;
          summary.results.push(result);
          continue;
        }
        await admin
          .from('artworks')
          .update({
            image_status: 'ok',
            image_verified_at: new Date().toISOString(),
            image_verify_notes: vision.notes || 'ok',
            image_content_type: probe.contentType || null,
          })
          .eq('id', row.id);
        summary.ok++;
        result.status = 'ok';
        result.notes = vision.notes;
        summary.results.push(result);
        continue;
      }

      await admin
        .from('artworks')
        .update({
          image_status: 'ok',
          image_verified_at: new Date().toISOString(),
          image_verify_notes: 'reachable',
          image_content_type: probe.contentType || null,
        })
        .eq('id', row.id);
      summary.ok++;
      result.status = 'ok';
      summary.results.push(result);
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
