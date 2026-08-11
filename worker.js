/**
 * Reel Saver backend — a Cloudflare Worker.
 *
 * Resolves a public Instagram reel/post to its highest-resolution MP4 and
 * streams the bytes back with permissive CORS headers, so the Reel Saver page
 * can download it directly. Nothing is stored and nothing is logged.
 *
 * Deploy: see SETUP-WORKER.md. Usage: GET /?url=<instagram reel url>
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const IG_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Mode": "navigate",
};

function shortcodeOf(raw) {
  try {
    const u = new URL(raw);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function pickLargest(candidates) {
  // Instagram lists several renditions; take the one with the most pixels.
  return candidates
    .filter(c => c && c.url)
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
}

// Strategy 1: the public embed page carries "video_url" for most reels.
async function fromEmbed(code) {
  const res = await fetch(`https://www.instagram.com/reel/${code}/embed/captioned/`, {
    headers: IG_HEADERS,
  });
  if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/"video_url"\s*:\s*"([^"]+)"/) ||
            html.match(/"contentUrl"\s*:\s*"([^"]+)"/);
  if (!m) throw new Error("embed page had no video_url");
  return JSON.parse(`"${m[1]}"`);
}

// Strategy 2: the public GraphQL endpoint, which returns every rendition.
async function fromGraphql(code) {
  const body = new URLSearchParams({
    doc_id: "10015901848480474",
    variables: JSON.stringify({ shortcode: code }),
  });
  const res = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: {
      ...IG_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-IG-App-ID": "936619743392459",
    },
    body,
  });
  if (!res.ok) throw new Error(`graphql HTTP ${res.status}`);
  const json = await res.json();
  const media = json?.data?.xdt_shortcode_media;
  if (!media) throw new Error("graphql returned no media (post may be private)");
  if (!media.is_video) throw new Error("that post is not a video");

  const best = pickLargest(media.video_versions || []);
  return (best && best.url) || media.video_url;
}

async function resolve(code) {
  const errors = [];
  for (const strategy of [fromGraphql, fromEmbed]) {
    try {
      const url = await strategy(code);
      if (url) return url;
    } catch (e) {
      errors.push(e.message);
    }
  }
  throw new Error(errors.join("; ") || "could not resolve");
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) {
      return new Response(
        "Reel Saver backend is running.\n\nUsage: ?url=https://www.instagram.com/reel/XXXX/\n",
        { headers: { ...CORS, "Content-Type": "text/plain" } },
      );
    }

    const code = shortcodeOf(target);
    if (!code) {
      return new Response(JSON.stringify({ error: "not an Instagram reel or post URL" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let videoUrl;
    try {
      videoUrl = await resolve(code);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e.message || e) }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Stream the media through, forwarding Range so the player can seek.
    const range = request.headers.get("Range");
    const upstream = await fetch(videoUrl, {
      headers: {
        ...IG_HEADERS,
        Referer: "https://www.instagram.com/",
        ...(range ? { Range: range } : {}),
      },
    });
    if (!upstream.ok && upstream.status !== 206) {
      return new Response(JSON.stringify({ error: `CDN HTTP ${upstream.status}` }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const headers = new Headers(CORS);
    headers.set("Content-Type", "video/mp4");
    headers.set("Content-Disposition", `attachment; filename="${code}.mp4"`);
    headers.set("Accept-Ranges", "bytes");
    for (const h of ["Content-Length", "Content-Range"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
