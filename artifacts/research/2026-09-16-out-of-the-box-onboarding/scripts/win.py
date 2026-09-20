#!/usr/bin/env python3
"""Контекстные окна вокруг шаблона в произвольных файлах (кириллица — regex Python, не ugrep).
Запуск: python3 scripts/win.py <regex> <файл...> [--win 300] [--max 10]"""
import re, sys
args = sys.argv[1:]
win = int(args[args.index('--win')+1]) if '--win' in args else 300
mx  = int(args[args.index('--max')+1]) if '--max' in args else 10
pat = args[0]
files = [a for a in args[1:] if not a.startswith('--') and a not in (str(win), str(mx))]
rx = re.compile(pat, re.I)
n = 0
for f in files:
    try: t = open(f, encoding='utf-8', errors='replace').read()
    except Exception: continue
    for m in rx.finditer(t):
        if n >= mx: break
        a = max(0, m.start()-win//3)
        frag = ' '.join(t[a:a+win].split())
        print(f"--- {f}:{t[:m.start()].count(chr(10))+1}\n{frag}\n")
        n += 1
    if n >= mx: break
if not n: print("(совпадений нет)")
