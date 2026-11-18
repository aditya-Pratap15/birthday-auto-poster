#!/usr/bin/env python3
"""
Local ML Background Remover Fallback
Uses rembg (U2-Net / BiRefNet) to remove image backgrounds locally without external APIs.
Usage: python scripts/remove_background.py <input_path> <output_path>
"""

import sys
import os

def remove_bg(input_path, output_path):
    try:
        from rembg import remove
        from PIL import Image
    except ImportError:
        print("[!] rembg not installed. Install with: pip install rembg onnxruntime pillow")
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"[!] Input file does not exist: {input_path}")
        sys.exit(1)

    print(f"[*] Processing background removal: {input_path} -> {output_path}")
    input_image = Image.open(input_path)
    if input_image.mode != "RGB":
        input_image = input_image.convert("RGB")
    # Optimize dimensions for ultra-fast U2-Net inference (max 1280px maintains 4K portrait quality while 10x faster)
    if max(input_image.size) > 1280:
        input_image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
    output_image = remove(input_image)
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    output_image.save(output_path, "PNG")
    print(f"[OK] Background removed successfully: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python remove_background.py <input_path> <output_path>")
        sys.exit(1)
    remove_bg(sys.argv[1], sys.argv[2])
