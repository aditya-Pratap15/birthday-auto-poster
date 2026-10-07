#!/usr/bin/env python3
"""
High-End Automated Celebrity Birthday Collage Builder
- Downloads real celebrity photos from Wikipedia API fallback if provided URLs fail.
- Always renders all 8 frames (white & gold borders, shadows, shape masks).
- Loads actual Google Fonts (Cinzel, Great Vibes, Alex Brush) from fonts/.
- Renders rich luxury dark/gold archival backdrop.
- Stamps permanent Born Today Hollywood watermark logo.
"""

import json
import os
import re
import io
import math
import random
import base64
import requests
from urllib.parse import quote
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRESETS_DIR = os.path.join(BASE_DIR, "presets")
COLLAGES_DIR = os.path.join(BASE_DIR, "collages")
FONTS_DIR = os.path.join(BASE_DIR, "fonts")
TODAY_POSTS_PATH = os.path.join(BASE_DIR, "today_posts.json")

os.makedirs(COLLAGES_DIR, exist_ok=True)
os.makedirs(PRESETS_DIR, exist_ok=True)
os.makedirs(FONTS_DIR, exist_ok=True)

USER_AGENT = "BornTodayHollywoodBot/1.0 (https://github.com/aditya-Pratap15/birthday-auto-poster; contact@borntoday.com)"


def ensure_font(filename, url):
    """Ensure luxury Google Font is downloaded and ready."""
    dest = os.path.join(FONTS_DIR, filename)
    if not os.path.exists(dest):
        try:
            r = requests.get(url, timeout=10, headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                with open(dest, "wb") as f:
                    f.write(r.content)
        except Exception:
            pass
    return dest


# Download fonts if missing
FONT_CINZEL = ensure_font("Cinzel.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/static/Cinzel-Bold.ttf")
FONT_GREAT_VIBES = ensure_font("GreatVibes.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf")
FONT_DANCING_SCRIPT = ensure_font("DancingScript.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf")
FONT_ALEX_BRUSH = ensure_font("AlexBrush.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/alexbrush/AlexBrush-Regular.ttf")
FONT_MONTSERRAT = ensure_font("Montserrat.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf")
FONT_BODONI_MODA = ensure_font("BodoniModa.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/bodonimoda/BodoniModa%5Bopsz%2Cwght%5D.ttf")
FONT_DM_SERIF = ensure_font("DMSerifDisplay.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf")
FONT_ALLURA = ensure_font("Allura.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/allura/Allura-Regular.ttf")
FONT_BALLET = ensure_font("Ballet.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/ballet/Ballet%5Bopsz%5D.ttf")


def get_font_by_name(font_family, size):
    """Matches CSS font name to loaded TTF."""
    name_lower = (font_family or "").lower()
    path = None
    if "great vibes" in name_lower and os.path.exists(FONT_GREAT_VIBES):
        path = FONT_GREAT_VIBES
    elif "dancing script" in name_lower and os.path.exists(FONT_DANCING_SCRIPT):
        path = FONT_DANCING_SCRIPT
    elif "alex brush" in name_lower and os.path.exists(FONT_ALEX_BRUSH):
        path = FONT_ALEX_BRUSH
    elif "cinzel" in name_lower and os.path.exists(FONT_CINZEL):
        path = FONT_CINZEL
    elif "montserrat" in name_lower and os.path.exists(FONT_MONTSERRAT):
        path = FONT_MONTSERRAT
    elif "bodoni" in name_lower and os.path.exists(FONT_BODONI_MODA):
        path = FONT_BODONI_MODA
    elif "dm serif" in name_lower and os.path.exists(FONT_DM_SERIF):
        path = FONT_DM_SERIF
    elif "allura" in name_lower and os.path.exists(FONT_ALLURA):
        path = FONT_ALLURA
    elif "ballet" in name_lower and os.path.exists(FONT_BALLET):
        path = FONT_BALLET

    if path:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass

    # System fallbacks
    for fallback in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "arial.ttf"
    ]:
        if os.path.exists(fallback):
            try:
                return ImageFont.truetype(fallback, size)
            except Exception:
                pass
    return ImageFont.load_default()


def load_preset(gender="female"):
    """Load user's unified main preset."""
    main_template_path = os.path.join(PRESETS_DIR, "main_template.json")
    if os.path.exists(main_template_path):
        with open(main_template_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # Fallback to female preset
    fallback = os.path.join(PRESETS_DIR, "preset_female.json")
    if os.path.exists(fallback):
        with open(fallback, "r", encoding="utf-8") as f:
            return json.load(f)

    return {"canvasWidth": 1080, "canvasHeight": 1440, "frames": [], "textLayers": [], "stickers": []}


def fetch_wikipedia_celebrity_photos(celeb_name):
    """Fetches real, verified high-res photo URLs for the celebrity from Wikipedia API."""
    urls = []
    clean_name = celeb_name.replace(" ", "_")
    
    # 1. Page Thumbnail
    try:
        api_url = f"https://en.wikipedia.org/w/api.php?action=query&titles={quote(clean_name)}&prop=pageimages&format=json&pithumbsize=1000"
        resp = requests.get(api_url, timeout=8, headers={"User-Agent": USER_AGENT})
        if resp.status_code == 200:
            pages = resp.json().get("query", {}).get("pages", {})
            for pid, pdata in pages.items():
                thumb = pdata.get("thumbnail", {}).get("source")
                if thumb:
                    urls.append(thumb)
    except Exception as e:
        print(f"  [!] Wikipedia pageimages error: {e}")

    # 2. Page images list
    try:
        api_url2 = f"https://en.wikipedia.org/w/api.php?action=query&titles={quote(clean_name)}&prop=images&format=json&imlimit=15"
        resp2 = requests.get(api_url2, timeout=8, headers={"User-Agent": USER_AGENT})
        if resp2.status_code == 200:
            pages = resp2.json().get("query", {}).get("pages", {})
            for pid, pdata in pages.items():
                for img_obj in pdata.get("images", []):
                    title = img_obj.get("title", "")
                    if any(ext in title.lower() for ext in [".jpg", ".jpeg", ".png"]) and not any(skip in title.lower() for skip in ["icon", "logo", "flag", "symbol", "stub"]):
                        # Get direct URL
                        info_url = f"https://en.wikipedia.org/w/api.php?action=query&titles={quote(title)}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json"
                        r_info = requests.get(info_url, timeout=6, headers={"User-Agent": USER_AGENT})
                        if r_info.status_code == 200:
                            inf_pages = r_info.json().get("query", {}).get("pages", {})
                            for _, ipdata in inf_pages.items():
                                iinfo = ipdata.get("imageinfo", [{}])[0]
                                direct = iinfo.get("thumburl") or iinfo.get("url")
                                if direct and direct not in urls:
                                    urls.append(direct)
                                    if len(urls) >= 8:
                                        break
    except Exception:
        pass

    return urls


def download_or_load_image(src, size=(800, 800)):
    """Downloads image or decodes Base64 data."""
    if not src:
        return None

    # Base64 Data URI
    if src.startswith("data:image"):
        try:
            header, encoded = src.split(",", 1)
            data = base64.b64decode(encoded)
            return Image.open(io.BytesIO(data)).convert("RGBA")
        except Exception:
            return None

    # Remote URL
    if src.startswith("http://") or src.startswith("https://"):
        try:
            resp = requests.get(src, timeout=10, headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200 and resp.content:
                return Image.open(io.BytesIO(resp.content)).convert("RGBA")
        except Exception:
            pass

    # Local file
    local_path = os.path.join(BASE_DIR, src) if not os.path.isabs(src) else src
    if os.path.exists(local_path):
        try:
            return Image.open(local_path).convert("RGBA")
        except Exception:
            pass

    return None


def draw_luxury_background(preset, W, H):
    """Draws rich museum/gold archival backdrop."""
    canvas = Image.new("RGBA", (W, H), (14, 16, 24, 255))

    # Check if preset has an embedded custom background
    bg_custom = preset.get("bgCustomImage") or preset.get("bgCustomImagePath")
    if bg_custom:
        bg_img = download_or_load_image(bg_custom, (W, H))
        if bg_img:
            fitted = ImageOps.fit(bg_img, (W, H), method=Image.Resampling.LANCZOS)
            canvas.paste(fitted, (0, 0))
            return canvas

    # Draw luxury dark radial gradient with warm gold glow
    draw = ImageDraw.Draw(canvas)
    center_x, center_y = W // 2, H // 2
    max_radius = math.hypot(center_x, center_y)

    for y in range(0, H, 2):
        t = y / float(H)
        # Deep Obsidian & Midnight Navy
        r = int(24 * (1 - t) + 10 * t)
        g = int(27 * (1 - t) + 12 * t)
        b = int(38 * (1 - t) + 18 * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255), width=2)

    # Subtle Gold Vignette Overlay
    vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    v_draw = ImageDraw.Draw(vignette)
    for r in range(150, int(max_radius), 20):
        alpha = int(180 * (r / max_radius) ** 2)
        v_draw.ellipse(
            [center_x - r, center_y - r, center_x + r, center_y + r],
            outline=(0, 0, 0, min(140, alpha)),
            width=20
        )
    canvas.paste(vignette, (0, 0), mask=vignette)
    return canvas


def create_frame_graphic(img, w, h, shape="gold_rect", border_width=15, border_color="#ffffff", corner_radius=12, label=""):
    """
    ALWAYS creates a beautiful frame graphic!
    If img is present, clips the photo into shape.
    If img is None, creates a luxury frosted velvet placeholder with star emblem.
    """
    output = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    if img is not None:
        content = ImageOps.fit(img, (w, h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.0))
    else:
        # Elegant velvet placeholder so frame is never invisible!
        content = Image.new("RGBA", (w, h), (26, 29, 41, 255))
        c_draw = ImageDraw.Draw(content)
        # Subtle interior gold gradient
        c_draw.rectangle([border_width, border_width, w - border_width, h - border_width], fill=(32, 36, 52, 255))
        # Cameo Star Accent
        star_font = get_font_by_name("cinzel", 36)
        c_draw.text((w // 2, h // 2), "★", font=star_font, fill=(212, 175, 55, 140), anchor="mm")

    # Shape mask
    mask = Image.new("L", (w, h), 0)
    draw_mask = ImageDraw.Draw(mask)
    rad = max(4, corner_radius)

    if shape == "diamond":
        pts = [(w // 2, 0), (w, h // 2), (w // 2, h), (0, h // 2)]
        draw_mask.polygon(pts, fill=255)
    elif shape == "oval":
        draw_mask.ellipse([(0, 0), (w, h)], fill=255)
    else:
        draw_mask.rounded_rectangle([(0, 0), (w, h)], radius=rad, fill=255)

    output.paste(content, (0, 0), mask=mask)

    # ALWAYS Draw Border!
    draw_border = ImageDraw.Draw(output)
    b_width = max(2, int(border_width))
    b_color = border_color or "#d4af37"

    if shape == "diamond":
        pts = [(w // 2, 0), (w, h // 2), (w // 2, h), (0, h // 2)]
        draw_border.line(pts + [pts[0]], fill=b_color, width=b_width)
    elif shape == "oval":
        draw_border.ellipse([(0, 0), (w, h)], outline=b_color, width=b_width)
    else:
        draw_border.rounded_rectangle([(0, 0), (w, h)], radius=rad, outline=b_color, width=b_width)

    return output


def render_text_layers(canvas, text_layers, celebrity_name, birth_date, birth_year, age):
    """Renders text with authentic Google Fonts & drop shadows."""
    draw = ImageDraw.Draw(canvas)

    for layer in text_layers:
        raw_text = layer.get("text", "")
        clean_lower = raw_text.strip().lower()

        # Rule 1: Keep "Happy Birthday" intact
        if "happy birthday" in clean_lower:
            final_text = raw_text
        # Rule 2: Birth date/year
        elif any(k in clean_lower for k in ["born", "birth", "19", "20", "age"]):
            if birth_year:
                final_text = f"Born {birth_year} • Age {age}" if age else f"Born {birth_year}"
            else:
                final_text = str(birth_date) if birth_date else raw_text
        # Rule 3: Celebrity Name
        else:
            final_text = celebrity_name

        font_family = layer.get("fontFamily", "cinzel")
        font_size = layer.get("fontSize", 54)
        color = layer.get("color", "#d4af37")
        x = layer.get("x", canvas.width // 2)
        y = layer.get("y", 100)
        align = layer.get("align", "center")

        font = get_font_by_name(font_family, font_size)

        # Draw deep luxury shadow
        draw.text((x + 3, y + 3), final_text, font=font, fill=(0, 0, 0, 220), anchor="mm" if align == "center" else "lt")
        draw.text((x + 1, y + 1), final_text, font=font, fill=(0, 0, 0, 180), anchor="mm" if align == "center" else "lt")
        # Draw foreground text
        draw.text((x, y), final_text, font=font, fill=color, anchor="mm" if align == "center" else "lt")


def draw_stickers(canvas, stickers):
    """Draws permanent logo watermarks and badges."""
    for s in stickers:
        src = s.get("src")
        if not src:
            continue
        w = int(s.get("width", 120))
        h = int(s.get("height", 120))
        sticker_img = download_or_load_image(src, (w, h))
        if not sticker_img:
            continue

        resized = sticker_img.resize((w, h), Image.Resampling.LANCZOS)
        rot = float(s.get("rotation", 0))
        if rot != 0:
            resized = resized.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)

        x = int(s.get("x", 0) - resized.width / 2)
        y = int(s.get("y", 0) - resized.height / 2)
        canvas.paste(resized, (x, y), mask=resized)


def generate_collage_for_post(celeb_name, gender, birth_date, birth_year, age, photo_urls, output_path):
    """Generates the full 1080x1440 luxury tribute post."""
    preset = load_preset(gender=gender)
    W = preset.get("canvasWidth", 1080)
    H = preset.get("canvasHeight", 1440)

    # 1. Background
    canvas = draw_luxury_background(preset, W, H)

    # 2. Gather verified photos (try URLs first; if fail, fetch Wikipedia)
    downloaded_photos = []
    for u in (photo_urls or []):
        img = download_or_load_image(u)
        if img:
            downloaded_photos.append(img)

    # If few or zero photos downloaded, fetch real Wikipedia photos!
    if len(downloaded_photos) < 4:
        print(f"  [i] Provided URLs had {len(downloaded_photos)} valid photos. Fetching real Wikipedia photos for {celeb_name}...")
        wiki_urls = fetch_wikipedia_celebrity_photos(celeb_name)
        for wu in wiki_urls:
            img = download_or_load_image(wu)
            if img:
                downloaded_photos.append(img)
                if len(downloaded_photos) >= 8:
                    break

    print(f"  [✓] Loaded {len(downloaded_photos)} active photos for {celeb_name}")

    # 3. Frames (sorted so Centerpiece Frame 8 renders on top!)
    frames = preset.get("frames", [])
    # Separate background quadrant frames and hero centerpiece frame
    bg_frames = [f for f in frames if "center" not in f.get("label", "").lower() and f.get("width", 0) < 600]
    hero_frames = [f for f in frames if f not in bg_frames]
    ordered_frames = bg_frames + hero_frames

    for idx, frame in enumerate(ordered_frames):
        w = int(frame.get("width", 400))
        h = int(frame.get("height", 400))
        x = int(frame.get("x", 50))
        y = int(frame.get("y", 50))
        shape = frame.get("shape", "white_rect")
        b_width = frame.get("borderWidth", 15)
        b_color = frame.get("borderColor", "#ffffff")
        c_rad = frame.get("cornerRadius", 12)

        # Select photo (hero frame gets first photo)
        photo_img = None
        if downloaded_photos:
            if frame in hero_frames:
                photo_img = downloaded_photos[0]
            else:
                photo_img = downloaded_photos[idx % len(downloaded_photos)]

        # ALWAYS create the frame graphic!
        frame_graphic = create_frame_graphic(
            photo_img, w, h,
            shape=shape,
            border_width=b_width,
            border_color=b_color,
            corner_radius=c_rad,
            label=frame.get("label", "")
        )
        rot = frame.get("rotation", 0)
        if rot != 0:
            frame_graphic = frame_graphic.rotate(-rot, expand=True, resample=Image.Resampling.BICUBIC)
            gw, gh = frame_graphic.size
            px = int(x + w / 2 - gw / 2)
            py = int(y + h / 2 - gh / 2)
            canvas.paste(frame_graphic, (px, py), mask=frame_graphic)
        else:
            canvas.paste(frame_graphic, (x, y), mask=frame_graphic)

    # 4. Stickers & Logo Watermarks
    stickers = preset.get("stickers", [])
    if stickers:
        draw_stickers(canvas, stickers)

    # 5. Text Layers with Google Fonts
    text_layers = preset.get("textLayers", [])
    render_text_layers(canvas, text_layers, celeb_name, birth_date, birth_year, age)

    # 6. Save Final Image
    final_rgb = canvas.convert("RGB")
    final_rgb.save(output_path, "JPEG", quality=95)
    print(f"  [✓] Generated luxury tribute: {output_path}")


def main():
    if not os.path.exists(TODAY_POSTS_PATH):
        print(f"[!] {TODAY_POSTS_PATH} not found.")
        return

    with open(TODAY_POSTS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

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

    print(f"[*] Building luxury collages for {len(posts)} daily posts...")
    for idx, post in enumerate(posts, start=1):
        celeb_name = post.get("celebrity_name") or post.get("name") or f"Celebrity_{idx}"
        gender = post.get("gender", "female")
        age = post.get("age", "")
        birth_year = post.get("birth_year", "")
        birth_date = post.get("birth_date", data.get("date", ""))
        photo_urls = post.get("photo_urls", [])

        clean_slug = re.sub(r'[^a-zA-Z0-9_]', '_', celeb_name)
        image_path = f"collages/{clean_slug}_Page_{idx}_Tribute.jpg"
        post["image_path"] = image_path

        dest_path = os.path.join(BASE_DIR, image_path)
        print(f"\nProcessing Post #{idx}: {celeb_name} ({gender.upper()}) -> {image_path}")
        generate_collage_for_post(celeb_name, gender, birth_date, birth_year, age, photo_urls, dest_path)

    # Save synchronized JSON
    with open(TODAY_POSTS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("\n[✓] All daily collages rendered successfully!")


if __name__ == "__main__":
    main()
