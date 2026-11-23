import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUTPUT_DIR = r"C:\Users\dines\brisketbox\linkedin_posts"
os.makedirs(OUTPUT_DIR, exist_ok=True)

LOGO_PATH = r"C:\Users\dines\brisketbox\frontend\public\images\brisketbox-logo.png"
HERO_MEAT = r"C:\Users\dines\brisketbox\frontend\public\images\hero_banner_meat.jpg"
RAW_MUTTON = r"C:\Users\dines\brisketbox\frontend\public\images\products\raw_mutton.jpg"
PROD_1 = r"C:\Users\dines\brisketbox\frontend\public\images\products\prod_1.jpg"

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_REG = r"C:\Windows\Fonts\segoeui.ttf"
FONT_SEMIBOLD = r"C:\Windows\Fonts\segoeuisl.ttf"

def get_font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

# -------------------------------------------------------------
# GRAPHIC 1: Cold Chain Comparison
# -------------------------------------------------------------
def make_graphic_1():
    W, H = 1200, 1200
    img = Image.new("RGBA", (W, H), (10, 11, 15, 255))
    draw = ImageDraw.Draw(img)

    # Ambient Glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([800, -100, 1400, 500], fill=(225, 29, 72, 60))
    gdraw.ellipse([-200, 700, 400, 1300], fill=(14, 165, 233, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(100))
    img.paste(glow, (0, 0), glow)

    # Grid dots
    for x in range(60, W, 60):
        for y in range(60, H, 60):
            draw.point((x, y), fill=(255, 255, 255, 18))

    # Top Brand / Header
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo.thumbnail((260, 65))
        img.paste(logo, (80, 70), logo)

    # Top Tag
    f_tag = get_font(FONT_BOLD, 16)
    draw.rounded_rectangle([820, 75, 1120, 120], radius=22, fill=(225, 29, 72, 35), outline=(225, 29, 72, 120), width=2)
    draw.text((845, 87), "COLD-CHAIN DEEP DIVE", font=f_tag, fill=(251, 113, 133, 255))

    # Eyebrow Pill
    f_pill = get_font(FONT_BOLD, 15)
    draw.rounded_rectangle([80, 180, 420, 222], radius=20, fill=(255, 255, 255, 15), outline=(255, 255, 255, 40), width=1)
    draw.ellipse([100, 196, 110, 206], fill=(16, 185, 129, 255)) # Green dot
    draw.text((125, 191), "THE D2C FOOD INTEGRITY REPORT", font=f_pill, fill=(148, 163, 184, 255))

    # Headline
    f_h1 = get_font(FONT_BOLD, 52)
    draw.text((80, 245), "Why 84% of Meat Delivered Online", font=f_h1, fill=(255, 255, 255, 255))
    draw.text((80, 310), "Loses Freshness Before Your Door.", font=f_h1, fill=(244, 63, 94, 255))

    # Subtitle
    f_sub = get_font(FONT_REG, 21)
    draw.text((80, 395), "Standard quick-commerce bikes use thin polythene. In 35°C Indian summers,", font=f_sub, fill=(203, 213, 225, 255))
    draw.text((80, 430), "meat breaches food-safety thresholds in under 18 minutes of transit.", font=f_sub, fill=(148, 163, 184, 255))

    # Comparison Cards
    card_w = 495
    card_h = 470
    card_y = 510

    # Card 1: Traditional Delivery
    card1_x = 80
    draw.rounded_rectangle([card1_x, card_y, card1_x + card_w, card_y + card_h], radius=24, fill=(15, 23, 42, 200), outline=(239, 68, 68, 80), width=2)
    f_card_t = get_font(FONT_BOLD, 18)
    draw.text((card1_x + 30, card_y + 30), "TRADITIONAL DELIVERY", font=f_card_t, fill=(248, 113, 113, 255))
    
    f_temp_bad = get_font(FONT_BOLD, 42)
    draw.text((card1_x + 30, card_y + 75), "14°C – 22°C", font=f_temp_bad, fill=(239, 68, 68, 255))
    f_temp_lbl = get_font(FONT_REG, 15)
    draw.text((card1_x + 30, card_y + 130), "Uncontrolled ambient transit temperature", font=f_temp_lbl, fill=(148, 163, 184, 255))

    f_li = get_font(FONT_REG, 18)
    points_bad = [
        "✕  Standard polythene + melting ice pads",
        "✕  Microbial multiply exponentially in traffic",
        "✕  Moisture loss ruins natural juicy texture",
        "✕  Single-use plastic packets dumped in landfill"
    ]
    py = card_y + 190
    for p in points_bad:
        draw.text((card1_x + 30, py), p, font=f_li, fill=(226, 232, 240, 255))
        py += 55

    # Card 2: BrisketBox ThermalVault
    card2_x = 625
    draw.rounded_rectangle([card2_x, card_y, card2_x + card_w, card_y + card_h], radius=24, fill=(225, 29, 72, 25), outline=(225, 29, 72, 140), width=2)
    draw.text((card2_x + 30, card_y + 30), "BRISKETBOX THERMALVAULT™", font=f_card_t, fill=(251, 113, 133, 255))

    draw.text((card2_x + 30, card_y + 75), "0°C – 4°C Constant", font=f_temp_bad, fill=(56, 189, 248, 255))
    draw.text((card2_x + 30, card_y + 130), "Medical-grade cold-chain lock throughout delivery", font=f_temp_lbl, fill=(148, 163, 184, 255))

    points_good = [
        "✓  High-density EPP insulated cold vault",
        "✓  Live IoT temperature logs on every order",
        "✓  100% sealed freshness & zero chemical preservatives",
        "✓  100% free reusable box service (₹0 deposit, zero waste)"
    ]
    py = card_y + 190
    for p in points_good:
        draw.text((card2_x + 30, py), p, font=f_li, fill=(241, 245, 249, 255))
        py += 55

    # Footer
    draw.line([80, 1050, 1120, 1050], fill=(255, 255, 255, 25), width=1)
    f_ftr = get_font(FONT_BOLD, 17)
    draw.text((80, 1090), "#FoodTech   #ColdChain   #CircularEconomy   #D2CIndia", font=f_ftr, fill=(148, 163, 184, 255))
    draw.rounded_rectangle([920, 1075, 1120, 1125], radius=20, fill=(255, 255, 255, 20), outline=(255, 255, 255, 50), width=1)
    draw.text((945, 1088), "brisketbox.com", font=f_ftr, fill=(255, 255, 255, 255))

    img.convert("RGB").save(os.path.join(OUTPUT_DIR, "linkedin_post_1_coldchain.png"), quality=95)
    print("Graphic 1 generated!")

# -------------------------------------------------------------
# GRAPHIC 2: Circular Economy & Zero Plastic
# -------------------------------------------------------------
def make_graphic_2():
    W, H = 1200, 1200
    img = Image.new("RGBA", (W, H), (8, 15, 15, 255))
    draw = ImageDraw.Draw(img)

    # Ambient emerald and teal glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([650, 100, 1300, 750], fill=(16, 185, 129, 50))
    gdraw.ellipse([-100, -100, 500, 500], fill=(14, 165, 233, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    img.paste(glow, (0, 0), glow)

    # Grid
    for x in range(60, W, 60):
        for y in range(60, H, 60):
            draw.point((x, y), fill=(255, 255, 255, 15))

    # Top Brand / Header
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo.thumbnail((260, 65))
        img.paste(logo, (80, 70), logo)

    # Top Tag
    f_tag = get_font(FONT_BOLD, 15)
    draw.rounded_rectangle([800, 75, 1120, 120], radius=22, fill=(16, 185, 129, 35), outline=(16, 185, 129, 130), width=2)
    draw.text((820, 87), "CIRCULAR LOGISTICS INNOVATION", font=f_tag, fill=(52, 211, 153, 255))

    # Eyebrow Pill
    f_pill = get_font(FONT_BOLD, 15)
    draw.rounded_rectangle([80, 180, 410, 222], radius=20, fill=(255, 255, 255, 15), outline=(255, 255, 255, 40), width=1)
    draw.ellipse([100, 196, 110, 206], fill=(52, 211, 153, 255))
    draw.text((125, 191), "SUSTAINABILITY & REUSABILITY", font=f_pill, fill=(148, 163, 184, 255))

    # Headline
    f_h1 = get_font(FONT_BOLD, 52)
    draw.text((80, 245), "The Zero-Deposit Cold Vault That", font=f_h1, fill=(255, 255, 255, 255))
    draw.text((80, 310), "Eliminates Single-Use Plastics.", font=f_h1, fill=(52, 211, 153, 255))

    # Subtitle
    f_sub = get_font(FONT_REG, 21)
    draw.text((80, 395), "Every year, millions of non-recyclable frozen bubble wraps end up in Indian landfills.", font=f_sub, fill=(203, 213, 225, 255))
    draw.text((80, 430), "BrisketBox replaces plastic trash with a 100% free reusable ThermalVault™ service.", font=f_sub, fill=(148, 163, 184, 255))

    # 3 Stat Cards
    steps = [
        ("01", "Delivered in Cold Vault", "Meat arrives in a sanitized medical EPP ThermalVault with frozen food-grade ice matrix."),
        ("02", "Zero Extra Cost", "Provided at ₹0 deposit. Zero packaging fees, zero single-use plastic waste."),
        ("03", "Effortless Reuse Loop", "Our rider collects the box on hand-off or next delivery. Sanitized & reused 100+ times.")
    ]

    card_y = 490
    card_w = 1040
    step_h = 135

    f_num = get_font(FONT_BOLD, 38)
    f_st = get_font(FONT_BOLD, 22)
    f_sd = get_font(FONT_REG, 18)

    for i, (num, title, desc) in enumerate(steps):
        sy = card_y + (i * 160)
        draw.rounded_rectangle([80, sy, 80 + card_w, sy + step_h], radius=20, fill=(15, 28, 28, 220), outline=(16, 185, 129, 80), width=1)
        
        # Circle badge for number
        draw.ellipse([110, sy + 35, 175, sy + 100], fill=(16, 185, 129, 40), outline=(52, 211, 153, 180), width=2)
        draw.text((122, sy + 43), num, font=f_num, fill=(52, 211, 153, 255))

        draw.text((210, sy + 32), title, font=f_st, fill=(255, 255, 255, 255))
        draw.text((210, sy + 72), desc, font=f_sd, fill=(148, 163, 184, 255))

    # Footer
    draw.line([80, 1050, 1120, 1050], fill=(255, 255, 255, 25), width=1)
    f_ftr = get_font(FONT_BOLD, 17)
    draw.text((80, 1090), "#Sustainability   #CircularEconomy   #ZeroWaste   #CleanTech", font=f_ftr, fill=(148, 163, 184, 255))
    draw.rounded_rectangle([920, 1075, 1120, 1125], radius=20, fill=(255, 255, 255, 20), outline=(255, 255, 255, 50), width=1)
    draw.text((945, 1088), "brisketbox.com", font=f_ftr, fill=(255, 255, 255, 255))

    img.convert("RGB").save(os.path.join(OUTPUT_DIR, "linkedin_post_2_sustainability.png"), quality=95)
    print("Graphic 2 generated!")

# -------------------------------------------------------------
# GRAPHIC 3: Culinary Craft & Prime Cut Feature
# -------------------------------------------------------------
def make_graphic_3():
    W, H = 1200, 1200
    img = Image.new("RGBA", (W, H), (12, 10, 12, 255))

    # Background photo blended with gradient
    if os.path.exists(HERO_MEAT):
        bg = Image.open(HERO_MEAT).convert("RGBA")
        bg = bg.resize((W, int(H * 0.65)))
        # Create dark overlay mask
        mask = Image.new("L", (W, int(H * 0.65)), 0)
        mdraw = ImageDraw.Draw(mask)
        for y in range(int(H * 0.65)):
            alpha = int(170 * (y / (H * 0.65)))
            mdraw.line([(0, y), (W, y)], fill=alpha)
        
        # Paste at top
        img.paste(bg, (0, 0))
        # Dark gradient over photo
        overlay = Image.new("RGBA", (W, H), (12, 10, 12, 220))
        img = Image.alpha_composite(img, overlay)

    draw = ImageDraw.Draw(img)

    # Top Brand / Header
    if os.path.exists(LOGO_PATH):
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo.thumbnail((260, 65))
        img.paste(logo, (80, 70), logo)

    # Top Tag
    f_tag = get_font(FONT_BOLD, 15)
    draw.rounded_rectangle([840, 75, 1120, 120], radius=22, fill=(225, 29, 72, 35), outline=(225, 29, 72, 120), width=2)
    draw.text((865, 87), "ARTISANAL BUTCHERY", font=f_tag, fill=(251, 113, 133, 255))

    # Eyebrow Pill
    f_pill = get_font(FONT_BOLD, 15)
    draw.rounded_rectangle([80, 180, 390, 222], radius=20, fill=(255, 255, 255, 15), outline=(255, 255, 255, 40), width=1)
    draw.ellipse([100, 196, 110, 206], fill=(244, 63, 94, 255))
    draw.text((125, 191), "CHEF-GRADE STANDARDS", font=f_pill, fill=(148, 163, 184, 255))

    # Headline
    f_h1 = get_font(FONT_BOLD, 52)
    draw.text((80, 245), "Never Frozen. Never Preserved.", font=f_h1, fill=(255, 255, 255, 255))
    draw.text((80, 310), "Cut to Order by Master Butchers.", font=f_h1, fill=(244, 63, 94, 255))

    # Subtitle
    f_sub = get_font(FONT_REG, 21)
    draw.text((80, 395), "We rejected industrial bulk freezing. Every piece is precision-trimmed in a 2°C cleanroom", font=f_sub, fill=(203, 213, 225, 255))
    draw.text((80, 430), "only after you click order, keeping cellular integrity and natural juices 100% intact.", font=f_sub, fill=(148, 163, 184, 255))

    # 4 Feature Pills / Cards
    features = [
        ("0% Chemicals or Ammonia", "Zero soaking solutions, chlorine, or formalins—100% natural pure meat."),
        ("Cold-Chain Cleanroom Cuts", "De-boned and diced strictly at 2°C to prevent lipid oxidation and bacteria."),
        ("Vacuum Lock Packaging", "Thick barrier sealing locks out atmospheric moisture and airborne contaminants."),
        ("Chef-Calibrated Cut Styles", "Specific cuts tailored for slow Dum Biryanis, Roasts, Tawa Frys & Curries.")
    ]

    grid_y = 500
    card_w = 495
    card_h = 220

    f_ftitle = get_font(FONT_BOLD, 21)
    f_fdesc = get_font(FONT_REG, 17)

    for i, (title, desc) in enumerate(features):
        col = i % 2
        row = i // 2
        cx = 80 + (col * 545)
        cy = grid_y + (row * 250)

        draw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=20, fill=(24, 18, 22, 220), outline=(225, 29, 72, 70), width=1)
        
        # Little accent bar
        draw.rounded_rectangle([cx + 25, cy + 25, cx + 60, cy + 30], radius=3, fill=(244, 63, 94, 255))

        draw.text((cx + 25, cy + 45), title, font=f_ftitle, fill=(255, 255, 255, 255))
        
        # Word wrap desc
        words = desc.split(" ")
        line1 = " ".join(words[:6])
        line2 = " ".join(words[6:])
        draw.text((cx + 25, cy + 90), line1, font=f_fdesc, fill=(203, 213, 225, 255))
        draw.text((cx + 25, cy + 120), line2, font=f_fdesc, fill=(148, 163, 184, 255))

    # Footer
    draw.line([80, 1050, 1120, 1050], fill=(255, 255, 255, 25), width=1)
    f_ftr = get_font(FONT_BOLD, 17)
    draw.text((80, 1090), "#CulinaryCraft   #FoodIntegrity   #BengaluruFoodies   #D2CMeat", font=f_ftr, fill=(148, 163, 184, 255))
    draw.rounded_rectangle([920, 1075, 1120, 1125], radius=20, fill=(255, 255, 255, 20), outline=(255, 255, 255, 50), width=1)
    draw.text((945, 1088), "brisketbox.com", font=f_ftr, fill=(255, 255, 255, 255))

    img.convert("RGB").save(os.path.join(OUTPUT_DIR, "linkedin_post_3_culinary_craft.png"), quality=95)
    print("Graphic 3 generated!")

if __name__ == "__main__":
    make_graphic_1()
    make_graphic_2()
    make_graphic_3()
