"""Batch Indic Parler-TTS: load the model once, voice every line of a job.
Run with _studio/.venv-parler python:  parler.py <job.json>
job = {"model": repo, "description": str, "seed": int, "lines": [{"text": str, "out": wav_path, "seed"?: int}]}
The model is gated on Hugging Face: needs an accepted licence + a saved HF token (hf auth login)."""
import json
import sys

import soundfile as sf
import torch
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer

job = json.load(open(sys.argv[1], encoding="utf-8"))
model = ParlerTTSForConditionalGeneration.from_pretrained(job["model"])
tok = AutoTokenizer.from_pretrained(job["model"])
desc_tok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)
d = desc_tok(job["description"], return_tensors="pt")
for line in job["lines"]:
    torch.manual_seed(line.get("seed", job.get("seed", 7)))  # fixed seed → steadier narrator; retries pass a new one
    p = tok(line["text"], return_tensors="pt")
    gen = model.generate(input_ids=d.input_ids, attention_mask=d.attention_mask,
                         prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
    audio = gen.cpu().numpy().squeeze()
    sf.write(line["out"], audio, model.config.sampling_rate)
    print(f"parler: {line['out']} ({len(audio) / model.config.sampling_rate:.1f}s)", flush=True)
