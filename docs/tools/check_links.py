#!/usr/bin/env python3
"""Confere se os links relativos dos arquivos .md apontam para arquivos que existem. Uso: python docs/tools/check_links.py"""
import re, sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
bad = 0
for md in list(root.glob("*.md")) + list((root / "docs").glob("*.md")) + list((root / "web").glob("README.md")):
    text = md.read_text(encoding="utf-8")
    for m in re.finditer(r"\]\(([^)#\s]+)(#[^)]*)?\)", text):
        target = m.group(1)
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        path = (md.parent / target).resolve()
        if not path.exists():
            print(f"{md.relative_to(root)}: link quebrado -> {target}")
            bad += 1
print("links ok" if not bad else f"{bad} link(s) quebrado(s)")
sys.exit(1 if bad else 0)
