import json, requests, os, time
from PIL import Image, ImageDraw

print("Loading today_posts.json...")
try:
    with open('today_posts.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
except Exception as e:
    print(f"No today_posts.json or invalid: {e}")
    data = {"celebs": []}

print(f"Found {len(data.get('celebs', []))} celebs")

def create_fallback_image(image_path, celeb_name):
    os.makedirs(os.path.dirname(image_path) or '.', exist_ok=True)
    img = Image.new('RGB', (1080, 1440), color=(18, 20, 28))
    draw = ImageDraw.Draw(img)
    # Gold decorative border
    draw.rectangle([40, 40, 1040, 1400], outline=(212, 175, 55), width=10)
    draw.rectangle([60, 60, 1020, 1380], outline=(153, 122, 21), width=3)
    # Diamond accent in center
    draw.polygon([(540, 400), (840, 720), (540, 1040), (240, 720)], outline=(212, 175, 55), width=8)
    draw.text((540, 720), f"★ {celeb_name} ★\nBorn Today Tribute", fill=(247, 231, 180), anchor="mm")
    img.save(image_path, quality=92)
    print(f"Created fallback collage image: {image_path}")

for celeb in data.get('celebs', []):
    celeb_name = celeb.get('name', 'Celebrity')
    print(f"\n=== {celeb_name} ===")
    for post in celeb.get('posts', []):
        page_id_env = post.get('page_id_env')
        token_env = post.get('token_env')
        page_id = os.environ.get(page_id_env)
        token = os.environ.get(token_env)
        
        if not page_id or not token:
            print(f"Skipping {post.get('page_name')} - missing env {page_id_env}/{token_env}")
            continue
        
        image_path = post.get('image_path', '')
        if not os.path.exists(image_path):
            print(f"Image '{image_path}' not found locally, auto-generating tribute graphic...")
            create_fallback_image(image_path, celeb_name)
        
        url = f"https://graph.facebook.com/v19.0/{page_id}/photos"
        
        now_ts = int(time.time())
        sched_ts = post.get('unix_timestamp', 0)
        
        # Facebook requires scheduled posts to be at least 10 minutes in the future
        if sched_ts > now_ts + 600:
            payload = {
                "message": post['caption'][:2000],
                "published": False,
                "scheduled_publish_time": sched_ts,
                "access_token": token
            }
            print(f"Scheduling post for {post.get('page_name')} at timestamp {sched_ts}...")
        else:
            payload = {
                "message": post['caption'][:2000],
                "published": True,
                "access_token": token
            }
            print(f"Publishing LIVE right now to {post.get('page_name')}...")
        
        try:
            with open(image_path, 'rb') as img:
                r = requests.post(url, data=payload, files={'source': img})
            
            res = r.json()
            if r.status_code == 200:
                print(f"🎉 SUCCESS! Posted to {post['page_name']}!")
                print(f"Photo ID: {res.get('id')}, Post ID: {res.get('post_id')}")
            else:
                print(f"❌ Facebook API Error ({r.status_code}): {r.text}")
        except Exception as e:
            print(f"Error posting: {e}")
        
        time.sleep(3)

print("\nDone!")
