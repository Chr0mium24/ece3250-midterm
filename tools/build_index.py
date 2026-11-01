"""生成全站搜索索引 assets/search-index.js。
用法：uv run --with beautifulsoup4 python tools/build_index.py
每个 h2[id] / h3[id] 是一条记录：标题（中/英）、正文（中/英，公式简化成纯文本）、data-kw 关键词。"""
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "lectures.html", "homework.html", "methods.html", "calc.html"]
SKIP = {"script", "style", "svg", "canvas", "textarea", "input", "select"}
GREEK = {k: k for k in "alpha beta gamma delta sigma tau theta omega lambda rho mu pi".split()}
KEEP = {"sin", "cos", "det", "lim", "Re", "dot", "infty"}


def tex_plain(t):
    t = re.sub(r"\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)", t)
    t = re.sub(r"\\(begin|end)\{[a-z*]*\}", " ", t)
    t = re.sub(r"\\([A-Za-z]+)", lambda m: " " + (m.group(1) if (m.group(1) in GREEK or m.group(1) in KEEP) else "") + " ", t)
    t = t.replace("\\\\", " ").replace("&", " ").replace("{", "").replace("}", "").replace("\\", "")
    return re.sub(r"\s+", " ", t).strip()


def clean(s):
    s = re.sub(r"\$\$(.+?)\$\$", lambda m: " " + tex_plain(m.group(1)) + " ", s, flags=re.S)
    s = re.sub(r"\$(.+?)\$", lambda m: " " + tex_plain(m.group(1)) + " ", s, flags=re.S)
    return re.sub(r"\s+", " ", s).strip()


def lang_text(node, lang):
    other = "en" if lang == "zh" else "zh"
    out = []

    def walk(n):
        if isinstance(n, NavigableString):
            out.append(str(n))
            return
        if not isinstance(n, Tag) or n.name in SKIP:
            return
        if other in (n.get("class") or []):
            return
        for c in n.children:
            walk(c)
        if n.name in ("p", "li", "div", "td", "th", "tr", "summary", "h3", "h4", "br"):
            out.append(" ")

    walk(node)
    return clean("".join(out))


def heading_title(h, lang):
    c = BeautifulSoup(str(h), "html.parser").find(h.name)
    for t in c.select(".tags"):
        t.decompose()
    for t in c.select(".lno"):
        t.string = t.get_text() + " "
    return lang_text(c, lang)


def section_nodes(h):
    level = int(h.name[1])
    nodes = []
    for sib in h.next_siblings:
        if isinstance(sib, Tag):
            if re.fullmatch(r"h[1-%d]" % level, sib.name):
                break
            if level == 3 and sib.name == "h3" and sib.get("id"):
                break
        nodes.append(sib)
    return nodes


def build():
    entries = []
    for page in PAGES:
        soup = BeautifulSoup((ROOT / page).read_text(encoding="utf-8"), "html.parser")
        main = soup.find("main")
        parent = None
        for h in main.find_all(["h2", "h3"]):
            if h.name == "h2":
                parent = h
            hid = h.get("id")
            if not hid:
                continue
            tz, te = heading_title(h, "zh"), heading_title(h, "en")
            z = " ".join(lang_text(n, "zh") if isinstance(n, Tag) else clean(str(n)) for n in section_nodes(h))
            e = " ".join(lang_text(n, "en") if isinstance(n, Tag) else clean(str(n)) for n in section_nodes(h))
            z, e = re.sub(r"\s+", " ", z).strip(), re.sub(r"\s+", " ", e).strip()
            if e == z:  # 只有中文的页面（讲义）
                e = ""
            if te == tz:
                te = ""
            entries.append({
                "p": page, "id": hid, "l": int(h.name[1]),
                "tz": tz, "te": te,
                "kw": " ".join(filter(None, [h.get("data-kw", ""), (parent.get("id", "") + " " + heading_title(parent, "zh") + " " + heading_title(parent, "en")) if (parent is not None and parent is not h) else ""])),
                "z": z[:1600], "e": e[:1600],
            })
    js = "/* 自动生成：tools/build_index.py */\nwindow.SEARCH_INDEX=" + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "assets" / "search-index.js").write_text(js, encoding="utf-8")
    print(f"{len(entries)} entries, {len(js) // 1024} KB")


if __name__ == "__main__":
    build()
