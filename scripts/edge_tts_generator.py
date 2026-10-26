#!/usr/bin/env python3
"""
Python Edge-TTS Voice Generator with Millisecond Word Boundaries
Provides bulletproof synthesis for en-US-ChristopherNeural and en-US-JennyNeural.
"""
import sys
import os
import json
import asyncio

async def synthesize(text, voice, audio_path, json_path):
    try:
        import edge_tts
    except ImportError:
        print("[!] edge-tts not installed in python environment", file=sys.stderr)
        sys.exit(2)

    communicate = edge_tts.Communicate(text, voice, boundary="WordBoundary")
    words = []

    with open(audio_path, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offset and duration in ticks (100 nanoseconds -> 10,000,000 per second)
                start_sec = chunk["offset"] / 10000000.0
                dur_sec = chunk["duration"] / 10000000.0
                words.append({
                    "text": chunk["text"],
                    "start": round(start_sec, 3),
                    "end": round(start_sec + dur_sec, 3)
                })

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(words, f, indent=2)

    print(f"OK: {len(words)} word boundaries captured")

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: edge_tts_generator.py <text_or_file> <voice> <output_audio> <output_json>", file=sys.stderr)
        sys.exit(1)

    input_source = sys.argv[1]
    if os.path.isfile(input_source):
        with open(input_source, "r", encoding="utf-8") as f:
            text_arg = f.read()
    else:
        text_arg = input_source

    voice_arg = sys.argv[2]
    audio_arg = sys.argv[3]
    json_arg = sys.argv[4]

    asyncio.run(synthesize(text_arg, voice_arg, audio_arg, json_arg))
