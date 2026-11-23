import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = r"C:\Users\dines\brisketbox\linkedin_posts"
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOGO_PATH = r"C:\Users\dines\brisketbox\frontend\public\images\brisketbox-logo.png"
HERO_MEAT = r"C:\Users\dines\brisketbox\frontend\public\images\hero_banner_meat.jpg"
PROD_1 = r"C:\Users\dines\brisketbox\frontend\public\images\products\prod_1.jpg"

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

def create_inaugural_poster():
    # 4:5 Aspect Ratio (1080 x 1350) - Optimal LinkedIn Mobile & Desktop Real Estate
    W, H = 1080, 1350
    canvas = Image.new("RGBA", (W, H), (8, 9, 13, 255))

    # 1. Background Texture & Radial Ambient Lighting
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    
    # Top Crimson Glow
    gdraw.ellipse([W//2 - 400, -150, W//2 + 400, 450], fill=(225, 29, 72, 65))
    # Mid-right Ember/Gold Glow
    gdraw.ellipse([W - 350, 450, W + 300, 1050], fill=(245, 158, 11, 45))
    # Bottom-left Cyan/Cold Glow
    gdraw.ellipse([-200, 850, 400, 1450], fill=(14, 165, 233, 40))
    
    glow = glow.filter(ImageFilter.GaussianBlur(130))
    canvas.paste(glow, (0, 0), glow)

    # 2. Modern Canva-Style Geometric Hairline Frame & Corner Crosshairs
    draw = ImageDraw.Draw(canvas)
    margin = 48
    draw.rounded_rectangle(
        [margin, margin, W - margin, H - margin],
        radius=28,
        outline=(255, 255, 255, 30),
        width=1
    )

    # Corner Crosshair Accents (+)
    f_cross = get_font(FONT_REG, 18)
    cross_offsets = [
        (margin + 16, margin + 14),
        (W - margin - 30, margin + 14),
        (margin + 16, H - margin - 34),
        (W - margin - 30, H - margin - 34)
    ]
    for cx, cy in cross_offsets:
        draw.text((cx, cy), "+", font=f_cross, fill=(255, 255, 255, 90))

    # 3. Top Eyebrow Banner (Pill Badge)
    f_badge = get_font(FONT_BOLD, 13)
    pill_w = 340
    pill_x = (W - pill_w) // 2
    pill_y = margin + 28
    draw.rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + 36],
        radius=18,
        fill=(225, 29, 72, 40),
        outline=(225, 29, 72, 140),
        width=1
    )
    # Pulsing Live Dot
    draw.ellipse([pill_x + 18, pill_y + 13, pill_x + 28, pill_y + 23], fill=(244, 63, 94, 255))
    draw.text((pill_x + 38, pill_y + 9), "OFFICIAL INAUGURAL LAUNCH • 2026", font=f_badge, fill=(254, 205, 211, 255))

    # 4. Brand Logo Presentation (Centered & Crisp)
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_w = 280
        aspect = logo.height / logo.width
        logo_h = int(logo_w * aspect)
        logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
        logo_x = (W - logo_w) // 2
        logo_y = pill_y + 56
        canvas.paste(logo, (logo_x, logo_y), logo)

    # 5. Grand Headline Typography (Canva Pro Keynote Style)
    f_h_sub = get_font(FONT_BOLD, 16)
    f_h1 = get_font(FONT_BOLD, 54)
    f_tagline = get_font(FONT_BOLD, 22)

    head_y = 225
    # Sub-headline
    draw.text((W//2, head_y), "INDIA, MEET THE FUTURE OF FRESH MEAT", font=f_h_sub, fill=(245, 158, 11, 255), anchor="mm")
    
    # Hero Title (High-contrast dual tone)
    draw.text((W//2, head_y + 44), "THE WAIT IS OVER.", font=f_h1, fill=(255, 255, 255, 255), anchor="mm")
    draw.text((W//2, head_y + 104), "SEALED WITH FLAVOUR.", font=f_h1, fill=(244, 63, 94, 255), anchor="mm")

    # Tagline
    draw.text((W//2, head_y + 160), "100% Never Frozen  •  Medical Cold-Chain  •  Zero Single-Use Plastic", font=f_tagline, fill=(203, 213, 225, 255), anchor="mm")

    # 6. Hero Visual Showcase
    photo_path = PROD_1 if os.path.exists(PROD_1) else HERO_MEAT
    if os.path.exists(photo_path):
        photo = Image.open(photo_path).convert("RGBA")
        
        frame_w = 900
        frame_h = 440
        frame_x = (W - frame_w) // 2
        frame_y = 440

        photo_ratio = photo.width / photo.height
        target_ratio = frame_w / frame_h
        if photo_ratio > target_ratio:
            new_h = frame_h
            new_w = int(frame_h * photo_ratio)
        else:
            new_w = frame_w
            new_h = int(frame_w / photo_ratio)
        
        photo = photo.resize((new_w, new_h), Image.Resampling.LANCZOS)
        crop_x = (new_w - frame_w) // 2
        crop_y = (new_h - frame_h) // 2
        photo = photo.crop((crop_x, crop_y, crop_x + frame_w, crop_y + frame_h))

        mask = Image.new("L", (frame_w, frame_h), 0)
        mdraw = ImageDraw.Draw(mask)
        mdraw.rounded_rectangle([0, 0, frame_w, frame_h], radius=24, fill=255)

        vignette = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
        vdraw = ImageDraw.Draw(vignette)
        for row in range(frame_h - 140, frame_h):
            alpha = int(220 * ((row - (frame_h - 140)) / 140))
            vdraw.line([(0, row), (frame_w, row)], fill=(8, 9, 13, alpha))
        
        photo = Image.alpha_composite(photo, vignette)

        draw.rounded_rectangle(
            [frame_x - 3, frame_y - 3, frame_x + frame_w + 3, frame_y + frame_h + 3],
            radius=26,
            outline=(244, 63, 94, 90),
            width=2
        )

        canvas.paste(photo, (frame_x, frame_y), mask)

        # Floating Quality Badges
        f_flt = get_font(FONT_BOLD, 14)
        b1_w, b1_h = 240, 42
        b1_x = frame_x + frame_w - b1_w - 20
        b1_y = frame_y + 20
        draw.rounded_rectangle([b1_x, b1_y, b1_x + b1_w, b1_y + b1_h], radius=21, fill=(10, 15, 25, 220), outline=(56, 189, 248, 180), width=1)
        draw.ellipse([b1_x + 14, b1_y + 15, b1_x + 24, b1_y + 25], fill=(56, 189, 248, 255))
        draw.text((b1_x + 34, b1_y + 12), "0°C – 4°C LOCKED IN TRANSIT", font=f_flt, fill=(224, 242, 254, 255))

        b2_w, b2_h = 280, 42
        b2_x = frame_x + 20
        b2_y = frame_y + frame_h - b2_h - 20
        draw.rounded_rectangle([b2_x, b2_y, b2_x + b2_w, b2_y + b2_h], radius=21, fill=(10, 15, 25, 220), outline=(245, 158, 11, 180), width=1)
        draw.text((b2_x + 24, b2_y + 12), "★ 100% ANTIBIOTIC-FREE SOURCE", font=f_flt, fill=(254, 243, 199, 255))

    # 7. Three Iconic Pillars (Zero Deposit! 100% Free Reusable Box)
    bento_y = 915
    bento_w = 285
    bento_h = 175
    bento_gap = 22
    bento_start_x = (W - (bento_w * 3 + bento_gap * 2)) // 2

    pillars = [
        ("ARTISANAL CUTS", "Cut strictly to order in 2°C cleanrooms by master butchers. Never thawed, never pre-packed."),
        ("ZERO-DEPOSIT VAULT", "Reusable cold-vault box provided at ₹0 extra cost. Hand-delivered cold, 0% plastic waste."),
        ("PAN-INDIA VISION", "Crafted for discerning food lovers across Bengaluru, Hyderabad, Chennai & beyond.")
    ]

    f_p_title = get_font(FONT_BOLD, 15)
    f_p_desc = get_font(FONT_REG, 14)

    for i, (ptitle, pdesc) in enumerate(pillars):
        bx = bento_start_x + i * (bento_w + bento_gap)
        
        draw.rounded_rectangle(
            [bx, bento_y, bx + bento_w, bento_y + bento_h],
            radius=20,
            fill=(18, 20, 28, 220),
            outline=(255, 255, 255, 25),
            width=1
        )
        
        colors = [(244, 63, 94), (16, 185, 129), (56, 189, 248)]
        draw.ellipse([bx + 20, bento_y + 24, bx + 28, bento_y + 32], fill=colors[i])

        draw.text((bx + 38, bento_y + 20), ptitle, font=f_p_title, fill=(255, 255, 255, 255))
        
        words = pdesc.split(" ")
        line1 = " ".join(words[:5])
        line2 = " ".join(words[5:10])
        line3 = " ".join(words[10:])
        
        draw.text((bx + 20, bento_y + 60), line1, font=f_p_desc, fill=(203, 213, 225, 255))
        draw.text((bx + 20, bento_y + 85), line2, font=f_p_desc, fill=(148, 163, 184, 255))
        draw.text((bx + 20, bento_y + 110), line3, font=f_p_desc, fill=(148, 163, 184, 255))

    # 8. Grand Call to Action Pill Button
    cta_w = 560
    cta_h = 68
    cta_x = (W - cta_w) // 2
    cta_y = 1125

    draw.rounded_rectangle(
        [cta_x - 3, cta_y - 3, cta_x + cta_w + 3, cta_y + cta_h + 3],
        radius=36,
        fill=(225, 29, 72, 80)
    )
    draw.rounded_rectangle(
        [cta_x, cta_y, cta_x + cta_w, cta_y + cta_h],
        radius=34,
        fill=(225, 29, 72, 255)
    )
    f_cta = get_font(FONT_BOLD, 20)
    draw.text((W//2, cta_y + cta_h//2), "EXPERIENCE THE CUTS  →  BRISKETBOX.COM", font=f_cta, fill=(255, 255, 255, 255), anchor="mm")

    # 9. Bottom Footer Microcopy
    f_foot = get_font(FONT_REG, 14)
    draw.text((W//2, 1235), "Freshness, Sealed with Flavour  •  Crafted with Pride in India", font=f_foot, fill=(148, 163, 184, 255), anchor="mm")

    target_file = os.path.join(OUTPUT_DIR, "BrisketBox_Inaugural_Launch_Poster.png")
    canvas.convert("RGB").save(target_file, quality=98)
    print("Updated launch poster saved without deposit!")

if __name__ == "__main__":
    create_inaugural_poster()
