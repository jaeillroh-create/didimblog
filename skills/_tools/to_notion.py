#!/usr/bin/env python3
"""스킬 폴더를 Notion 업로드용 조각 파일로 변환한다.

- *.md  → Notion-flavored Markdown (파이프 표 → <table>, 코드 블록 밖 특수문자 이스케이프)
- *.py  → ```python 코드 블록 (원문 그대로)
- 큰 파일은 MAX_CHARS 단위로 나눠 part 파일을 만든다(코드 블록·표가 잘리지 않게 블록 경계에서 자름).

사용: python3 to_notion.py <skills_dir> <out_dir>
출력: <out_dir>/<skill>/NN_<상대경로>.partK.md + manifest.json
"""
import json
import os
import re
import sys

MAX_CHARS = 18000
ESC = re.compile(r"([\\*~`$\[\]<>{}|^])")
SKIP_FILES = {"prompts.json"}
SKIP_DIRS = {"__pycache__", "samples"}
DUP_NOTION_PAGE = "notion_page.py"  # core에만 정본 수록


def esc_inline(text: str) -> str:
    """인라인 코드(`...`)와 링크([..](..)), 굵게(**..**)는 살리고 나머지 특수문자만 이스케이프."""
    out, i = [], 0
    pattern = re.compile(r"(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))")
    for m in pattern.finditer(text):
        out.append(ESC.sub(r"\\\1", text[i:m.start()]))
        tok = m.group(0)
        if tok.startswith("**"):
            out.append("**" + ESC.sub(r"\\\1", tok[2:-2]) + "**")
        else:
            out.append(tok)
        i = m.end()
    out.append(ESC.sub(r"\\\1", text[i:]))
    return "".join(out)


def table_block(rows):
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    cells = [r for r in cells if not all(re.fullmatch(r":?-{2,}:?", c or "--") for c in r)]
    lines = ['<table header-row="true">']
    for r in cells:
        lines.append("\t<tr>")
        for c in r:
            lines.append(f"\t\t<td>{esc_inline(c)}</td>")
        lines.append("\t</tr>")
    lines.append("</table>")
    return lines


def convert_md(src: str):
    """블록 단위 리스트를 돌려준다(분할 경계용)."""
    blocks, lines, i = [], src.split("\n"), 0
    # YAML frontmatter → 코드 블록
    if lines and lines[0].strip() == "---":
        j = 1
        while j < len(lines) and lines[j].strip() != "---":
            j += 1
        blocks.append("```yaml\n" + "\n".join(lines[1:j]) + "\n```")
        i = j + 1
    while i < len(lines):
        ln = lines[i]
        if ln.lstrip().startswith("```"):
            fence = ln.lstrip()[:3]
            lang = ln.lstrip()[3:].strip()
            j = i + 1
            while j < len(lines) and not lines[j].lstrip().startswith(fence):
                j += 1
            body = "\n".join(l for l in lines[i + 1:j])
            blocks.append(f"```{lang}\n{body}\n```")
            i = j + 1
            continue
        if ln.strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{2,}", lines[i + 1]):
            j = i
            while j < len(lines) and lines[j].strip().startswith("|"):
                j += 1
            blocks.append("\n".join(table_block(lines[i:j])))
            i = j
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", ln)
        if m:
            level = min(len(m.group(1)), 4)
            blocks.append("#" * level + " " + esc_inline(m.group(2)))
        elif re.match(r"^\s*([-*+]|\d+\.)\s+", ln):
            indent = len(ln) - len(ln.lstrip(" "))
            tabs = "\t" * (indent // 2)
            mm = re.match(r"^\s*([-*+]|\d+\.)\s+(.*)$", ln)
            marker = "-" if mm.group(1) in "-*+" else mm.group(1)
            body = mm.group(2)
            if body.startswith("[ ] ") or body.startswith("[x] "):
                blocks.append(f"{tabs}- {body[:3]} {esc_inline(body[4:])}")
            else:
                blocks.append(f"{tabs}{marker} {esc_inline(body)}")
        elif ln.startswith(">"):
            blocks.append("> " + esc_inline(ln.lstrip("> ")))
        elif ln.strip() in ("---", "***"):
            blocks.append("---")
        elif ln.strip() == "":
            pass
        else:
            blocks.append(esc_inline(ln))
        i += 1
    return blocks


def split_blocks(blocks, limit=MAX_CHARS):
    parts, cur, size = [], [], 0
    for b in blocks:
        if len(b) > limit and b.startswith("```"):
            # 긴 코드 블록은 줄 단위로 쪼갠다
            head, body = b.split("\n", 1)
            body = body.rsplit("\n```", 1)[0]
            chunk = []
            for line in body.split("\n"):
                chunk.append(line)
                if sum(len(x) + 1 for x in chunk) > limit:
                    if cur:
                        parts.append("\n".join(cur)); cur, size = [], 0
                    parts.append(head + "\n" + "\n".join(chunk) + "\n```")
                    chunk = []
            if chunk:
                cur.append(head + "\n" + "\n".join(chunk) + "\n```"); size += len(cur[-1])
            continue
        if size + len(b) > limit and cur:
            parts.append("\n".join(cur)); cur, size = [], 0
        cur.append(b); size += len(b) + 1
    if cur:
        parts.append("\n".join(cur))
    return parts


def main(skills_dir, out_dir):
    manifest = {}
    for skill in sorted(os.listdir(skills_dir)):
        sdir = os.path.join(skills_dir, skill)
        if not skill.startswith("didim-blog-") or not os.path.isdir(sdir):
            continue
        files = []
        for root, dirs, fns in os.walk(sdir):
            dirs[:] = [d for d in sorted(dirs) if d not in SKIP_DIRS]
            for fn in sorted(fns):
                rel = os.path.relpath(os.path.join(root, fn), sdir)
                if fn in SKIP_FILES or not fn.endswith((".md", ".py", ".json")):
                    continue
                if fn == DUP_NOTION_PAGE and skill != "didim-blog-core":
                    continue
                files.append(rel)
        files.sort(key=lambda r: (r != "SKILL.md", not r.startswith("references"), r))
        odir = os.path.join(out_dir, skill)
        os.makedirs(odir, exist_ok=True)
        entries = []
        for n, rel in enumerate(files):
            src = open(os.path.join(sdir, rel), encoding="utf-8").read()
            if rel.endswith(".md"):
                blocks = convert_md(src)
            else:
                lang = "python" if rel.endswith(".py") else "json"
                blocks = [f"```{lang}\n{src.rstrip()}\n```"]
            parts = split_blocks(blocks)
            names = []
            for k, p in enumerate(parts, 1):
                name = f"{n:02d}_{rel.replace('/', '__')}.part{k}.md"
                open(os.path.join(odir, name), "w", encoding="utf-8").write(p)
                names.append(name)
            entries.append({"source": rel, "parts": names, "chars": len(src)})
        manifest[skill] = entries
    json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: {"files": len(v), "parts": sum(len(e["parts"]) for e in v)} for k, v in manifest.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
