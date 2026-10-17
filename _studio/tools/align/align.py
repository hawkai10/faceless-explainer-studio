"""Forced alignment of KNOWN script text to audio (WhisperX's wav2vec2 aligner) — runs in _studio/.venv-align
(python -m venv .venv-align; pip install whisperx). Added 2026-10-08.

  python align.py jobs.json  →  stdout JSON: per job, per segment, [{word, start, end}] (seconds, absolute in that wav)

jobs.json: [{"wav": "path.wav", "segments": [{"text": "...", "start": s, "end": e}, ...]}, ...]
Each segment's text is aligned inside its [start, end] window. Words the aligner can't place (symbols, digits) get
times interpolated from their neighbours, so every script word comes back with a start and an end.
"""
import json
import re
import sys


def fill(words, s0, s1):
    n = len(words)
    for i, w in enumerate(words):
        if w.get("start") is None:
            prev = next((words[j]["end"] for j in range(i - 1, -1, -1) if words[j].get("end") is not None), s0)
            nxt = next((words[j]["start"] for j in range(i + 1, n) if words[j].get("start") is not None), s1)
            w["start"], w["end"] = prev, max(prev, nxt)
    return words


def main():
    import whisperx
    jobs = json.load(open(sys.argv[1], encoding="utf-8"))
    model, meta = whisperx.load_align_model(language_code="en", device="cpu")
    out = []
    for job in jobs:
        audio = whisperx.load_audio(job["wav"])
        res_job = []
        for seg in job["segments"]:
            text = seg["text"].strip()
            r = whisperx.align([{"text": text, "start": seg["start"], "end": seg["end"]}], model, meta, audio, "cpu",
                               return_char_alignments=False)
            ws = [{"word": w.get("word"), "start": w.get("start"), "end": w.get("end")} for w in r.get("word_segments", [])]
            # the aligner may drop tokens it can't place; rebuild the script's own word list and copy times across
            script = re.findall(r"\S+", text)
            got, k = [], 0
            for sw in script:
                hit = None
                for j in range(k, min(k + 3, len(ws))):
                    if ws[j]["word"] and re.sub(r"\W", "", ws[j]["word"]).lower() == re.sub(r"\W", "", sw).lower():
                        hit = ws[j]
                        k = j + 1
                        break
                got.append({"word": sw, "start": hit and hit["start"], "end": hit and hit["end"]})
            res_job.append(fill(got, seg["start"], seg["end"]))
        out.append(res_job)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
