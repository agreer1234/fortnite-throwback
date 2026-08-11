# Connect your own server

Reel Saver normally borrows volunteer-run public relays. They are frequently
captcha-walled, rate-limited, or simply down, which is why downloads fail in
bursts. Running your own tiny server removes that dependency entirely.

The server is a **Cloudflare Worker**: free, no credit card, no maintenance. It
receives a reel link, asks Instagram for the highest-resolution MP4, and streams
it back to your phone. It stores nothing and logs nothing.

## Fastest route: one click

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/agreer1234/fortnite-throwback)

That button reads `wrangler.toml` and `worker.js` from this repository and
deploys them to your own Cloudflare account. You will be asked to sign in (or
sign up — it is free) and to authorize Cloudflare to read the repository. When
it finishes it shows your Worker's URL, something like
`https://reel-saver.<your-name>.workers.dev`. Skip to step 3 below.

If the button gives you trouble, the manual route takes about five minutes.

## Manual route: 1. Create the Worker

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up (free).
2. In the left sidebar choose **Compute (Workers)** → **Create application** →
   **Create Worker**.
3. Name it something like `reel-saver`, then click **Deploy**. You now have a
   working placeholder.
4. Click **Edit code**.

## 2. Paste the code

1. Open [`worker.js`](worker.js) from this repository and copy all of it.
2. In the Cloudflare editor, select everything in the file and replace it with
   what you copied.
3. Click **Deploy** (top right).

## 3. Point the app at it

1. Copy your Worker's URL from the Cloudflare dashboard. It looks like
   `https://reel-saver.<your-name>.workers.dev`.
2. Open Reel Saver on your phone.
3. At the bottom of the page, tap **connect your own server**.
4. Paste the URL and confirm.

The footer will then read "connected to reel-saver…". From that point on, the
app asks your server first and only falls back to public relays if yours is
unreachable. The setting is stored on your phone, so it survives reloads — but
it is per-device and per-browser, so repeat step 3 if you add the app to your
home screen after configuring it in Safari.

## Checking it works

Visit your Worker URL directly in a browser. It should respond with:

```
Reel Saver backend is running.
```

To test a real reel, append a link:

```
https://reel-saver.<your-name>.workers.dev/?url=https://www.instagram.com/reel/XXXXXXXXX/
```

That should download an MP4. If it returns a JSON error instead, the message
says which stage failed:

| Message | Meaning |
| --- | --- |
| `graphql returned no media (post may be private)` | The account is private, or the post was deleted. Only public content is reachable. |
| `that post is not a video` | The link points at a photo post. |
| `CDN HTTP 403` | Instagram rejected the media request. Redeploy after a few minutes; if it persists, Instagram is blocking Cloudflare's address range for that file. |
| `embed page had no video_url` | Both resolution strategies failed — usually a temporary Instagram change. |

## Limits

The free Workers plan allows 100,000 requests per day, which is far beyond
personal use. Each reel download counts as one request.

Only download content you have the rights to save.
