# Bailey Roofing — Storm Tracker
## Setup & Weekly Update Guide

---

## FILES IN THIS FOLDER

| File | What it is | Do you touch it? |
|------|-----------|-----------------|
| `index.html` | The full tracker page | Rarely |
| `style.css` | All styling | Never |
| `app.js` | All logic | Never |
| `data.json` | **Your storm data** | ✅ YES — weekly |

---

## FIRST-TIME GITHUB SETUP (one time only)

1. Go to **github.com** → sign in → click **New repository**
2. Name it: `bailey-storm-tracker`
3. Set to **Public** → click **Create repository**
4. Upload all 4 files (drag and drop onto the page)
5. Go to **Settings → Pages**
6. Under "Source" select **main branch** → click **Save**
7. Your URL will be: `https://YOUR-USERNAME.github.io/bailey-storm-tracker/`

**That's your permanent tracker URL.** It goes in your Webflow iframe embed.

---

## ADDING THE TRACKER TO WEBFLOW

In Webflow, add an **Embed** element wherever you want the tracker to appear, and paste:

```html
<iframe
  src="https://YOUR-USERNAME.github.io/bailey-storm-tracker/"
  width="100%"
  height="900px"
  style="border:none;display:block;"
  allow="geolocation"
  loading="lazy"
  title="Bailey Roofing Georgia Storm Tracker"
></iframe>
```

Replace `YOUR-USERNAME` with your actual GitHub username.

---

## WEEKLY UPDATE WORKFLOW (takes 5 minutes)

### Step 1 — Find new NOAA storm events
Go to: https://www.ncdc.noaa.gov/stormevents/
- Select **Georgia**
- Select **Hail** or **Thunderstorm Wind**
- Date range: last 2 weeks
- Look for events within 50 miles of Buford GA (lat 34.13, lng -84.02)

### Step 2 — Get the lat/lng for each event
Go to: https://www.latlong.net/
- Type the city/location from the NOAA report
- Copy the latitude and longitude

### Step 3 — Add to data.json

Open `data.json` in any text editor (Notepad works). Add a new entry to the array.

**For a hail event, copy this template:**
```json
{
  "id": "h031",
  "date": "2026-06-26",
  "lat": 34.0954,
  "lng": -84.0205,
  "size_in": 1.75,
  "county": "Gwinnett",
  "neighborhood": "Buford — Mill Creek area",
  "city": "Buford",
  "estimated_homes": 340,
  "notes": "Any notes here, or leave blank"
},
```

**For a wind event, copy this template:**
```json
{
  "id": "w012",
  "date": "2026-06-26",
  "lat": 34.0954,
  "lng": -84.0205,
  "mph": 58,
  "county": "Gwinnett",
  "city": "Buford",
  "radius_miles": 7,
  "estimated_homes": 900,
  "notes": ""
},
```

**IMPORTANT:** Add new entries at the TOP of the array (after the opening `[`), not the bottom. And make sure every entry except the last one has a comma after the closing `}`.

### Step 4 — Update the last_updated date
Find this line near the top of data.json and update the date:
```
"last_updated": "2026-06-19",
```

### Step 5 — Upload to GitHub
1. Go to your GitHub repo
2. Click on `data.json`
3. Click the **pencil icon** (Edit)
4. Paste your new contents
5. Click **Commit changes**

The tracker updates live within 1-2 minutes. No other steps needed.

---

## HAIL SIZE REFERENCE

| Size | Inches | What it means |
|------|--------|--------------|
| Pea | 0.25" | Below threshold |
| Marble | 0.50" | Below threshold |
| Dime | 0.75" | Below threshold |
| **Quarter** | **1.00"** | **Minimum threshold — flag this** |
| Half dollar | 1.25" | Flag — roof impact likely |
| Ping pong | 1.50" | Flag — significant damage |
| **Golf ball** | **1.75"** | **High priority — certain damage** |
| Baseball | 2.00"+ | **Extreme — canvas immediately** |

---

## WIND SPEED REFERENCE

| Speed | What it means |
|-------|--------------|
| Below 45 mph | Below threshold — skip |
| **45–59 mph** | **Flag — 3-tab shingle risk** |
| **60–74 mph** | **High priority — likely damage** |
| **75+ mph** | **Extreme — canvas immediately** |

---

## HOW THE 2-YEAR WINDOW WORKS

The tracker automatically calculates today's date and only shows events from the past 24 months. You do NOT need to remove old events from data.json — the app filters them out automatically. However, you can clean up old data periodically to keep the file manageable.

---

## QUESTIONS?
Call Brandin: (770) 381-8081
