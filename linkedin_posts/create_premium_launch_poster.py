import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = r"C:\Users\dines\brisketbox\linkedin_posts"
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOGO_DARK = r"C:\Users\dines\brisketbox\frontend\public\images\logo-dark.png"
HERO_MEAT = r"C:\Users\dines\brisketbox\frontend\public\images\hero_banner_meat.jpg"
PROD_1 = r"C:\Users\dines\brisketbox\frontend\public\images\products\prod_1.jpg"

# 1440 x 1800 px (Exact 4:5 Portrait Ratio - Master Print & Digital Billboard Quality)
W, H = 1440, 1800

FONT_SERIF_BOLD = r"C:\Windows\Fonts\georgiab.ttf"
FONT_SERIF_REG = r"C:\Windows\Fonts\georgia.ttf"
FONT_SERIF_ITALIC = r"C:\Windows\Fonts\georgiai.ttf"
FONT_SANS_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_SANS_REG = r"C:\Windows\Fonts\segoeui.ttf"
FONT_SANS_LIGHT = r"C:\Windows\Fonts\segoeuisl.ttf"

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

def draw_letterspaced_text(draw, pos, text, font, fill, spacing=2):
    """Draws uppercase text with disciplined typographic kerning."""
    x, y = pos
    for char in text:
        bbox = font.getbbox(char)
        w = bbox[2] - bbox[0] if bbox else 10
        draw.text((x, y), char, font=font, fill=fill)
        x += w + spacing

def get_letterspaced_width(font, text, spacing=2):
    total = 0
    for char in text:
        bbox = font.getbbox(char)
        w = bbox[2] - bbox[0] if bbox else 10
        total += w + spacing
    return total - spacing if total > 0 else 0

def build_poster():
    # Base Canvas: Deep charcoal and near-black foundation (#0D0D11)
    canvas = Image.new("RGBA", (W, H), (13, 13, 17, 255))

    # 1. Natural Depth & Subtle Burgundy/Wine Undertones (NO artificial neon glows)
    ambient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    adraw = ImageDraw.Draw(ambient)
    # Warm burgundy undertone beneath headline and behind the centerpiece
    adraw.ellipse([W//2 - 500, 200, W//2 + 500, 1100], fill=(55, 14, 22, 50))
    adraw.ellipse([W - 350, H - 400, W + 150, H + 100], fill=(28, 12, 16, 35))
    ambient = ambient.filter(ImageFilter.GaussianBlur(180))
    canvas.paste(ambient, (0, 0), ambient)

    draw = ImageDraw.Draw(canvas)

    # Master Margins: 104px left and right for generous, confident breathing space
    MARGIN = 104
    CONTENT_W = W - (MARGIN * 2)

    # -------------------------------------------------------------
    # 2. TOP BAR: Refined Brand Identity & Subtle Launch Announcement
    # -------------------------------------------------------------
    top_y = 100
    
    # Left: Official BRISKET BOX Logo
    if os.path.exists(LOGO_DARK):
        logo = Image.open(LOGO_DARK).convert("RGBA")
        logo_w = 270
        aspect = logo.height / logo.width
        logo_h = int(logo_w * aspect)
        logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
        canvas.paste(logo, (MARGIN, top_y), logo)
    else:
        f_brand = get_font(FONT_SANS_BOLD, 28)
        draw_letterspaced_text(draw, (MARGIN, top_y), "BRISKET BOX", f_brand, (247, 245, 240), spacing=4)

    # Right: Understated Launch Announcement (Restrained luxury)
    f_launch_tag = get_font(FONT_SANS_BOLD, 14)
    tag_text = "THE INAUGURAL RELEASE  •  NOW LIVE"
    tag_w = get_letterspaced_width(f_launch_tag, tag_text, spacing=3)
    tag_x = W - MARGIN - tag_w
    draw_letterspaced_text(draw, (tag_x, top_y + 12), tag_text, f_launch_tag, (217, 27, 62), spacing=3)

    # Hairline Top Rule
    rule_y = top_y + 70
    draw.line([MARGIN, rule_y, W - MARGIN, rule_y], fill=(255, 255, 255, 20), width=1)

    # -------------------------------------------------------------
    # 3. CENTRE: Hero Headline & Editorial Subtitle
    # -------------------------------------------------------------
    head_y = rule_y + 50

    # Eyebrow Category Descriptor
    f_eyebrow = get_font(FONT_SANS_BOLD, 14)
    eb_text = "CRAFT BUTCHERY  •  UNBROKEN COLD CHAIN"
    draw_letterspaced_text(draw, (MARGIN, head_y), eb_text, f_eyebrow, (217, 27, 62), spacing=3)

    # Headline: Bold, distinctive, and unhurried
    f_h1 = get_font(FONT_SERIF_BOLD, 72)
    line1 = "Freshness, Re-engineered."
    draw.text((MARGIN, head_y + 34), line1, font=f_h1, fill=(247, 245, 240))

    # Supporting Subtitle
    f_sub = get_font(FONT_SANS_LIGHT, 22)
    sub_text = "Never frozen. Cut strictly to order and hand-delivered in a 0°C to 4°C medical thermal lock."
    draw.text((MARGIN, head_y + 126), sub_text, font=f_sub, fill=(175, 172, 168))

    # -------------------------------------------------------------
    # 4. PRODUCT PHOTOGRAPHY: Dominant Centerpiece
    # -------------------------------------------------------------
    photo_y = head_y + 185
    photo_w = CONTENT_W
    photo_h = 700  # Generous height: the photography commands the page

    photo_path = HERO_MEAT if os.path.exists(HERO_MEAT) else PROD_1
    if os.path.exists(photo_path):
        photo = Image.open(photo_path).convert("RGBA")
        
        pr = photo.width / photo.height
        tr = photo_w / photo_h
        if pr > tr:
            new_h = photo_h
            new_w = int(photo_h * pr)
        else:
            new_w = photo_w
            new_h = int(photo_w / pr)
            
        photo = photo.resize((new_w, new_h), Image.Resampling.LANCZOS)
        cx = (new_w - photo_w) // 2
        cy = (new_h - photo_h) // 2
        photo = photo.crop((cx, cy, cx + photo_w, cy + photo_h))

        # Realistic contact shadow beneath the frame
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sdraw = ImageDraw.Draw(shadow)
        sdraw.rounded_rectangle(
            [MARGIN - 6, photo_y + 16, MARGIN + photo_w + 6, photo_y + photo_h + 36],
            radius=20,
            fill=(0, 0, 0, 200)
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(28))
        canvas.paste(shadow, (0, 0), shadow)

        # Rounded photograph mask
        mask = Image.new("L", (photo_w, photo_h), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, photo_w, photo_h], radius=16, fill=255)

        # Subtle dark editorial vignette at the bottom of the photo
        vignette = Image.new("RGBA", (photo_w, photo_h), (0, 0, 0, 0))
        vdraw = ImageDraw.Draw(vignette)
        for row in range(photo_h - 130, photo_h):
            prog = (row - (photo_h - 130)) / 130.0
            vdraw.line([(0, row), (photo_w, row)], fill=(13, 13, 17, int(190 * prog)))
        photo = Image.alpha_composite(photo, vignette)

        # Paste photograph
        canvas.paste(photo, (MARGIN, photo_y), mask)

        # Delicate hairline photo boundary (0.5 opacity white hairline)
        draw.rounded_rectangle(
            [MARGIN, photo_y, MARGIN + photo_w, photo_y + photo_h],
            radius=16,
            outline=(255, 255, 255, 28),
            width=1
        )

        # Editorial provenance caption at bottom-left corner of the photo
        f_cap = get_font(FONT_SANS_BOLD, 12)
        draw_letterspaced_text(
            draw,
            (MARGIN + 28, photo_y + photo_h - 36),
            "ARTISANAL RESERVE CUTS  •  PREPARED IN 2°C STERILE STATIONS",
            f_cap,
            (235, 232, 228),
            spacing=3
        )

    # -------------------------------------------------------------
    # 5. BOTTOM SECTION: The Three Concise Brand Benefits
    # -------------------------------------------------------------
    # Strict compliance: NO three bulky bordered cards.
    # Clean typography, subtle hairline separators, elegant linear rhythm.
    pillars_y = photo_y + photo_h + 56
    col_w = CONTENT_W // 3

    pillars = [
        ("01", "FRESHLY CUT TO ORDER", "Prepared by master butchers only after your order is placed. Never pre-packed, never thawed."),
        ("02", "TEMPERATURE CONTROLLED", "Continuous 0°C to 4°C active cold-chain transit preserving natural juices, marbling, and texture."),
        ("03", "REUSABLE PACKAGING", "Hand-delivered in sanitized ThermalVault™ cold boxes. Zero single-use plastic waste. Zero extra cost.")
    ]

    f_pnum = get_font(FONT_SERIF_ITALIC, 22)
    f_phead = get_font(FONT_SANS_BOLD, 14)
    f_pbody = get_font(FONT_SANS_REG, 15)

    for i, (num, title, body) in enumerate(pillars):
        px = MARGIN + (i * col_w)
        
        # Subtle hairline separator between columns
        if i > 0:
            sep_x = px - 28
            draw.line([sep_x, pillars_y + 6, sep_x, pillars_y + 118], fill=(255, 255, 255, 18), width=1)

        # Number accent in signature Brisket Box crimson
        draw.text((px, pillars_y), num, font=f_pnum, fill=(217, 27, 62))

        # Title
        draw_letterspaced_text(draw, (px + 40, pillars_y + 6), title, f_phead, (247, 245, 240), spacing=2)

        # Word-wrapped body text
        words = body.split(" ")
        line1 = " ".join(words[:6])
        line2 = " ".join(words[6:12])
        line3 = " ".join(words[12:])
        
        draw.text((px, pillars_y + 44), line1, font=f_pbody, fill=(185, 182, 178))
        draw.text((px, pillars_y + 68), line2, font=f_pbody, fill=(185, 182, 178))
        if line3:
            draw.text((px, pillars_y + 92), line3, font=f_pbody, fill=(140, 137, 134))

    # Hairline Bottom Rule
    bot_rule_y = pillars_y + 148
    draw.line([MARGIN, bot_rule_y, W - MARGIN, bot_rule_y], fill=(255, 255, 255, 20), width=1)

    # -------------------------------------------------------------
    # 6. CALL TO ACTION & WEBSITE
    # -------------------------------------------------------------
    cta_y = bot_rule_y + 36

    # Left: Call to Action
    f_cta_label = get_font(FONT_SANS_BOLD, 17)
    cta_text = "EXPERIENCE THE CUTS  →"
    draw_letterspaced_text(draw, (MARGIN, cta_y), cta_text, f_cta_label, (247, 245, 240), spacing=3)

    # Right: Website Domain
    f_url = get_font(FONT_SANS_BOLD, 17)
    url_text = "BRISKETBOX.COM"
    url_w = get_letterspaced_width(f_url, url_text, spacing=4)
    draw_letterspaced_text(draw, (W - MARGIN - url_w, cta_y), url_text, f_url, (217, 27, 62), spacing=4)

    # -------------------------------------------------------------
    # 7. OFFICIAL BRAND SLOGAN (MANDATORY & PRECISE)
    # -------------------------------------------------------------
    slogan_y = cta_y + 54
    f_slogan = get_font(FONT_SERIF_ITALIC, 21)
    slogan_text = '"Freshness, Sealed with Flavour."'
    s_bbox = f_slogan.getbbox(slogan_text)
    sw = s_bbox[2] - s_bbox[0] if s_bbox else 300
    s_x = (W - sw) // 2
    draw.text((s_x, slogan_y), slogan_text, font=f_slogan, fill=(195, 190, 184))

    # -------------------------------------------------------------
    # 8. EXPORT MASTER HIGH-RESOLUTION ASSETS
    # -------------------------------------------------------------
    master_path = os.path.join(OUTPUT_DIR, "BRISKETBOX_LAUNCH_CAMPAIGN_MASTER.png")
    canvas.convert("RGB").save(master_path, quality=98)

    # 1080 x 1350 px (Super-sampled downscaled export for flawless social & mobile clarity)
    std_1080 = canvas.resize((1080, 1350), Image.Resampling.LANCZOS)
    std_path = os.path.join(OUTPUT_DIR, "BRISKETBOX_LAUNCH_CAMPAIGN_1080x1350.png")
    std_1080.convert("RGB").save(std_path, quality=98)

    print("Posters re-rendered with balanced vertical hierarchy:")
    print(" - Master Retina (1440x1800):", master_path)
    print(" - Standard 4:5 (1080x1350):", std_path)

if __name__ == "__main__":
    build_poster()
