/**
 * Reel Saver backend — a Cloudflare Worker.
 *
 * Resolves a public Instagram reel/post to its highest-resolution MP4 and
 * streams the bytes back with permissive CORS headers, so the Reel Saver page
 * can download it directly. Nothing is stored and nothing is logged.
 *
 * Deploy: see SETUP-WORKER.md.
 * Usage:  GET /?url=<instagram reel url>
 *         GET /?url=<...>&debug=1   → JSON showing what each strategy returned
 */

const WEB_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
               "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const APP_UA = "Instagram 269.0.0.18.75 Android (26/8.0.0; 480dpi; 1080x1920; " +
               "Xiaomi; MI 5s; capricorn; qcom; en_US; 314665256)";
const IG_APP_ID = "936619743392459";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const WEB_HEADERS = {
  "User-Agent": WEB_UA,
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Mode": "navigate",
};

// Instagram refuses most unauthenticated requests from datacenter addresses.
// A session cookie, supplied as the IG_SESSIONID secret, makes them succeed.
function authHeaders(env) {
  const sid = env && env.IG_SESSIONID;
  return sid ? { Cookie: `sessionid=${sid}` } : {};
}

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

// Instagram shortcodes are base64 (URL-safe alphabet) encodings of the media id.
function shortcodeToMediaId(code) {
  const ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = 0n;
  for (const ch of code) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}

// Instagram lists several renditions; take the one with the most pixels.
function pickLargest(versions) {
  if (!Array.isArray(versions)) return null;
  const best = versions
    .filter(v => v && v.url)
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
  return best ? best.url : null;
}

function videoFromMedia(media) {
  if (!media) return null;
  // carousels: dig into the first video child
  const children = media.carousel_media || media.edge_sidecar_to_children?.edges;
  if (!media.video_versions && !media.video_url && children) {
    for (const c of children) {
      const node = c.node || c;
      const inner = videoFromMedia(node);
      if (inner) return inner;
    }
  }
  return pickLargest(media.video_versions) || media.video_url || null;
}

// Strategy 1: the private-but-unauthenticated mobile API. Returns every
// rendition, so it gives the genuine highest resolution when it works.
async function fromMobileApi(code, env) {
  const mediaId = shortcodeToMediaId(code);
  if (!mediaId) throw new Error("mobile-api: bad shortcode");
  const res = await fetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
    headers: {
      "User-Agent": APP_UA,
      "X-IG-App-ID": IG_APP_ID,
      "Accept-Language": "en-US",
      ...authHeaders(env),
    },
  });
  if (!res.ok) throw new Error(`mobile-api: HTTP ${res.status}`);
  const json = await res.json();
  const url = videoFromMedia(json?.items?.[0]);
  if (!url) throw new Error("mobile-api: no video in response");
  return url;
}

// Strategy 2: the web app's own API for a post page.
async function fromWebApi(code, env) {
  const res = await fetch(
    `https://www.instagram.com/api/v1/media/shortcode/${code}/info/`,
    { headers: { ...WEB_HEADERS, "X-IG-App-ID": IG_APP_ID, ...authHeaders(env) } },
  );
  if (!res.ok) throw new Error(`web-api: HTTP ${res.status}`);
  const json = await res.json();
  const url = videoFromMedia(json?.items?.[0]);
  if (!url) throw new Error("web-api: no video in response");
  return url;
}

// Strategy 3: the public GraphQL endpoint.
async function fromGraphql(code, env) {
  const body = new URLSearchParams({
    doc_id: "10015901848480474",
    variables: JSON.stringify({ shortcode: code }),
  });
  const res = await fetch("https://www.instagram.com/graphql/query", {
    method: "POST",
    headers: {
      ...WEB_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-IG-App-ID": IG_APP_ID,
      ...authHeaders(env),
    },
    body,
  });
  if (!res.ok) throw new Error(`graphql: HTTP ${res.status}`);
  const json = await res.json();
  const media = json?.data?.xdt_shortcode_media;
  if (!media) throw new Error("graphql: no media (private, deleted, or blocked)");
  const url = videoFromMedia(media);
  if (!url) throw new Error("graphql: post has no video");
  return url;
}

// Strategy 4: the public embed page, scraped.
async function fromEmbed(code, env) {
  for (const path of ["embed/captioned/", "embed/"]) {
    const res = await fetch(`https://www.instagram.com/reel/${code}/${path}`, {
      headers: { ...WEB_HEADERS, ...authHeaders(env) },
    });
    if (!res.ok) continue;
    const html = await res.text();
    const m = html.match(/"video_url"\s*:\s*"([^"]+)"/) ||
              html.match(/"contentUrl"\s*:\s*"([^"]+)"/) ||
              html.match(/property="og:video"\s+content="([^"]+)"/);
    if (m) return JSON.parse(`"${m[1].replace(/&amp;/g, "&")}"`);
  }
  throw new Error("embed: no video_url in page");
}

const STRATEGIES = [
  ["mobile-api", fromMobileApi],
  ["web-api", fromWebApi],
  ["graphql", fromGraphql],
  ["embed", fromEmbed],
];

async function resolve(code, env) {
  const errors = [];
  for (const [name, fn] of STRATEGIES) {
    try {
      const url = await fn(code, env);
      if (url && /^https:\/\//.test(url)) return { url, via: name, errors };
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  const err = new Error(errors.join(" | ") || "could not resolve");
  err.details = errors;
  throw err;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const params = new URL(request.url).searchParams;
    const target = params.get("url");
    if (!target) {
      return new Response(
        "Reel Saver backend is running.\n\nUsage: ?url=https://www.instagram.com/reel/XXXX/\n" +
        "Add &debug=1 to see how each resolution strategy fared.\n",
        { headers: { ...CORS, "Content-Type": "text/plain" } },
      );
    }

    const code = shortcodeOf(target);
    if (!code) return json({ error: "not an Instagram reel or post URL" }, 400);

    let hit;
    try {
      hit = await resolve(code, env);
    } catch (e) {
      return json({
        error: String(e.message || e),
        tried: e.details || [],
        sessionConfigured: Boolean(env && env.IG_SESSIONID),
        hint: env && env.IG_SESSIONID
          ? "Session cookie is set but Instagram still refused. It may have expired — paste a fresh sessionid."
          : "Instagram blocks datacenter addresses. Add an IG_SESSIONID secret (see SETUP-WORKER.md) or use the Shortcut.",
      }, 502);
    }

    if (params.get("debug")) {
      return json({
        ok: true,
        via: hit.via,
        videoUrl: hit.url,
        earlierFailures: hit.errors,
        sessionConfigured: Boolean(env && env.IG_SESSIONID),
      });
    }

    // Stream the media through, forwarding Range so the player can seek.
    const range = request.headers.get("Range");
    const upstream = await fetch(hit.url, {
      headers: {
        "User-Agent": WEB_UA,
        Referer: "https://www.instagram.com/",
        ...(range ? { Range: range } : {}),
      },
    });
    if (!upstream.ok && upstream.status !== 206) {
      return json({ error: `CDN HTTP ${upstream.status}`, via: hit.via }, 502);
    }

    const headers = new Headers(CORS);
    headers.set("Content-Type", "video/mp4");
    headers.set("Content-Disposition", `attachment; filename="${code}.mp4"`);
    headers.set("Accept-Ranges", "bytes");
    headers.set("X-Resolved-Via", hit.via);
    for (const h of ["Content-Length", "Content-Range"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
