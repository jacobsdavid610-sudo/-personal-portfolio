# Devlog

Notes on what I actually worked on, in the order I did it. New entries go on top.

## 2026-07-26

Added `scripts/summarize.py` — a small extractive text summarizer, pure Python, no
external dependencies. Scores sentences by word frequency and returns the top N.
Tested against a sample paragraph via both file input and stdin, works as expected.

## 2026-07-23

Set up this repo and the devlog workflow. Idea: instead of trying to backfill history or
automate meaningless commits, just write a short note here whenever I genuinely work on
something, then commit it that day. Real dates, real work, no scripting.
