# Reel Saver Shortcut (iPhone)

Instagram blocks requests coming from datacenter addresses, which is why the
hosted versions of this tool keep failing. A Shortcut runs on the phone itself,
so its requests come from your ordinary home or cellular address and are treated
like any other visitor.

It also gets you a better workflow than the web page: in the Instagram app, tap
**Share → Reel Saver**, and the video lands in Photos. No copying links.

Nothing is sent to any server of mine, and no Instagram credentials are stored
anywhere.

## Build it (about five minutes)

Open the **Shortcuts** app → **+** (new shortcut) → **Add Action** for each step
below. Search the action name in the box, tap it, then set its fields.

### 1. Text

Search "Text", add it. Tap the field and insert the **Shortcut Input** variable
(tap the field, then the variable button above the keyboard → Shortcut Input).
The whole content of the box should be that one blue variable chip.

### 2. Match Text

- **Text**: the `Text` output from step 1 (usually filled in automatically)
- **Regular Expression**:

```
/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)
```

### 3. Get Group from Matched Text

- **Get**: change from "All Groups" to **Group at Index**
- **Index**: `1`

This pulls the reel's shortcode out of the link, so query strings like
`?utm_source=ig_web_copy_link` don't matter.

### 4. Text

Type this, inserting the **Group** variable from step 3 where marked:

```
https://www.instagram.com/reel/[Group]/embed/captioned/
```

Type the literal text and drop the variable chip in place of `[Group]`.

### 5. Get Contents of URL

- **URL**: the `Text` from step 4
- Tap the **⌄** arrow to expand, set **Method** to `GET`
- Under **Headers**, tap **Add new header**:
  - **Key**: `User-Agent`
  - **Text**:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
```

The header matters — without it Instagram returns a stripped page with no video
in it.

### 6. Match Text

- **Text**: the `Contents of URL` from step 5
- **Regular Expression**:

```
"video_url":"(.*?)"
```

### 7. Get Group from Matched Text

- **Get**: **Group at Index**
- **Index**: `1`

### 8. Replace Text

- **Find**: `\/`
- **Replace**: `/`
- Leave **Regular Expression** off
- **Text**: the `Group` from step 7

### 9. Replace Text

- **Find**: `\u0026`
- **Replace**: `&`
- **Text**: the `Updated Text` from step 8

Steps 8 and 9 undo the JSON escaping Instagram applies to the link.

### 10. Get Contents of URL

- **URL**: the `Updated Text` from step 9
- No headers needed this time

### 11. Save to Photo Album

- **Save**: the `Contents of URL` from step 10
- **Album**: Recents (or whichever you prefer)

## Turn on the share sheet

Tap the shortcut's name at the top → **ⓘ** (info) → **Details**:

1. Turn on **Show in Share Sheet**
2. Tap **Share Sheet Types** and turn everything off except **URLs** and **Text**
3. Name it `Reel Saver`
4. Optionally **Add to Home Screen** for an icon that prompts for a link

Tap **Done**.

## Use it

In the Instagram app, open a reel → **Share** (paper plane) → **Share to…** →
**Reel Saver**. After a moment the video appears in Photos.

You can also copy a reel link and run the shortcut from the home screen.

## If something goes wrong

| Symptom | Cause and fix |
| --- | --- |
| "No matches found" at step 7 | Instagram served a page without the video. Confirm the User-Agent header in step 5 is set exactly as above. |
| Saves a tiny or broken file | Steps 8 and 9 were skipped or mis-typed; the link is still JSON-escaped. |
| Nothing happens from the share sheet | Share Sheet Types does not include URLs. |
| Works for some reels only | Private accounts are not reachable. Only public reels can be fetched. |

To see what a step produced, tap the **▶** button while editing and inspect each
action's output.

Only download content you have the rights to save.
