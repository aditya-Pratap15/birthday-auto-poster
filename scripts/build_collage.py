#!/usr/bin/env python3
"""
Automated Celebrity Birthday Collage Builder
Reads today_posts.json, selects male/female preset templates,
preserves custom background images, crops photos into diamond/oval/box frames,
and dynamically replaces celebrity name & birth date while preserving "Happy Birthday".
"""

import json
import os
import re
import base64
import io
import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS_DIR = os.path.join(BASE_DIR, "presets")
COLLAGES_DIR = os.path.join(BASE_DIR, "collages")
TODAY_POSTS_PATH = os.path.join(BASE_DIR, "today_posts.json")

os.makedirs(COLLAGES_DIR, exist_ok=True)
os.makedirs(PRESETS_DIR, exist_ok=True)


def load_preset(gender="female", style="diamond"):
    """Load matching preset JSON file."""
    gender_file = f"preset_{gender.lower()}.json"
    gender_path = os.path.join(PRESETS_DIR, gender_file)
    if os.path.exists(gender_path):
        with open(gender_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Fallback to female diamond preset if specific gender preset not found
    fallback_path = os.path.join(PRESETS_DIR, "preset_female.json")
    if os.path.exists(fallback_path):
        with open(fallback_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Built-in Default Diamond Preset (3:4 - 1080x1440)
    return {
        "canvasWidth": 1080,
        "canvasHeight": 1440,
        "aspectRatio": "3:4",
        "bgType": "preset",
        "bgPreset": "noir",
        "bgDarkOverlay": 0.2,
        "bgVignette": 0.5,
        "frames": [
            {"label": "Top Left Quadrant", "x": 20, "y": 20, "width": 510, "height": 690, "shape": "gold_rect", "borderWidth": 4, "borderColor": "#d4af37", "shadowBlur": 15},
            {"label": "Top Right Quadrant", "x": 550, "y": 20, "width": 510, "height": 690, "shape": "gold_rect", "borderWidth": 4, "borderColor": "#d4af37", "shadowBlur": 15},
            {"label": "Bottom Left Quadrant", "x": 20, "y": 730, "width": 510, "height": 690, "shape": "gold_rect", "borderWidth": 4, "borderColor": "#d4af37", "shadowBlur": 15},
            {"label": "Bottom Right Quadrant", "x": 550, "y": 730, "width": 510, "height": 690, "shape": "gold_rect", "borderWidth": 4, "borderColor": "#d4af37", "shadowBlur": 15},
            {"label": "Center Diamond Hero", "x": 290, "y": 470, "width": 500, "height": 500, "shape": "diamond", "borderWidth": 8, "borderColor": "#d4af37", "shadowBlur": 30}
        ],
        "textLayers": [
            {"text": "Happy Birthday", "fontSize": 52, "color": "#d4af37", "x": 540, "y": 120, "align": "center"},
            {"text": "{celebrity_name}", "fontSize": 68, "color": "#f5e6c8", "x": 540, "y": 1330, "align": "center"},
            {"text": "Born {birth_year}", "fontSize": 34, "color": "#ffffff", "x": 540, "y": 1395, "align": "center"}
        ]
    }


def download_or_load_image(src, size=(800, 800)):
    """Fetch image from URL, local path, or base64 data URI."""
    if not src:
        return None

    # Base64 Data URI
    if src.startswith("data:image"):
        try:
            header, encoded = src.split(",", 1)
            data = base64.b64decode(encoded)
            return Image.open(io.BytesIO(data)).convert("RGBA")
        except Exception as e:
            print(f"  [!] Failed decoding base64 image: {e}")
            return None

    # Remote URL
    if src.startswith("http://") or src.startswith("https://"):
        try:
            resp = requests.get(src, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200:
                return Image.open(io.BytesIO(resp.content)).convert("RGBA")
        except Exception as e:
            print(f"  [!] Failed downloading photo from {src}: {e}")
            return None

    # Local file path
    local_path = os.path.join(BASE_DIR, src) if not os.path.isabs(src) else src
    if os.path.exists(local_path):
        try:
            return Image.open(local_path).convert("RGBA")
        except Exception as e:
            print(f"  [!] Failed loading local image {local_path}: {e}")

    return None


def draw_background(preset, W, H):
    """Draw preset background image or luxury gradient."""
    canvas = Image.new("RGBA", (W, H), (15, 17, 24, 255))

    # 1. Check for custom background image inside preset
    bg_custom = preset.get("bgCustomImage")
    if preset.get("bgType") == "custom" and bg_custom:
        bg_img = download_or_load_image(bg_custom, (W, H))
        if bg_img:
            # Resize cover fit
            bg_fitted = ImageOps.fit(bg_img, (W, H), method=Image.Resampling.LANCZOS)
            canvas.paste(bg_fitted, (0, 0))
            return canvas

    # 2. Preset Gradient Fallback
    bg_style = preset.get("bgPreset", "noir")
    draw = ImageDraw.Draw(canvas)
    
    # Simple vertical radial dark gradient
    color_top = (28, 31, 43, 255) if bg_style == "noir" else (45, 17, 45, 255)
    color_bottom = (8, 9, 13, 255) if bg_style == "noir" else (14, 4, 16, 255)
    
    for y in range(H):
        t = y / float(H)
        r = int(color_top[0] * (1 - t) + color_bottom[0] * t)
        g = int(color_top[1] * (1 - t) + color_bottom[1] * t)
        b = int(color_top[2] * (1 - t) + color_bottom[2] * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    return canvas


def crop_to_shape(img, w, h, shape="diamond", border_width=4, border_color="#d4af37"):
    """Crops an image into diamond, oval, or rectangle and adds a gold border."""
    fitted = ImageOps.fit(img, (w, h), method=Image.Resampling.LANCZOS)
    
    # Create alpha mask for shape
    mask = Image.new("L", (w, h), 0)
    draw_mask = ImageDraw.Draw(mask)

    if shape == "diamond":
        # 4-point diamond polygon
        diamond_pts = [(w // 2, 0), (w, h // 2), (w // 2, h), (0, h // 2)]
        draw_mask.polygon(diamond_pts, fill=255)
    elif shape == "oval":
        draw_mask.ellipse([(0, 0), (w, h)], fill=255)
    else:  # rectangle or rounded box
        draw_mask.rounded_rectangle([(0, 0), (w, h)], radius=12, fill=255)

    # Apply mask
    output = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    output.paste(fitted, (0, 0), mask=mask)

    # Draw border on top
    draw_border = ImageDraw.Draw(output)
    if border_width > 0:
        if shape == "diamond":
            diamond_pts = [(w // 2, 0), (w, h // 2), (w // 2, h), (0, h // 2)]
            draw_border.line(diamond_pts + [diamond_pts[0]], fill=border_color, width=border_width)
        elif shape == "oval":
            draw_border.ellipse([(0, 0), (w, h)], outline=border_color, width=border_width)
        else:
            draw_border.rounded_rectangle([(0, 0), (w, h)], radius=12, outline=border_color, width=border_width)

    return output


def render_text_layers(canvas, text_layers, celebrity_name, birth_date, birth_year, age):
    """
    Renders text layers according to the user's rule:
    - Keep 'Happy Birthday' intact!
    - Replace dummy name with actual celebrity name.
    - Replace dates/years with actual birth date/year.
    """
    draw = ImageDraw.Draw(canvas)
    
    for layer in text_layers:
        raw_text = layer.get("text", "")
        clean_lower = raw_text.strip().lower()

        # RULE 1: If text is "Happy Birthday" (or contains it), KEEP IT INTACT!
        if "happy birthday" in clean_lower:
            final_text = raw_text
        # RULE 2: If text explicitly references birth date or year
        elif any(k in clean_lower for k in ["born", "birth", "19", "20", "{birth_date}", "{birth_year}", "age"]):
            if "{birth_year}" in raw_text or "{birth_date}" in raw_text:
                final_text = raw_text.replace("{birth_year}", str(birth_year)).replace("{birth_date}", str(birth_date)).replace("{age}", str(age))
            elif birth_year:
                final_text = f"Born {birth_year} • Age {age}" if age else f"Born {birth_year}"
            else:
                final_text = str(birth_date) if birth_date else raw_text
        # RULE 3: Otherwise, it's the celebrity's name layer!
        else:
            final_text = raw_text.replace("{celebrity_name}", celebrity_name).replace("{name}", celebrity_name)
            # If the layer had a dummy celebrity name like "Kate Winslet" or "Susan Sarandon", replace it with real name
            if "{" not in raw_text:
                final_text = celebrity_name

        font_size = layer.get("fontSize", 48)
        color = layer.get("color", "#d4af37")
        x = layer.get("x", canvas.width // 2)
        y = layer.get("y", 100)
        align = layer.get("align", "center")

        try:
            # Fallback to default truetype font if custom fonts are unavailable on Ubuntu
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            except:
                font = ImageFont.load_default()

        # Draw subtle drop shadow for luxury readability
        draw.text((x + 2, y + 2), final_text, font=font, fill=(0, 0, 0, 200), anchor="mm" if align == "center" else "lt")
        # Draw foreground text
        draw.text((x, y), final_text, font=font, fill=color, anchor="mm" if align == "center" else "lt")


def draw_stickers(canvas, stickers):
    """Draws floating stickers, reaction icons, and logo watermarks from the preset."""
    for s in stickers:
        src = s.get("src")
        if not src:
            continue
        w = int(s.get("width", 100))
        h = int(s.get("height", 100))
        sticker_img = download_or_load_image(src, (w, h))
        if not sticker_img:
            continue

        resized = sticker_img.resize((w, h), Image.Resampling.LANCZOS)
        
        # Apply opacity
        opacity = float(s.get("opacity", 1.0))
        if opacity < 1.0 and resized.mode == "RGBA":
            alpha = resized.split()[3]
            alpha = alpha.point(lambda p: int(p * opacity))
            resized.putalpha(alpha)

        # Apply rotation if any
        rot = float(s.get("rotation", 0))
        if rot != 0:
            resized = resized.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)

        # In canvas coordinates, preset stores center position (x, y)
        x = int(s.get("x", 0) - resized.width / 2)
        y = int(s.get("y", 0) - resized.height / 2)
        canvas.paste(resized, (x, y), mask=resized)


def generate_collage_for_post(celeb_name, gender, birth_date, birth_year, age, photo_urls, output_path):
    """Generates the full collage tribute image."""
    preset = load_preset(gender=gender)
    W = preset.get("canvasWidth", 1080)
    H = preset.get("canvasHeight", 1440)

    # 1. Background
    canvas = draw_background(preset, W, H)

    # 2. Photos into Frames
    frames = preset.get("frames", [])
    for idx, frame in enumerate(frames):
        # Pick matching photo from array (or wrap around if fewer photos provided)
        photo_src = photo_urls[idx % len(photo_urls)] if photo_urls else None
        photo_img = download_or_load_image(photo_src, (frame["width"], frame["height"]))
        
        if photo_img:
            shaped_photo = crop_to_shape(
                photo_img,
                frame["width"],
                frame["height"],
                shape=frame.get("shape", "gold_rect"),
                border_width=frame.get("borderWidth", 4),
                border_color=frame.get("borderColor", "#d4af37")
            )
            canvas.paste(shaped_photo, (frame["x"], frame["y"]), mask=shaped_photo)

    # 3. Stickers, Icons & Page Logos
    stickers = preset.get("stickers", [])
    if stickers:
        draw_stickers(canvas, stickers)

    # 4. Text Layers (Keep Happy Birthday, replace name & birthdate)
    text_layers = preset.get("textLayers", [])
    render_text_layers(canvas, text_layers, celeb_name, birth_date, birth_year, age)

    # 5. Save Final Image
    final_rgb = canvas.convert("RGB")
    final_rgb.save(output_path, "JPEG", quality=95)
    print(f"  [✓] Successfully generated collage: {output_path}")


def main():
    if not os.path.exists(TODAY_POSTS_PATH):
        print(f"[!] {TODAY_POSTS_PATH} not found.")
        return

    with open(TODAY_POSTS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Support top-level "posts" or nested "celebs"
    posts = data.get("posts", [])
    if not posts and "celebs" in data:
        posts = []
        for celeb in data["celebs"]:
            for p in celeb.get("posts", []):
                p["celebrity_name"] = celeb.get("name")
                p["age"] = celeb.get("age")
                p["birth_year"] = celeb.get("birth_year", 2026 - int(celeb.get("age", 50)))
                p["gender"] = celeb.get("gender", "female")
                p["photo_urls"] = celeb.get("photo_urls", p.get("photo_urls", []))
                posts.append(p)

    print(f"[*] Building collages for {len(posts)} daily posts...")
    for idx, post in enumerate(posts, start=1):
        celeb_name = post.get("celebrity_name") or post.get("name") or f"Celebrity_{idx}"
        gender = post.get("gender", "female")
        age = post.get("age", "")
        birth_year = post.get("birth_year", "")
        birth_date = post.get("birth_date", data.get("date", ""))
        photo_urls = post.get("photo_urls", [])

        # Target output filename
        image_path = post.get("image_path")
        if not image_path:
            clean_slug = re.sub(r'[^a-zA-Z0-9_]', '_', celeb_name)
            image_path = f"collages/{clean_slug}_Page_{idx}_Tribute.jpg"
            post["image_path"] = image_path

        dest_path = os.path.join(BASE_DIR, image_path)
        print(f"\nProcessing Post #{idx}: {celeb_name} ({gender.upper()}) -> {image_path}")
        generate_collage_for_post(celeb_name, gender, birth_date, birth_year, age, photo_urls, dest_path)

    # Save updated today_posts.json with confirmed image_path fields
    with open(TODAY_POSTS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("\n[✓] All daily collages rendered and today_posts.json synchronized!")


if __name__ == "__main__":
    main()
