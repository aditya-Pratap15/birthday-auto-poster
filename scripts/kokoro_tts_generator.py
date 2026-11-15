#!/usr/bin/env python3
"""
Kokoro AI TTS Voice Generator with Whisper Word Alignment & Bulletproof Fallback
---------------------------------------------------------------------------------
1. High-fidelity neural voice synthesis using Kokoro-82M:
   - Male Voice: am_adam (warm, documentary narrator)
   - Female Voice: af_bella (vibrant, engaging reel voice)
2. Accurate millisecond word boundary extraction via faster-whisper (tiny.en, int8 CPU)
   for dynamic word-by-word visual captions.
3. Automatic fallback to edge-tts if Kokoro is unavailable.
"""
import sys
import os

# 1. Sanitize PATH to eliminate MSYS/MinGW conflicts on Windows environments
clean_paths = [p for p in os.environ.get("PATH", "").split(os.pathsep) if "msys64" not in p.lower()]
os.environ["PATH"] = os.pathsep.join(clean_paths)

import json
import asyncio

def fallback_edge_tts(text, voice_code, audio_path, json_path):
    print("[!] Falling back to Microsoft Edge-TTS engine...", file=sys.stderr)
    try:
        import edge_tts
    except ImportError:
        print("[!] edge-tts not installed, cannot fallback", file=sys.stderr)
        sys.exit(1)

    edge_voice = "en-US-ChristopherNeural"
    if any(k in voice_code.lower() for k in ["female", "jenny", "aria", "bella", "heart", "woman", "girl", "sarah", "nicole"]):
        edge_voice = "en-US-JennyNeural"

    async def _run():
        communicate = edge_tts.Communicate(text, edge_voice, boundary="WordBoundary")
        words = []
        with open(audio_path, "wb") as f:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start_sec = chunk["offset"] / 10000000.0
                    dur_sec = chunk["duration"] / 10000000.0
                    words.append({
                        "text": chunk["text"],
                        "start": round(start_sec, 3),
                        "end": round(start_sec + dur_sec, 3)
                    })
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(words, f, indent=2)
        print(f"[+] Edge-TTS fallback successful: {len(words)} word boundaries captured", file=sys.stderr)

    asyncio.run(_run())

def synthesize_kokoro(text, voice_code, audio_path, json_path):
    try:
        import soundfile as sf
        import numpy as np
        from kokoro import KPipeline

        # Map voice
        v_lower = voice_code.lower()
        if "liam" in v_lower or v_lower == "am_liam":
            kokoro_voice = "am_liam"
            voice_speed = 1.08
        elif "sarah" in v_lower or v_lower == "af_sarah":
            kokoro_voice = "af_sarah"
            voice_speed = 1.08
        elif "eric" in v_lower or v_lower == "am_eric":
            kokoro_voice = "am_eric"
            voice_speed = 1.08
        elif "michael" in v_lower or v_lower == "am_michael":
            kokoro_voice = "am_michael"
            voice_speed = 1.08
        elif "adam" in v_lower or v_lower == "am_adam":
            kokoro_voice = "am_adam"
            voice_speed = 1.05
        elif "bella" in v_lower or v_lower == "af_bella":
            kokoro_voice = "af_bella"
            voice_speed = 1.05
        elif "nicole" in v_lower or v_lower == "af_nicole":
            kokoro_voice = "af_nicole"
            voice_speed = 1.08
        elif any(k in v_lower for k in ["female", "jenny", "aria", "heart", "woman", "girl"]):
            kokoro_voice = "af_bella"
            voice_speed = 1.05
        else:
            kokoro_voice = "am_adam"
            voice_speed = 1.05

        print(f"[*] Kokoro AI Engine: Synthesizing voice '{kokoro_voice}' (speed={voice_speed})...", file=sys.stderr)
        pipeline = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M') # American English
        generator = pipeline(text, voice=kokoro_voice, speed=voice_speed, split_pattern=r'\n+')

        audio_chunks = []
        for _, _, audio in generator:
            if audio is not None and len(audio) > 0:
                audio_chunks.append(audio)

        if not audio_chunks:
            raise RuntimeError("Kokoro produced empty audio stream")

        full_audio = np.concatenate(audio_chunks)

        # Write audio (Kokoro natively outputs 24000 Hz)
        sf.write(audio_path, full_audio, 24000)
        print(f"[+] Audio successfully generated at: {audio_path}", file=sys.stderr)

        # Word-level alignment via faster-whisper (direct numpy feed, zero container issues)
        words = []
        try:
            from faster_whisper import WhisperModel
            print("[*] Running Faster-Whisper alignment for millisecond captions...", file=sys.stderr)
            
            # Resample 24k to 16k for Whisper
            target_len = int(len(full_audio) * 16000 / 24000)
            audio_16k = np.interp(
                np.linspace(0, len(full_audio), target_len, endpoint=False),
                np.arange(len(full_audio)),
                full_audio
            ).astype(np.float32)

            whisper_model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
            segments, _ = whisper_model.transcribe(audio_16k, word_timestamps=True, language="en")
            for seg in segments:
                if seg.words:
                    for w in seg.words:
                        clean_w = w.word.strip()
                        if clean_w:
                            words.append({
                                "text": clean_w,
                                "start": round(w.start, 3),
                                "end": round(w.end, 3)
                            })
        except Exception as we:
            print(f"[!] Whisper alignment notice ({we}), using proportional timing fallback", file=sys.stderr)
            audio_info = sf.info(audio_path)
            total_dur = audio_info.duration
            tokens = [t for t in text.split() if t.strip()]
            avg_dur = total_dur / max(1, len(tokens))
            for idx, tok in enumerate(tokens):
                s = idx * avg_dur
                words.append({
                    "text": tok,
                    "start": round(s, 3),
                    "end": round(min(total_dur, s + avg_dur), 3)
                })

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(words, f, indent=2)

        print(f"[+] Complete: {len(words)} word boundaries captured", file=sys.stderr)

    except Exception as e:
        print(f"[!] Kokoro AI synthesis error: {e}", file=sys.stderr)
        fallback_edge_tts(text, voice_code, audio_path, json_path)

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: kokoro_tts_generator.py <text_or_file> <voice> <output_audio> <output_json>", file=sys.stderr)
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

    synthesize_kokoro(text_arg, voice_arg, audio_arg, json_arg)
