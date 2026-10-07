"""
Born Today Hollywood - Fully Automated Daily Generator
Runs INSIDE GitHub Actions at 06:00 AM IST.
- Fetches births for TODAY from Wikipedia OnThisDay API
- Picks 6 icons (3F/3M) with nostalgia boost
- If OPENAI_API_KEY exists: Generates TRUE AI 500-word cinematic captions with country accents
- Else: Uses high-quality template fallback
- Writes today_posts.json (8 photos per star)
"""
import os, json, requests, datetime, base64, random

NOSTALGIA = ["Toni Braxton","Judy Landers","Dylan Baker","Simon Cowell","John Mellencamp","Elisabeth Shue","Harrison Ford","Sigourney Weaver","Jeff Goldblum","Anthony Hopkins","Meryl Streep","Tom Hanks","Amber Stevens","Allison Munn"]

def fetch_births():
    today = datetime.datetime.utcnow()
    mm, dd = f"{today.month:02d}", f"{today.day:02d}"
    url = f"https://en.wikipedia.org/api/rest_v1/feed/onthisday/births/{mm}/{dd}"
    headers = {"User-Agent": "BornTodayBot/1.0"}
    try:
        r = requests.get(url, headers=headers, timeout=20)
        r.raise_for_status()
        births = r.json().get("births",[])
        cands=[]
        for b in births:
            year = b.get("year")
            if not year or year < 1940 or year > 2000: 
                continue
            for page in b.get("pages",[]):
                if not page.get("thumbnail"): continue
                txt = (page.get("extract","")+" "+page.get("description","")).lower()
                if any(k in txt for k in ["actor","actress","singer","musician","film","television"]):
                    cands.append({
                        "name": page.get("displaytitle") or page.get("title","").replace("_"," "),
                        "year": year,
                        "extract": page.get("extract","")[:500],
                        "thumb": page.get("thumbnail",{}).get("source",""),
                        "original": page.get("originalimage",{}).get("source","") or page.get("thumbnail",{}).get("source",""),
                    })
                    break
        # Boost nostalgia
        cands.sort(key=lambda x: (0 if any(n.lower() in x["name"].lower() for n in NOSTALGIA) else 1, x["year"]))
        return cands[:20]
    except Exception as e:
        print(f"Wikipedia fail {e}, using fallback Oct7")
        return [
            {"name":"Toni Braxton","year":1967,"extract":"American R&B singer, songwriter and actress with 7 Grammys.","thumb":"https://upload.wikimedia.org/wikipedia/commons/7/7c/Toni_Braxton_2015.jpg","original":"https://upload.wikimedia.org/wikipedia/commons/7/7c/Toni_Braxton_2015.jpg"},
            {"name":"Judy Landers","year":1958,"extract":"American film and television actress known for 80s TV.","thumb":"https://upload.wikimedia.org/wikipedia/commons/a/a7/Judy_Landers_1980s.jpg","original":"https://upload.wikimedia.org/wikipedia/commons/a/a7/Judy_Landers_1980s.jpg"},
            {"name":"Amber Stevens West","year":1986,"extract":"American actress known for Greek and The Carmichael Show.","thumb":"https://upload.wikimedia.org/wikipedia/commons/2/2e/Amber_Stevens_West.jpg","original":"https://upload.wikimedia.org/wikipedia/commons/2/2e/Amber_Stevens_West.jpg"},
            {"name":"Dylan Baker","year":1959,"extract":"American character actor known for Spider-Man 2 and The Good Wife.","thumb":"https://upload.wikimedia.org/wikipedia/commons/b/bf/Dylan_Baker_2007.jpg","original":"https://upload.wikimedia.org/wikipedia/commons/b/bf/Dylan_Baker_2007.jpg"},
            {"name":"Simon Cowell","year":1959,"extract":"English TV personality and record executive, creator of X Factor.","thumb":"https://upload.wikimedia.org/wikipedia/commons/d/d5/Simon_Cowell_2011.jpg","original":"https://upload.wikimedia.org/wikipedia/commons/d/d5/Simon_Cowell_2011.jpg"},
            {"name":"John Mellencamp","year":1951,"extract":"American singer-songwriter known as Johnny Cougar, heartland rock legend.","thumb":"https://upload.wikimedia.org/wikipedia/commons/0/0e/John_Mellencamp_2008.jpg","original":"https://upload.wikimedia.org/wikipedia/commons/0/0e/John_Mellencamp_2008.jpg"},
        ]

def guess_gender(name):
    if name.split()[0] in ["Toni","Judy","Amber","Allison","Holland","Paula"]: return "female"
    return "female" if name.endswith("a") and "Simon" not in name else "male"

def guess_country(extract):
    ex=extract.lower()
    if "english" in ex or "british" in ex: return "United Kingdom"
    if "australian" in ex: return "Australia"
    return "United States"

def ai_caption(cand, gender, country):
    # Try OpenAI if key present
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            prompt = f"""You are Chief Content Curator for Facebook page 'Born Today Hollywood' (audience 40-65+ US/UK film buffs).

Write a 500-word deeply human, emotionally rich, cinematic tribute for {cand['name']}, born {cand['year']} in {country}, gender {gender}.

Bio: {cand['extract']}

Requirements:
- Country accent: {'British eloquent witty (proper silver screen brilliance, tour-de-force)' if 'United Kingdom' in country else 'American warm conversational nostalgia' if 'United States' in country else 'Australian charismatic warmth'}
- Narrative arc: Opening Hook (iconic film scene memory), The Journey (early auditions, breakthrough, trivia, quotes), The Human Element (humility, philanthropy, off-screen personality), Engagement Question at end: "If you could only pick ONE of their movies to re-watch tonight, which one are you putting on? Drop your favorite memory or movie line in the comments below! 👇"
- No emojis except final 👇
- 400-600 words
- Warm, historian superfan voice
"""
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {
                "model": "gpt-4o-mini",
                "messages": [{"role":"user","content":prompt}],
                "max_tokens": 800,
                "temperature": 0.85
            }
            r = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data, timeout=40)
            if r.status_code==200:
                return r.json()["choices"][0]["message"]["content"].strip()
            else:
                print(f"OpenAI fail {r.status_code} {r.text[:500]}")
        except Exception as e:
            print(f"OpenAI error {e}")

    # Fallback template (high quality)
    name=cand['name']; year=cand['year']; age=2026-year
    extract=cand['extract']
    if "United Kingdom" in country:
        hook=f"Today we tip our hat to proper silver screen brilliance – {name}, born {year}, a true British tour-de-force whose wit and elegance have captivated audiences for decades."
    elif "Australia" in country:
        hook=f"Straight from Down Under with unmatched charisma – {name}, born {year}, a true-blue powerhouse proving Aussie talent is world-class."
    else:
        hook=f"Do you remember the first time you saw {name} light up your screen? Born {year}, {name} is pure Americana nostalgia – the star who made you fall in love with movies."
    return f"""{hook}

{extract} But behind that line is a career that defined generations. From early auditions and late nights, {name} fought for every role, bringing humility and dedication that fans aged 40-65+ still remember.

The Journey – Remember the behind-the-scenes stories? Directors saying "{name} was born to play this," co-stars calling {name} the most prepared person on set. From iconic movie quotes we still whisper to red-carpet moments that became family memories, {name} gave us shared history. Whether breakthrough in the 80s, career-defining in the 90s, or powerful comeback in the 2000s, {name} never chased trends – {name} set them.

The Human Element – Off camera, {name} is known for quiet philanthropy, fierce loyalty to family, and a grounded spirit Hollywood couldn't change. That authenticity is why at {age} today, fans gather online to celebrate not just the star but the person.

If you could only pick ONE {name} movie, show, or song to re-watch tonight, which one are you putting on? Drop your favorite memory or movie line in the comments below! 👇"""

def main():
    today = datetime.datetime.now(datetime.timezone.utc).date()
    cands = fetch_births()
    # Enforce 3F/3M
    females = [c for c in cands if guess_gender(c["name"])=="female"][:3]
    males = [c for c in cands if guess_gender(c["name"])=="male"][:3]
    selected = (females+males)[:6]
    while len(selected)<6:
        for c in cands:
            if c not in selected:
                selected.append(c)
            if len(selected)>=6: break

    times = ["12:00:00Z","15:00:00Z","18:00:00Z","21:00:00Z","00:00:00Z","02:30:00Z"]
    posts=[]
    for i,cand in enumerate(selected[:6]):
        gender = "female" if i<3 else "male"
        country = guess_country(cand.get("extract",""))
        img = cand.get("original") or cand.get("thumb")
        photo_urls = [img]*8
        caption = ai_caption(cand, gender, country)
        base = today if i<4 else today+datetime.timedelta(days=1)
        sched = f"{base.isoformat()}T{times[i]}"
        posts.append({
            "celebrity_name": cand["name"],
            "birth_year": cand["year"],
            "age": 2026-cand["year"],
            "gender": gender,
            "country": country,
            "scheduled_time_utc": sched,
            "photo_urls": photo_urls,
            "caption": caption,
            "hashtags": f"#BornToday #HollywoodBirthdays #RetroCinema #ClassicMovies #{cand['name'].replace(' ','')} #FilmNostalgia #MovieLegends"
        })
    payload={"date": today.isoformat(), "posts": posts}
    with open("today_posts.json","w",encoding="utf-8") as f:
        json.dump(payload,f,indent=2,ensure_ascii=False)
    print(f"Generated {today} with {len(posts)} stars - AI={bool(os.getenv('OPENAI_API_KEY'))}")
    for p in posts: print(f"- {p['celebrity_name']} {p['gender']} {p['birth_year']}")

if __name__=="__main__":
    main()
