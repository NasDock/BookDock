"""BookDock 三张 1080x1920 宣传图：裁切真实截图 + 生成系列 spec.json"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageChops

BASE = Path(__file__).resolve().parent
SRC = BASE / "src"
TEMPLATE = Path(
    "/Users/ctjj/.workbuddy/plugins/marketplaces/experts/plugins/"
    "icreator-poster-designer/skills/poster-compose/templates/recruit-notice.json"
)

W_CARD = 680          # 截图卡片内容宽
PAD = 24              # 阴影留边
FADE = 170            # 底部淡出高度
CROP = (0, 95, 861, 1520)
BG = "#F7F5F0"
INK = "#23241F"
SUB = "#6E6C64"
LINE = "#DDD9CE"
FOOT = "#8B887E"
FONT = "Hiragino Sans GB"

PAGES = [
    {
        "no": "01",
        "src": "shot-01-recommend.jpg",
        "card": "card-01.png",
        "spec": "spec_01.json",
        "out": "BookDock-01-推荐.png",
        "accent": "#7C4DBE",
        "title": "下一本，\n刚刚好",
        "desc": "继续阅读，接着上次的进度；\n为你推荐，遇见下一本喜欢。",
        "tags": "继续阅读  ·  为你推荐  ·  已读进度",
        "word": "DISCOVER",
    },
    {
        "no": "02",
        "src": "shot-02-library.jpg",
        "card": "card-02.png",
        "spec": "spec_02.json",
        "out": "BookDock-02-书仓.png",
        "accent": "#1E8F7E",
        "title": "所有书，\n一个书仓",
        "desc": "TXT、EPUB、PDF、MOBI 都收得下，\n未读、在读、已读完一眼看清。",
        "tags": "多格式  ·  分状态  ·  好查找",
        "word": "COLLECT",
    },
    {
        "no": "03",
        "src": "shot-03-reader.jpg",
        "card": "card-03.png",
        "spec": "spec_03.json",
        "out": "BookDock-03-阅读.png",
        "accent": "#A9743C",
        "title": "读得进去，\n才叫阅读",
        "desc": "正文、图表与图注原样呈现，\n柔和纸色里，安心读下去。",
        "tags": "正文排版  ·  图表图注  ·  纸色背景",
        "word": "IMMERSE",
        "top_pad": 24,   # 阅读页裁切落在正文中间，补一段同色留白
    },
]


def make_card(src: Path, dst: Path, top_pad: int = 0) -> int:
    """把整屏截图裁成内容卡片：圆角 + 底部淡出 + 极轻投影。返回内容高度。"""
    crop = Image.open(src).convert("RGB").crop(CROP)
    h = round(crop.height * W_CARD / crop.width)
    content = crop.resize((W_CARD, h), Image.LANCZOS).convert("RGBA")
    if top_pad:
        # 顶部补一条与截图同色的留白，正文整体下移、高度保持不变
        paper = content.getpixel((8, 8))[:3] + (255,)
        shifted = Image.new("RGBA", (W_CARD, h), paper)
        shifted.paste(content.crop((0, 0, W_CARD, h - top_pad)), (0, top_pad))
        content = shifted

    # 底部线性淡出
    alpha = Image.new("L", (W_CARD, h), 255)
    ad = ImageDraw.Draw(alpha)
    for y in range(h - FADE, h):
        ad.line([(0, y), (W_CARD, y)], fill=int(255 * (h - y) / FADE))

    # 四角圆角遮罩（4 倍超采样抗锯齿）
    big = Image.new("L", (W_CARD * 4, h * 4), 0)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, W_CARD * 4 - 1, h * 4 - 1), radius=28 * 4, fill=255
    )
    mask = big.resize((W_CARD, h), Image.LANCZOS)
    a = ImageChops.multiply(alpha, mask)
    content.putalpha(a)

    # 极淡描边，同样随圆角与淡出一起消隐
    edge = Image.new("RGBA", (W_CARD, h), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        (1, 1, W_CARD - 2, h - 2), radius=27,
        outline=(168, 158, 138, 110), width=2,
    )
    edge.putalpha(ImageChops.multiply(edge.getchannel("A"), a))
    content = Image.alpha_composite(content, edge)

    # 投影只覆盖不淡出的部分，避免底部出现灰团
    card = Image.new("RGBA", (W_CARD + 2 * PAD, h + 2 * PAD), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (W_CARD, h), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (0, 0, W_CARD - 1, h - FADE + 40), radius=28, fill=(58, 52, 42, 44)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    card.alpha_composite(shadow, (PAD, PAD + 16))
    card.alpha_composite(content, (PAD, PAD))
    card.save(dst)
    return h


def text(eid, text, x, y, w, size, color, **kw):
    el = {
        "type": "text", "id": eid, "text": text,
        "x": x, "y": y, "w": w, "max_width": w,
        "size": size, "font": FONT, "color": color,
        "align": "left", "anchor": "lt",
    }
    el.update(kw)
    return el


def make_spec(page, card_h):
    accent = page["accent"]
    card_w = W_CARD + 2 * PAD
    card_h_full = card_h + 2 * PAD
    elements = [
        text("brand", "BOOKDOCK", 96, 105, 460, 27, "#4A4A44",
             bold=True, stroke_width=1, letter_spacing=7),
        text("index", f'{page["no"]} / 03', 984, 105, 300, 26, accent,
             align="right", anchor="rt", letter_spacing=3),
        {"type": "line", "id": "rule-top", "x": 96, "y": 170,
         "x2": 984, "y2": 170, "color": LINE, "width": 2},
        {"type": "rect", "id": "accent-bar", "x": 96, "y": 218,
         "w": 58, "h": 8, "radius": 4, "fill": accent},
        # 唯一视觉重心：主标题
        text("title", page["title"], 96, 258, 888, 92, INK,
             min_size=60, max_height=270, bold=True, stroke_width=1,
             letter_spacing=3, line_height=1.3),
        text("desc", page["desc"], 96, 518, 830, 29, SUB,
             min_size=22, max_height=130, line_height=1.65),
        text("tags", page["tags"], 96, 630, 888, 24, accent,
             letter_spacing=2),
        {"type": "image", "id": "shot", "src": page["card"],
         "x": 176, "y": 672, "w": card_w, "h": card_h_full,
         "fit": "fill", "anchor": "lt"},
        text("footer-brand", "BOOKDOCK", 96, 1860, 400, 24, FOOT,
             letter_spacing=5),
        text("footer-word", page["word"], 984, 1860, 400, 24, accent,
             align="right", anchor="rt", letter_spacing=6),
    ]
    return {
        "_scene": f'BookDock 产品宣传图 {page["no"]}/03 · 1080x1920 简约系列',
        "output": page["out"],
        "size": [1080, 1920],
        "dpi": 96,
        "canvas_color": BG,
        "keep_original": True,
        "elements": elements,
    }


def main():
    # 复制随包模板到任务目录，作为 spec 基底（不修改原模板）
    spec_base = json.loads(TEMPLATE.read_text(encoding="utf-8"))
    (BASE / "spec.json").write_text(
        json.dumps(spec_base, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    for page in PAGES:
        h = make_card(SRC / page["src"], BASE / page["card"],
                      top_pad=page.get("top_pad", 0))
        spec = make_spec(page, h)
        (BASE / page["spec"]).write_text(
            json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f'{page["spec"]}: card {W_CARD + 2*PAD}x{h + 2*PAD}, content h={h}')


if __name__ == "__main__":
    main()
