"""Generate checked, resumable speech files from the full editorial script."""
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
import edge_tts
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4

ROOT = Path(__file__).resolve().parents[1]

async def generate(folder):
    script = json.loads((folder / 'narration-script.json').read_text())
    cache = folder / '.narration-cache'
    cache.mkdir(exist_ok=True)
    async def speak(segment):
        digest = hashlib.sha256((script['voice'] + script['rate'] + segment['text']).encode()).hexdigest()
        target = cache / f'{digest}.mp3'
        if target.exists() and target.stat().st_size > 1200:
            MP3(target)
            return target
        for attempt in range(3):
            temp = target.with_suffix('.part')
            try:
                proxy = urllib.request.getproxies().get('https')
                await asyncio.wait_for(edge_tts.Communicate(segment['text'], script['voice'], rate=script['rate'], proxy=proxy).save(str(temp)), timeout=150)
                if MP3(temp).info.length < 1:
                    raise ValueError('Empty audio')
                temp.replace(target)
                print(f"speech_ready {segment['id']} bytes={target.stat().st_size}", flush=True)
                return target
            except Exception:
                temp.unlink(missing_ok=True)
                if attempt == 2:
                    raise
                await asyncio.sleep(2 ** attempt)

    # Sequential requests avoid service throttling and reuse completed chunks on retry.
    paths = []
    for segment in script['segments']:
        paths.append(await speak(segment))
    output = folder / 'narration-source.mp3'
    temp = output.with_suffix('.part')
    elapsed = 0
    chapters = []
    with temp.open('wb') as combined:
        for segment, path in zip(script['segments'], paths):
            duration = MP3(path).info.length
            chapters.append({**segment, 'start': round(elapsed, 3), 'duration': round(duration, 3)})
            elapsed += duration
            combined.write(path.read_bytes())
    duration = MP3(temp).info.length
    if abs(duration - elapsed) > 1:
        raise ValueError(f'Combined audio duration mismatch: {duration} vs {elapsed}')
    temp.replace(output)
    # Mono AAC keeps a full-length newscast small enough for static-site delivery.
    published = folder / 'narration.m4a'
    encoded = folder / 'narration-new.m4a'
    encoded.unlink(missing_ok=True)
    if shutil.which('afconvert'):
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '24000', '-c', '1', '-q', '127', str(output), str(encoded)], check=True)
    elif shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(output), '-c:a', 'aac', '-b:a', '24k', '-ac', '1', '-movflags', '+faststart', str(encoded)], check=True)
    else:
        raise RuntimeError('Audio encoding needs macOS afconvert or ffmpeg')
    if abs(MP4(encoded).info.length - duration) > 1:
        raise ValueError('AAC audio duration mismatch')
    encoded.replace(published)
    manifest = {key: value for key, value in script.items() if key != 'segments'}
    manifest.update(audio='narration.m4a', transcript='narration.txt', duration=round(duration, 3),
                    audio_sha256=hashlib.sha256(published.read_bytes()).hexdigest(), chapters=chapters)
    (folder / 'narration.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'narration_ready duration={duration:.1f}s bytes={published.stat().st_size}', flush=True)

if __name__ == '__main__':
    asyncio.run(generate(ROOT / 'runs' / sys.argv[1]))
