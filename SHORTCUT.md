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

Open the **Shortcuts** app -> **+** (new shortcut) -> **Add Action** for each step
below. Search the action name in the box, tap it, then fill its fields.

Ten actions in total.

### 1. Text

Search "Text", add it. Tap its field, then the variable button above the
keyboard, and insert **Shortcut Input**. The box should contain just that one
blue chip.

### 2. Match Text

- **Text**: the `Text` output from step 1 (usually filled in for you)
- **Regular Expression**:

```
instagram.com/(reel|reels|p|tv)/[A-Za-z0-9_-]+
```

This grabs the clean part of the link and drops anything after it, so trailing
junk like `?utm_source=ig_web_copy_link` does not matter.

### 3. Text

Type the following, and where marked, insert the **Matches** variable from
step 2:

```
https://[Matches]/embed/captioned/
```

Type `https://` literally, drop in the Matches chip, then type
`/embed/captioned/` after it.

### 4. Get Contents of URL

- **URL**: the `Text` from step 3
- Tap the **v** arrow to expand it, leave **Method** as `GET`
- Under **Headers**, tap **Add new header**:
  - **Key**: `User-Agent`
  - **Text**:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
```

This header is required. Without it Instagram returns a stripped page with no
video in it.

### 5. Match Text

- **Text**: the `Contents of URL` from step 4
- **Regular Expression**:

```
"video_url":"(.*?)"
```

### 6. Get Group from Matched Text

- **Get**: change "All Groups" to **Group at Index**
- **Index**: `1`

### 7. Replace Text

- **Find**: `\/`
- **Replace**: `/`
- Leave **Regular Expression** off
- **Text**: the `Group` from step 6

### 8. Replace Text

- **Find**: `\u0026`
- **Replace**: `&`
- **Text**: the `Updated Text` from step 7

Steps 7 and 8 undo the escaping Instagram applies to the link inside its page.

### 9. Get Contents of URL

- **URL**: the `Updated Text` from step 8
- No headers needed this time

### 10. Save to Photo Album

- **Save**: the `Contents of URL` from step 9
- **Album**: Recents, or whichever you prefer

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
