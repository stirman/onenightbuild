#!/usr/bin/env python3
"""Generate Wavelength puzzle data from GloVe embeddings."""
import os, json, sys
import numpy as np
from pathlib import Path

GLOVE_URL = "https://nlp.stanford.edu/data/glove.6B.zip"
GLOVE_FILE = Path.home() / ".cache" / "wavelength" / "glove.6B.100d.txt"
PUZZLE_DIR = Path(__file__).parent / "puzzles"
NUM_RANKED = 10000  # top N words to include per puzzle

# Good secret words: common, concrete, interesting
SECRET_WORDS = [
    # 30 days of puzzles
    "ocean", "guitar", "sunset", "castle", "dragon",
    "coffee", "garden", "planet", "thunder", "crystal",
    "bridge", "candle", "forest", "rocket", "diamond",
    "island", "shadow", "velvet", "phoenix", "mirror",
    "anchor", "breeze", "copper", "falcon", "harvest",
    "jungle", "lantern", "marble", "nebula", "pyramid",
    "river", "silver", "temple", "volcano", "whisper",
    "arctic", "ballet", "canyon", "dolphin", "ember",
    "flame", "glacier", "horizon", "ivory", "jasmine",
    "kingdom", "legend", "mountain", "oasis", "pearl",
    "quest", "rainbow", "spiral", "treasure", "unicorn",
    "voyage", "winter", "zenith", "armor", "blossom",
]

# Common English words filter (skip rare/weird words)
SKIP_WORDS = set()

def download_glove():
    """Download GloVe if not cached."""
    if GLOVE_FILE.exists():
        print(f"GloVe found at {GLOVE_FILE}")
        return
    
    GLOVE_FILE.parent.mkdir(parents=True, exist_ok=True)
    print("Downloading GloVe 6B (822MB)...")
    import urllib.request, zipfile, io
    
    zip_path = GLOVE_FILE.parent / "glove.6B.zip"
    if not zip_path.exists():
        urllib.request.urlretrieve(GLOVE_URL, zip_path)
    
    print("Extracting 100d vectors...")
    with zipfile.ZipFile(zip_path) as zf:
        zf.extract("glove.6B.100d.txt", GLOVE_FILE.parent)
    print("Done!")

def load_glove():
    """Load GloVe vectors, return (words, vectors) for common words."""
    print("Loading GloVe vectors...")
    words = []
    vecs = []
    
    with open(GLOVE_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.rstrip().split(' ')
            word = parts[0]
            # Only keep alphabetic, lowercase, 2+ chars
            if not word.isalpha() or len(word) < 2:
                continue
            if word in SKIP_WORDS:
                continue
            words.append(word)
            vecs.append(np.array([float(x) for x in parts[1:]], dtype=np.float32))
    
    vecs = np.stack(vecs)
    # Normalize
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    vecs = vecs / norms
    
    print(f"Loaded {len(words)} words")
    return words, vecs

def generate_puzzle(target_word, words, vecs, num_ranked=NUM_RANKED):
    """Generate ranked word list for a target word."""
    if target_word not in words:
        print(f"  WARNING: '{target_word}' not in vocabulary!")
        return None
    
    idx = words.index(target_word)
    target_vec = vecs[idx]
    
    # Cosine similarity (already normalized)
    sims = vecs @ target_vec
    
    # Sort by similarity (descending)
    ranked_indices = np.argsort(-sims)
    
    # Build ranked list (skip the target word itself)
    ranked = []
    for i in ranked_indices:
        w = words[i]
        if w == target_word:
            continue
        ranked.append(w)
        if len(ranked) >= num_ranked:
            break
    
    return ranked

def main():
    download_glove()
    words, vecs = load_glove()
    
    PUZZLE_DIR.mkdir(exist_ok=True)
    
    from datetime import date, timedelta
    start = date(2026, 2, 25)  # Day 1
    
    for i, secret in enumerate(SECRET_WORDS):
        d = start + timedelta(days=i)
        date_str = d.isoformat()
        outfile = PUZZLE_DIR / f"{date_str}.json"
        
        if outfile.exists():
            print(f"  {date_str}: already exists, skipping")
            continue
        
        print(f"  {date_str}: generating '{secret}'...")
        ranked = generate_puzzle(secret, words, vecs)
        if ranked is None:
            continue
        
        puzzle = {
            "word": secret,
            "ranked": ranked
        }
        
        with open(outfile, 'w') as f:
            json.dump(puzzle, f)
        
        size_kb = outfile.stat().st_size / 1024
        print(f"    → {size_kb:.0f} KB")
    
    # Also generate fallback (first puzzle)
    fallback = PUZZLE_DIR / "fallback.json"
    if not fallback.exists():
        ranked = generate_puzzle(SECRET_WORDS[0], words, vecs)
        if ranked:
            with open(fallback, 'w') as f:
                json.dump({"word": SECRET_WORDS[0], "ranked": ranked}, f)
    
    print("\nDone! Generated puzzles in", PUZZLE_DIR)

if __name__ == "__main__":
    main()
