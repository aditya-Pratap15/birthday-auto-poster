import json, requests, os, time

print("Loading today_posts.json...")
try:
    with open('today_posts.json', 'r') as f:
        data = json.load(f)
except Exception as e:
    print(f"No today_posts.json or invalid: {e}")
    print("Creating sample structure")
    data = {"celebs": []}

print(f"Found {len(data.get('celebs', []))} celebs")

for celeb in data.get('celebs', []):
    print(f"\n=== {celeb['name']} ===")
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
            print(f"Image {image_path} not found, skipping - create collages first")
            continue
        
        url = f"https://graph.facebook.com/v19.0/{page_id}/photos"
        payload = {
            "message": post['caption'][:2000],  # FB limit
            "published": False,
            "scheduled_publish_time": post['unix_timestamp'],
            "access_token": token
        }
        
        try:
            with open(image_path, 'rb') as img:
                r = requests.post(url, data=payload, files={'source': img})
            print(f"Posted {post['page_name']} at {post['scheduled_time']} -> {r.status_code}")
            print(r.text[:500])
        except Exception as e:
            print(f"Error posting: {e}")
        
        time.sleep(5)

print("\nDone!")
