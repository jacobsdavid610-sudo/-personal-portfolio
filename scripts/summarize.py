#!/usr/bin/env python3
"""Extractive text summarizer: scores sentences by word-frequency and
picks the top N. No external dependencies."""

import re
import sys
import argparse
from collections import Counter

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "so", "of", "to",
    "in", "on", "at", "for", "with", "as", "is", "are", "was", "were",
    "be", "been", "being", "it", "its", "this", "that", "these", "those",
    "by", "from", "not", "no", "do", "does", "did", "has", "have", "had",
}


def split_sentences(text):
    text = re.sub(r"\s+", " ", text).strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return [s for s in sentences if s]


def word_frequencies(sentences):
    words = re.findall(r"[a-zA-Z']+", " ".join(sentences).lower())
    words = [w for w in words if w not in STOPWORDS]
    return Counter(words)


def score_sentences(sentences, freqs):
    scores = []
    for sentence in sentences:
        words = re.findall(r"[a-zA-Z']+", sentence.lower())
        words = [w for w in words if w not in STOPWORDS]
        score = sum(freqs[w] for w in words)
        scores.append(score / (len(words) + 1))
    return scores


def summarize(text, num_sentences=3):
    sentences = split_sentences(text)
    if len(sentences) <= num_sentences:
        return sentences
    freqs = word_frequencies(sentences)
    scores = score_sentences(sentences, freqs)
    ranked = sorted(range(len(sentences)), key=lambda i: scores[i], reverse=True)
    top = sorted(ranked[:num_sentences])
    return [sentences[i] for i in top]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", help="Text file to summarize (default: stdin)")
    parser.add_argument("-n", "--num-sentences", type=int, default=3)
    args = parser.parse_args()

    text = open(args.file, encoding="utf-8").read() if args.file else sys.stdin.read()
    for sentence in summarize(text, args.num_sentences):
        print(sentence)


if __name__ == "__main__":
    main()
