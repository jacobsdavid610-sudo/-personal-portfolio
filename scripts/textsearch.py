#!/usr/bin/env python3
"""Tiny TF-IDF document search over a directory of text files. Pure
Python, no numpy/sklearn — builds term-frequency vectors weighted by
inverse document frequency and ranks documents by cosine similarity
against the query."""

import argparse
import math
import os
import re
from collections import Counter

TOKEN_RE = re.compile(r"[a-zA-Z']+")


def tokenize(text):
    return [w.lower() for w in TOKEN_RE.findall(text)]


def build_index(docs):
    """docs: {name: text} -> (term_freqs: {name: Counter}, idf: {term: float})"""
    term_freqs = {name: Counter(tokenize(text)) for name, text in docs.items()}

    doc_count = len(docs)
    doc_freq = Counter()
    for freqs in term_freqs.values():
        doc_freq.update(freqs.keys())

    idf = {
        term: math.log((1 + doc_count) / (1 + df)) + 1
        for term, df in doc_freq.items()
    }
    return term_freqs, idf


def vectorize(freqs, idf):
    return {term: count * idf.get(term, 0.0) for term, count in freqs.items()}


def cosine_similarity(a, b):
    common = set(a) & set(b)
    dot = sum(a[t] * b[t] for t in common)
    norm_a = math.sqrt(sum(v * v for v in a.values()))
    norm_b = math.sqrt(sum(v * v for v in b.values()))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def search(docs, query, top_n=5):
    term_freqs, idf = build_index(docs)
    doc_vectors = {name: vectorize(freqs, idf) for name, freqs in term_freqs.items()}
    query_vector = vectorize(Counter(tokenize(query)), idf)

    scored = [
        (name, cosine_similarity(query_vector, vec)) for name, vec in doc_vectors.items()
    ]
    scored = [(name, score) for name, score in scored if score > 0]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:top_n]


def load_docs(directory):
    docs = {}
    for dirpath, _dirnames, filenames in os.walk(directory):
        for name in filenames:
            if not name.endswith((".txt", ".md")):
                continue
            path = os.path.join(dirpath, name)
            with open(path, encoding="utf-8", errors="ignore") as f:
                docs[path] = f.read()
    return docs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", help="Directory of .txt/.md files to index")
    parser.add_argument("query", help="Search query")
    parser.add_argument("-n", "--top-n", type=int, default=5)
    args = parser.parse_args()

    docs = load_docs(args.directory)
    if not docs:
        print("No .txt/.md files found.")
        return 1

    results = search(docs, args.query, args.top_n)
    if not results:
        print("No matches.")
        return 0

    for name, score in results:
        print(f"{score:.4f}  {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
