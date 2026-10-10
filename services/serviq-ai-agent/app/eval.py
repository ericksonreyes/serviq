"""Eval runner — ~20-doc golden set. Scores document_type accuracy and
field extraction F1 without needing live model weights (stub mode).
"""
import json
import os
import sys

from .parser import parse_document


def main() -> int:
    dataset = os.path.join(os.path.dirname(__file__), "..", "evals", "dataset.jsonl")
    total = type_hit = 0
    tp = fp = fn = 0
    for line in open(dataset):
        case = json.loads(line)
        result = parse_document(case["synthetic_payload"].encode())
        total += 1
        if result["document_type"] == case["document_type"]:
            type_hit += 1
        expected = set(case.get("fields", {}).items())
        got = set((result["fields"] or {}).items())
        tp += len(expected & got)
        fp += len(got - expected)
        fn += len(expected - got)
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    print(f"docs={total} type_accuracy={type_hit/total:.2f} "
          f"field_F1={(2*precision*recall/(precision+recall)) if precision+recall else 0:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
