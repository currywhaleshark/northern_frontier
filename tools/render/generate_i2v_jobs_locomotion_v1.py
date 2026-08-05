"""
i2v idle/walk locomotion pipeline for job and named special-resident references.

Pipeline stages (per character, per action):
  1. Build identity-locked idle/walk prompts from the source PNG.
  2. Accept an externally generated mp4 (Grok image_to_video or equivalent).
  3. Extract 8 evenly spaced frames + preview GIF (ffmpeg).
  4. Run automated QA; record pass/fail and retry budget (max 3 attempts).

IMPORTANT:
  - Source PNGs are never modified.
  - Outputs live under: <export_root>/i2v_outputs/<character>/<action>/
  - Source lookup supports 01_jobs and 04_special_residents.
  - Pilot default: farmer_male, farmer_female, hunter_male, militia_spear_female.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
EXPORT_ROOT = (
    ROOT
    / "tools"
    / "render"
    / "exports"
    / "i2v-character-references-2026-07-24"
)
JOBS_DIR = EXPORT_ROOT / "01_jobs"
SPECIAL_RESIDENTS_DIR = EXPORT_ROOT / "04_special_residents"
YOUTH_RELIGIOUS_DIR = ROOT / "tools" / "render" / "source_images" / "youth-religious-i2v-v1"
YOUTH_RELIGIOUS_V2_DIR = ROOT / "tools" / "render" / "source_images" / "youth-religious-i2v-v2" / "raw"
COASTAL_F5_DIR = ROOT / "tools" / "render" / "source_images" / "coastal-f5-v1"
TUTORIAL_ADVISOR_DIR = (
    ROOT / "tools" / "render" / "source_images" / "tutorial-advisor-yeoni-v1"
)
SOURCE_DIRS = (JOBS_DIR, SPECIAL_RESIDENTS_DIR, YOUTH_RELIGIOUS_DIR)
CHARACTER_SOURCE_OVERRIDES = {
    "youth_farmer_male": YOUTH_RELIGIOUS_V2_DIR / "youth_farmer_male.png",
    "youth_farmer_female": YOUTH_RELIGIOUS_V2_DIR / "youth_farmer_female.png",
    "salt_maker_male": COASTAL_F5_DIR / "salt-maker-male-base-v2.png",
    "salt_maker_female": COASTAL_F5_DIR / "salt-maker-female-base-v2.png",
    "tutorial_advisor_yeoni": TUTORIAL_ADVISOR_DIR / "yeoni-sprite-oriented-raw.png",
}
ACTION_SOURCE_OVERRIDES = {
    (
        "jurchen_warrior_aragae",
        "walk",
    ): SPECIAL_RESIDENTS_DIR / "jurchen_warrior_aragae-walk-anchor.png",
    (
        "tutorial_advisor_yeoni",
        "jige_walk",
    ): TUTORIAL_ADVISOR_DIR / "yeoni-jige-loaded-oriented-raw.png",
}
OUTPUT_ROOT = EXPORT_ROOT / "i2v_outputs"
MAGENTA = np.array([255, 0, 255], dtype=np.int16)
MAX_ATTEMPTS = 3
FRAME_COUNT = 8
PILOT_CHARACTERS = (
    "farmer_male",
    "farmer_female",
    "hunter_male",
    "militia_spear_female",
)
ACTIONS = ("idle", "walk", "jige_walk", "work")

# Optional completed locomotion references — motion/rhythm/camera only.
# Never copy face, clothing, or body from these into target characters.
MOTION_REFERENCE_NOTES = {
    "idle": (
        "Motion reference only (do not copy identity): completed unemployed-resident "
        "idle rhythm — a stationary standing pose with both soles continuously anchored, "
        "tiny breathing only, and no locomotion phase."
    ),
    "walk": (
        "Motion reference only (do not copy identity): completed woodcutter/unemployed "
        "walk rhythm — a small, mundane everyday gait at natural speed, soft low weight "
        "transfer, clear left/right alternation, gentle opposite arm swing, and repeated "
        "in-place cycles with a locked camera. Avoid stiff or theatrical march energy."
    ),
    "jige_walk": (
        "Motion reference only (do not copy identity): completed loaded-jige woodcutter "
        "walk rhythm — a small careful load-bearing gait, soft low steps, restrained arm "
        "movement, stable cargo, and repeated in-place cycles with a locked camera."
    ),
    "work": (
        "Motion reference only (do not copy identity): completed woodcutter chop rhythm — "
        "stationary preparation, a compact controlled downward axe swing, low follow-through, "
        "and recovery to the source pose with a locked camera."
    ),
}

# Short identity lock phrases so the video model preserves props without redesigning.
CHARACTER_IDENTITY: dict[str, str] = {
    "youth_idle_male": (
        "Joseon adolescent boy, visibly shorter and slighter than an adult, with tied-back "
        "hair, beige jeogori, loose blue-gray trousers, cloth belt, and straw shoes"
    ),
    "youth_idle_female": (
        "Joseon adolescent girl, visibly shorter and slighter than an adult, with a braided "
        "low hairstyle, beige jeogori, muted rose chima, and straw shoes"
    ),
    "youth_hauler_male": (
        "Joseon adolescent boy hauler with tied-back hair, beige work clothes, loose blue-gray "
        "trousers, straw shoes, and one small empty wooden jige backpack with coiled rope"
    ),
    "youth_hauler_female": (
        "Joseon adolescent girl hauler with braided low hair, beige jeogori, muted rose chima, "
        "straw shoes, and one small empty woven carrying basket with shoulder straps"
    ),
    "youth_farmer_male": (
        "Joseon adolescent boy farm helper with tied-back hair, beige work clothes, loose "
        "blue-gray trousers, straw shoes, and one long-handled Korean hoe held low"
    ),
    "youth_farmer_female": (
        "Joseon adolescent girl farm helper with braided low hair, beige jeogori, muted rose "
        "chima, straw shoes, and one long-handled Korean hoe held low"
    ),
    "youth_wood_splitter_male": (
        "Joseon adolescent boy wood-splitting helper with tied-back hair, beige work clothes, "
        "blue-gray trousers, straw shoes, and one compact wood axe held low"
    ),
    "youth_wood_splitter_female": (
        "Joseon adolescent girl wood-splitting helper with braided low hair, beige jeogori, "
        "muted rose chima, straw shoes, and one compact wood axe held low"
    ),
    "youth_herder_male": (
        "Joseon adolescent boy herding helper with tied-back hair, beige work clothes, "
        "blue-gray trousers, straw shoes, one slim herding staff, and one coiled rope"
    ),
    "youth_herder_female": (
        "Joseon adolescent girl herding helper with braided low hair, beige jeogori, muted "
        "rose chima, straw shoes, one slim herding staff, and one coiled rope"
    ),
    "religious_shaman_male": (
        "adult male Joseon village shaman in a black brimmed ritual hat, cream robe, vivid but "
        "restrained red-blue ritual vest and sash, holding one small brass ritual bell"
    ),
    "religious_shaman_female": (
        "adult female Joseon village shaman with coiled black hair and a small dark headpiece, "
        "cream jeogori, red-blue ritual vest and muted red chima, holding one small brass bell"
    ),
    "religious_monk_male": (
        "adult male Joseon Buddhist monk with a fully shaved head, plain layered gray robes, "
        "dark sash, straw sandals, and one short strand of wooden prayer beads"
    ),
    "religious_monk_female": (
        "adult female Joseon Buddhist nun with a fully shaved head, plain layered gray robes, "
        "dark sash, straw sandals, and one short strand of wooden prayer beads"
    ),
    "religious_novice_male": (
        "young Joseon boy novice monk with a fully shaved head, child proportions, plain light "
        "gray robes, dark sash, cloth leggings, and straw sandals"
    ),
    "religious_novice_female": (
        "young Joseon girl novice monk with a fully shaved head, child proportions, plain light "
        "gray robes, dark sash, long gray lower robe, and straw sandals"
    ),
    "farmer_male": (
        "adult male Joseon farmer with wide straw hat, goatee, blue-gray vest over "
        "white sleeves, blue baggy pants, straw shoes, long-handled hoe held low in "
        "his right hand"
    ),
    "farmer_female": (
        "adult female Joseon farmer with wide straw hat, dark hair in a low bun, "
        "cream-white top, dark blue long skirt, straw shoes, long-handled hoe held "
        "low in her right hand"
    ),
    "salt_maker_male": (
        "adult male Joseon salt maker with a black-gray cloth headband, small tied "
        "topknot, short beard and mustache, salt-stained gray-brown sleeveless work "
        "coat over cream sleeves, rope belt, loose blue-gray trousers, wrapped calves, "
        "and woven straw shoes"
    ),
    "salt_maker_female": (
        "adult female Joseon salt maker with a black-gray cloth headband and low "
        "nape-level jjokmeori with no crown topknot, salt-stained gray-brown sleeveless "
        "work coat over cream sleeves, rope belt, loose blue-gray trousers, wrapped "
        "calves, and woven straw shoes"
    ),
    "hunter_male": (
        "adult male Joseon hunter with topknot and headband, light facial hair, "
        "brown layered work clothes, dark trousers, light shoes, wooden bow held "
        "across the front of the body, arrow quiver on the back"
    ),
    "militia_spear_female": (
        "adult female Joseon militia with high bun, white headband, blue vest over "
        "white sleeves, dark blue long skirt, red sash, belt knife and pouch, "
        "straw shoes, tall wooden spear with metal tip and red tassel held upright "
        "in her right hand"
    ),
    "physician_male": (
        "adult male Joseon physician in restrained blue-gray robes, wearing a tall "
        "structured black horsehair tanggeon with a raised rear topknot chamber, "
        "holding a small wooden medicine box, with an acupuncture case and medicine "
        "pouch at his waist"
    ),
    "physician_female": (
        "adult female Joseon physician with a low nape-level jjokmeori, gray-lavender "
        "jeogori, deep navy skirt, small wooden medicine box, acupuncture case, and "
        "medicine pouch"
    ),
    "potter_male": (
        "adult male Joseon onggi potter with topknot and head cloth, clay-dusted beige "
        "work clothes, dark brown apron, a small brown onggi jar in one hand, and a "
        "flat wooden shaping tool at his waist"
    ),
    "potter_female": (
        "adult female Joseon onggi potter with a low nape-level jjokmeori, clay-dusted "
        "beige jeogori, muted plum skirt, dark brown apron, a small brown onggi jar, "
        "and a flat wooden shaping tool"
    ),
    "curer_male": (
        "adult male Joseon food curer with topknot and head cloth, smoke- and "
        "salt-stained brown-gray work clothes, short dark apron, small wooden salt "
        "scoop, short drying tongs, and a compact cloth pouch"
    ),
    "curer_female": (
        "adult female Joseon food curer with a low nape-level jjokmeori, smoke- and "
        "salt-stained gray-brown work clothes, deep olive-brown skirt, short dark "
        "apron, small wooden salt scoop, short drying tongs, and a cloth pouch"
    ),
    "miller_male": (
        "adult male Joseon miller with topknot and head cloth, flour-dusted gray-beige "
        "work clothes, short deep navy vest, a small shallow grain-winnowing tray, "
        "and a short wooden grain paddle"
    ),
    "miller_female": (
        "adult female Joseon miller with a low nape-level jjokmeori, flour-dusted "
        "gray-beige jeogori, deep blue-gray skirt, short navy vest, a small shallow "
        "grain-winnowing tray, and a short wooden grain paddle"
    ),
    "undertaker_male": (
        "adult male Joseon undertaker and gravedigger wearing a compact dark "
        "weathered charcoal-brown woven satgat tilted slightly back, black-gray "
        "mourning work clothes, a white sash, straw shoes, and holding one short shovel"
    ),
    "undertaker_female": (
        "adult female Joseon undertaker with a low nape-level jjokmeori beneath a "
        "compact dark weathered charcoal-brown woven satgat tilted slightly back, "
        "black-gray mourning work clothes, a white sash, straw shoes, and holding "
        "one rolled burial-cloth bundle"
    ),
    "exiled_scholar_yun": (
        "middle-aged male Joseon exiled scholar Yun Mungyeom with a weary bearded "
        "face, tall worn black gat, faded patched blue-gray scholar robe over cream "
        "trousers, straw shoes, a rolled document held against his chest, and a "
        "weathered brown shoulder satchel"
    ),
    "jurchen_warrior_aragae": (
        "adult male surrendered Jurchen warrior Aragae with a high tied hair knot, "
        "mustache and short beard, dark lamellar armor under a fur-trimmed brown "
        "cloak, layered tan coat, wrapped forearms, brown boots, a sheathed short "
        "blade at his belt, and one tall spear held upright at his left side"
    ),
    "tiger_hunter_bakdolgae": (
        "older male Joseon tiger hunter Bak Dolgae with a gray beard, black eyepatch "
        "over his right eye, broad woven straw hat, patched brown hunting clothes, "
        "shaggy fur shoulder mantle, cloth-wrapped legs, straw shoes, leather pouches, "
        "a small paw-mark talisman gourd, and one long matchlock musket held upright "
        "at his right side"
    ),
    "geomancer_heosaeng": (
        "elderly blind male Joseon geomancer Heosaeng with permanently sightless milky "
        "opaque sealed-looking eyes that never open and never show normal pupils or irises, "
        "gray beard, dark wrapped head cloth, weathered beige outer robe over a charcoal-gray "
        "inner robe, wrapped shins, dark cloth shoes, a round geomantic compass hanging at "
        "his waist, one forked bamboo walking staff held upright in his right hand, and a "
        "short stone-weight divining plumb held low in his left hand"
    ),
    "uinyeo_dansim": (
        "adult female Joseon royal medical woman Dansim with a white tied headscarf, "
        "black hair tucked beneath it, muted teal jeogori over white sleeves, dark rose "
        "long skirt, cloth shoes, brown shoulder medicine satchel, small herb pouch at "
        "her waist, and an open dark wooden acupuncture case with its neat row of metal "
        "needles cradled securely in both hands"
    ),
    "runaway_smith_maksoe": (
        "adult male runaway Joseon blacksmith Maksoe with a high topknot and charcoal "
        "headband, muscular soot-marked bare arms, a sleeveless patched brown leather "
        "vest and apron over a dark wrap shirt, dark trousers, wrapped shins, brown work "
        "boots, one heavy square blacksmith hammer held low in his left hand, one pair "
        "of black iron forging tongs held upright in his right hand, and small belt tools"
    ),
    "interpreter_baesugyeom": (
        "elderly male retired Joseon interpreter Bae Sugyeom with a gray mustache and "
        "pointed beard, a broad black gat, a patched faded blue official robe over pale "
        "trousers, brown wrapped boots, a dark blue shoulder document satchel, wooden "
        "writing tallies at his belt, one red-tasseled pouch, and one tightly rolled "
        "cream diplomatic document tied with a red cord and held upright against his chest"
    ),
    "hangwae_sayaka": (
        "elderly male Japanese-born Joseon veteran Sayaka with gray facial hair, dark indigo "
        "Joseon chulrik, black jeonrip, cartridge belt and pouch, and one long wooden-stock "
        "matchlock held upright; no Japanese clothing, armor, sword, or hairstyle"
    ),
    "tutorial_advisor_yeoni": (
        "young unmarried Korean woman Yeon-i with a gently cute realistic face, one long black "
        "daenggi-meori braid tied with a muted red daenggi ribbon, jade-green jeogori with an "
        "off-white collar and ties, deep-rose chima, dark shoes, and one small woodcutting "
        "hatchet held low and close to her body"
    ),
}

ACTION_IDENTITY_OVERRIDES: dict[tuple[str, str], str] = {
    (
        "tutorial_advisor_yeoni",
        "jige_walk",
    ): (
        "young unmarried Korean woman Yeon-i with a gently cute realistic face, one long black "
        "daenggi-meori braid tied with a muted red daenggi ribbon, jade-green jeogori with an "
        "off-white collar and ties, deep-rose chima, dark shoes, and one wooden Korean jige "
        "backpack loaded with a compact tied bundle of short split firewood; both hands empty, "
        "no hatchet, axe, blade, or other handheld tool anywhere"
    ),
}

CHARACTER_ACTION_NOTES: dict[tuple[str, str], str] = {
    (
        "tutorial_advisor_yeoni",
        "idle",
    ): (
        "Camera-angle and gaze lock: preserve the source's coherent front-side three-quarter "
        "down-right view. Her chest, pelvis, knees, both feet, entire head, nose, eyes, and "
        "gaze must stay aimed along that same diagonal in every frame. Never let her glance "
        "sideways or turn her face away from her body. Keep both soles planted. Preserve the "
        "single braid, red ribbon, full skirt silhouette, and one low hatchet without sway. "
        "This clip must look almost like the exact same still image for all six seconds. If any "
        "motion is uncertain, keep her perfectly frozen rather than moving a foot or changing pose. "
    ),
    (
        "tutorial_advisor_yeoni",
        "walk",
    ): (
        "Camera-angle and gaze lock: walk along the source's front-side three-quarter down-right "
        "diagonal while her chest, pelvis, knees, both feet, entire head, nose, eyes, and gaze "
        "all remain aimed in that same travel direction throughout the gait. She must look where "
        "she walks, never sideways or over the opposite shoulder. Preserve the single braid and "
        "red ribbon. Keep the small hatchet low, close, and rigid on the same side; never raise, "
        "swing, shoulder, swap, drop, or multiply it. "
    ),
    (
        "tutorial_advisor_yeoni",
        "jige_walk",
    ): (
        "Camera-angle and gaze lock: walk along the source's front-side three-quarter down-right "
        "diagonal while her chest, pelvis, knees, both feet, entire head, nose, eyes, and gaze "
        "all remain aimed in that same travel direction. Keep the single braid and red ribbon. "
        "Keep the wooden jige squarely strapped to her back and the tied short-log load compact, "
        "centered, rigid, and unchanged. Never lose, drop, spill, swing, resize, or multiply the "
        "jige, straps, rope, or logs. Her hands remain empty and close to her sides. "
    ),
    (
        "tutorial_advisor_yeoni",
        "work",
    ): (
        "Camera-angle and gaze lock: preserve the same front-side three-quarter down-right work "
        "axis throughout the chop. Her feet stay planted and her face and eyes follow the axe's "
        "down-right work direction without turning toward the opposite shoulder. Preserve the "
        "single braid and red ribbon close to her body. Use the one existing hatchet only; the "
        "free hand may join the handle during the controlled swing, but never add, drop, swap, "
        "resize, or transform the axe. Keep the midpoint between her planted feet fixed at the "
        "same screen coordinate; hinge forward and back without drifting sideways. Keep the axe "
        "head below shoulder height at all times and keep her head horizontally near its source "
        "position. Use only a short waist-to-knee chopping arc, never a raised or overhead pose. "
        "No tree, stump, chips, dust, or detached debris. "
    ),
    (
        "salt_maker_male",
        "idle",
    ): (
        "Camera-angle lock: preserve the source's tilted front-side three-quarter view "
        "in every frame. Keep the face, chest, pelvis, knees, and both feet aimed along "
        "that same diagonal. Never rotate into a pure side profile or a front view. "
    ),
    (
        "salt_maker_male",
        "walk",
    ): (
        "Camera-angle lock: walk along the source's tilted front-side three-quarter "
        "diagonal while the face, chest, pelvis, knees, and both feet keep that same "
        "orientation in every gait phase. Never rotate into a pure side profile or a "
        "front view. Preserve the black-gray head cloth, small topknot, and short beard. "
    ),
    (
        "salt_maker_female",
        "idle",
    ): (
        "Camera-angle lock: preserve the source's tilted front-side three-quarter view "
        "in every frame. Keep the face, chest, pelvis, knees, and both feet aimed along "
        "that same diagonal. Never rotate into a pure side profile or a front view. "
        "Keep the low nape bun; never add a crown topknot. "
    ),
    (
        "salt_maker_female",
        "walk",
    ): (
        "Camera-angle lock: walk along the source's tilted front-side three-quarter "
        "diagonal while the face, chest, pelvis, knees, and both feet keep that same "
        "orientation in every gait phase. Never rotate into a pure side profile or a "
        "front view. Keep the low nape bun; never add a crown topknot. "
    ),
    (
        "jurchen_warrior_aragae",
        "walk",
    ): (
        "Character-specific pose correction: the source still shows Aragae glancing "
        "back across his shoulder while his chest, hips, and feet face the walking "
        "direction. For this walk cycle only, deliberately turn his whole head, face, "
        "nose, eyes, and gaze to the SAME forward direction as his chest, hips, leading "
        "foot, and travel axis. Keep that forward-facing head alignment throughout the "
        "walk. He must look where he is walking, never backward or over the opposite "
        "shoulder. This head turn is required pose correction, not an identity redesign. "
    ),
    (
        "tiger_hunter_bakdolgae",
        "walk",
    ): (
        "Keep the long matchlock musket upright beside his right shoulder exactly as "
        "in the source. The stock stays near the ground, the muzzle stays above his "
        "hat but fully inside frame, and both the gun and hanging talisman remain "
        "rigid and recognizable. Never shoulder, aim, fire, lower, or swap the gun. "
    ),
    (
        "geomancer_heosaeng",
        "walk",
    ): (
        "Keep the forked bamboo walking staff upright in his right hand and the short "
        "stone-weight divining plumb low in his left hand. His pale blind eyes remain "
        "unchanged. The round geomantic compass stays attached at his waist. Do not "
        "swing, swap, lose, lengthen, or multiply either handheld object. "
    ),
    (
        "uinyeo_dansim",
        "walk",
    ): (
        "Keep the open wooden acupuncture case cradled horizontally against her torso "
        "with both hands. Every needle stays seated in the case; the lid, needle row, "
        "satchel, and herb pouch remain intact. Do not close, tilt, drop, spill, multiply, "
        "or transform the medical case or needles. "
    ),
    (
        "runaway_smith_maksoe",
        "walk",
    ): (
        "Keep the heavy square hammer low beside his left thigh and the single pair of "
        "black iron forging tongs upright in his right hand. Preserve both tools' exact "
        "shape, count, grip, side, and scale. Never swing, raise, swap, drop, merge, or "
        "multiply them. "
    ),
    (
        "interpreter_baesugyeom",
        "walk",
    ): (
        "Keep the single rolled cream diplomatic document tied with its red cord upright "
        "against his chest in the same hand. The dark blue shoulder satchel, wooden belt "
        "tallies, and single red-tasseled pouch stay attached in their original positions. "
        "Do not unroll, open, swap, drop, merge, multiply, or transform any document or bag. "
    ),
    (
        "hangwae_sayaka",
        "walk",
    ): (
        "Keep the single matchlock upright on the same side, stock near the ground and muzzle "
        "inside frame. Preserve its lock, barrel, stock, grip, and scale without shrinking "
        "the man. Never aim, fire, lower, swap, bend, or multiply it. "
    ),
}


@dataclass
class AttemptResult:
    attempt: int
    video_path: str
    frames_dir: str
    gif_path: str
    qa: dict[str, Any]
    passed: bool
    timestamp: str


@dataclass
class ActionRun:
    character: str
    action: str
    source_png: str
    status: str = "pending"  # pending | passed | failed
    attempts: list[AttemptResult] = field(default_factory=list)
    final_video: str | None = None
    final_frames_dir: str | None = None
    final_gif: str | None = None
    prompt: str = ""


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def character_names_from_jobs(jobs_dir: Path) -> list[str]:
    return sorted(p.stem for p in jobs_dir.glob("*.png"))


def source_png_for_character(character: str, action: str | None = None) -> Path:
    override = ACTION_SOURCE_OVERRIDES.get((character, action)) if action else None
    if override is not None:
        if not override.exists():
            raise FileNotFoundError(f"missing action source override: {override}")
        return override
    character_override = CHARACTER_SOURCE_OVERRIDES.get(character)
    if character_override is not None:
        if not character_override.exists():
            raise FileNotFoundError(
                f"missing character source override: {character_override}"
            )
        return character_override
    matches = [directory / f"{character}.png" for directory in SOURCE_DIRS]
    existing = [path for path in matches if path.exists()]
    if not existing:
        raise FileNotFoundError(
            f"no source PNG for {character}; searched: "
            + ", ".join(str(path) for path in matches)
        )
    if len(existing) > 1:
        raise RuntimeError(
            f"ambiguous source PNG for {character}: "
            + ", ".join(str(path) for path in existing)
        )
    return existing[0]


def out_dir(character: str, action: str, root: Path = OUTPUT_ROOT) -> Path:
    return root / character / action


def build_prompt(character: str, action: str) -> str:
    identity = ACTION_IDENTITY_OVERRIDES.get((character, action)) or CHARACTER_IDENTITY.get(
        character,
        f"the exact game character from the source image named {character}",
    )
    motion_note = MOTION_REFERENCE_NOTES[action]
    tool_lock = (
        "Preserve every tool's exact shape, length, material, and count. During a work action, "
        "the existing tool may rotate only as part of the requested work motion; never redesign, "
        "drop, swap, merge, or multiply it. "
        if action == "work"
        else "Tools stay rigid: same shape, length, orientation, and grip. "
    )
    common = (
        f"Animate this exact pixel-art game character: {identity}. "
        "The source image is the sole identity reference — do not redesign or reinterpret "
        "the face, gender, body proportions, hairstyle, clothing, colors, shoes, tools, "
        "equipment, or props. Keep the same pixel-art texture and original resolution feel; "
        "do not convert into smooth 3D or illustration. "
        "Locked fixed camera, fixed 3/4 top-down RPG view, no camera move, zoom, rotation, "
        "or shake. Character stays centered in place with the original left/right margins. "
        "Full body, head, hands, feet, and every tool fully visible in every frame. "
        "Background is exact flat solid #FF00FF magenta for the entire video — no shadow, "
        "ground, dust, light effects, scenery, or text. "
        "No extra people, no extra limbs, no finger multiplication. "
        f"{tool_lock}"
        "Clothing pattern and colors must not flicker or change. "
        f"{motion_note}"
    )
    if action == "idle":
        motion = (
            "Action: seamless STATIONARY STANDING IDLE loop. THIS IS NOT A WALK CYCLE "
            "AND NOT LOCOMOTION. Both feet and both soles remain continuously planted in "
            "the exact original screen positions for the entire clip. Preserve the same "
            "left/right leg arrangement and the same stance width from the source image. "
            "No foot may lift, slide, pivot, cross, alternate forward, or change contact. "
            "Do not shift body weight from one leg to the other. Do not take even one step. "
            "The pelvis stays centered over the original stance; arms do not counter-swing. "
            "Only subtle breathing is allowed: at most a tiny 1–2% body-height rise and fall "
            "in the chest and shoulders, a minute head response, and barely perceptible cloth "
            "settling. The lower body from hips through feet is visually almost frozen. "
            "Hands remain in the same pose. Any tool, box, tray, jar, scoop, or pouch is held "
            "steadily in the same orientation with only imperceptible secondary settling. "
            "No walking, marching, pacing, stepping in place, foot tapping, knee lifting, "
            "leg crossing, dancing, swaying from side to side, turning, bowing, or gesturing. "
            "If either foot changes its ground contact or screen coordinate, the result is invalid. "
            "First and last frames must connect as a seamless loop."
        )
    elif action in ("walk", "jige_walk"):
        motion = (
            "Action: a seamless repeated in-place walk cycle at an ordinary unhurried "
            "working-villager pace. "
            "The character does not travel across the frame — walk on a treadmill in place. "
            "Use several small, consistent gait repetitions at natural speed during the clip; "
            "do NOT stretch one giant slow-motion step across the whole video and do NOT enlarge "
            "the stride merely to display the motion. "
            "Gait style: restrained, mundane, relaxed everyday human walking — "
            "NOT a stiff toy-soldier march, NOT a wooden puppet, NOT high-knee parade stepping, "
            "NOT goose-step, NOT robotic clockwork, NOT running, jogging, stomping, lunging, "
            "skipping, dancing, swaggering, or heroic action. "
            "Weight shifts softly between feet; knees stay low and relaxed. Stride length is "
            "modest—about one foot length, not a deep split stance. The lifted foot stays close "
            "to the ground and its toes do not rise above the opposite ankle. "
            "Foot roll is natural: heel contact → flat → toe push-off → short low lift, never a big kick. "
            "Clear left/right alternation through contact and passing poses, but keep motion loose and organic. "
            "At least one foot remains close to ground contact at all times. Hips and shoulders "
            "counter-rotate only slightly; the head and torso have less than roughly 3% body-height "
            "vertical bob and no side-to-side lurch. "
            "Arms stay CLOSE to the torso: small pendulum only, elbows soft and near the ribs. "
            "Do NOT reach, stretch, or fling either arm outward; no wide arm pump, no T-pose swing, "
            "no pointing gesture. Free hand stays near the hip/thigh like a relaxed walk. "
            "If a long tool, hoe, spear, or firearm is held, preserve the exact source orientation: "
            "keep a low tool low and an upright tool upright, with the same grip height and hand "
            "placement. Allow only tiny secondary sway; never raise, lower, shoulder, aim, or swing "
            "it as a weapon unless the source already shows that exact pose. "
            "No foot sliding, teleporting limbs, fused legs, or foot shape morphing. "
            "The repeated gait must remain periodic so the first and last frames connect cleanly."
        )
    else:
        motion = (
            "Action: a seamless repeated STATIONARY WOODCUTTING WORK cycle with four clearly "
            "readable phases: stable low ready pose, waist-height preparation, short controlled "
            "downward hatchet strike, and low follow-through returning to the ready pose. The axe "
            "head never rises above her shoulders or head. Both feet remain "
            "planted in the same screen positions and stance width throughout; this is not walking, "
            "running, stepping, turning, or travelling. Keep the pelvis centered and the movement "
            "economical, with less than a 20-degree torso hinge, like ordinary repeated labor "
            "rather than a dramatic combat attack. The "
            "hatchet stays fully visible and inside frame through the whole arc. Hands, wrists, "
            "elbows, shoulders, torso hinge, knees, and gaze must remain anatomically coherent. "
            "No overhead swing of any kind, raised axe, spinning, jumping, kneeling, weapon flourish, tree, stump, "
            "wood chips, sparks, dust, impact flash, smear, speed line, detached debris, extra axe, "
            "or extra limb. Complete several consistent work cycles during the clip so four clean "
            "phases can be selected, and make the first and last frames connect cleanly."
        )
    role_lock = ""
    if character.startswith("youth_"):
        role_lock = (
            "Age and scale lock: this is an adolescent helper, not an adult and not a toddler. "
            "Keep the exact shorter height, youthful face, slim limbs, head-to-body ratio, and "
            "modest half-labor tool scale from the source throughout the clip. Do not age up, "
            "grow taller, broaden the shoulders, or replace the clothing with adult workwear. "
        )
    elif character.startswith("religious_novice_"):
        role_lock = (
            "Age and vocation lock: this is one young novice monk with a completely shaved head "
            "and child proportions. Do not add adult height, hair, hat, prayer beads, staff, or "
            "ceremonial props. Keep the plain novice robes unchanged. "
        )
    elif character.startswith("religious_"):
        role_lock = (
            "Vocation lock: preserve the exact Korean religious clothing and handheld object from "
            "the source. This locomotion clip is ordinary daily movement, not a ritual performance; "
            "no dancing, chanting gesture, bowing, bell shaking, bead swinging, or magic effect. "
        )
    action_note = role_lock + CHARACTER_ACTION_NOTES.get((character, action), "")
    return f"{common} {action_note}{motion}"


def ensure_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("ffmpeg not found on PATH")
    return path


def probe_duration_seconds(video_path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        # Fallback: assume 6s if ffprobe missing
        return 6.0
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    out = subprocess.check_output(cmd, text=True).strip()
    return float(out)


def rekey_near_magenta_background(
    image: Image.Image,
    *,
    pure: tuple[int, int, int] = (255, 0, 255),
    color_tol: int = 72,
    max_green: int = 120,
) -> Image.Image:
    """
    Force chroma-key background to exact #FF00FF.

    Strategy: flood-fill from image borders through pixels that look like
    magenta/pink chroma (high R+B, low G, close to magenta). Character pixels
    are left untouched unless they are border-connected chroma.
    """
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    h, w = rgb.shape[:2]
    pure_arr = np.array(pure, dtype=np.uint8)

    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    dist = (
        np.abs(r - 255)
        + np.abs(g - 0)
        + np.abs(b - 255)
    )
    # Magenta-like: close-ish to pure magenta OR pink/purple chroma with low green
    chroma_like = (dist <= color_tol * 3) | (
        (r >= 160) & (b >= 140) & (g <= max_green) & ((r.astype(np.int16) + b) > (g * 3 + 80))
    )

    # Border-connected flood fill
    from collections import deque

    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if chroma_like[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if chroma_like[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx] and chroma_like[ny, nx]:
                visited[ny, nx] = True
                q.append((nx, ny))

    out = rgb.astype(np.uint8).copy()
    out[visited] = pure_arr
    return Image.fromarray(out, mode="RGB")


def extract_even_frames(
    video_path: Path,
    frames_dir: Path,
    count: int = FRAME_COUNT,
    *,
    rekey_magenta: bool = True,
) -> list[Path]:
    ensure_ffmpeg()
    frames_dir.mkdir(parents=True, exist_ok=True)
    # Clear previous frames
    for old in frames_dir.glob("frame_*.png"):
        old.unlink()
    raw_dir = frames_dir / "raw_extract"
    if rekey_magenta:
        if raw_dir.exists():
            shutil.rmtree(raw_dir)
        raw_dir.mkdir(parents=True, exist_ok=True)

    duration = max(probe_duration_seconds(video_path), 0.1)
    # Sample at midpoints of equal segments so we cover the full cycle evenly.
    timestamps = [(i + 0.5) * duration / count for i in range(count)]
    paths: list[Path] = []
    for i, t in enumerate(timestamps):
        raw_out = (raw_dir / f"frame_{i:02d}.png") if rekey_magenta else (frames_dir / f"frame_{i:02d}.png")
        out = frames_dir / f"frame_{i:02d}.png"
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{t:.4f}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(raw_out),
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        if not raw_out.exists():
            raise RuntimeError(f"failed to extract frame {i} from {video_path}")
        if rekey_magenta:
            cleaned = rekey_near_magenta_background(Image.open(raw_out))
            cleaned.save(out)
        paths.append(out)
    return paths


def make_preview_gif(frame_paths: list[Path], gif_path: Path, fps: int = 8) -> None:
    images = [Image.open(p).convert("RGBA") for p in frame_paths]
    if not images:
        raise RuntimeError("no frames for gif")
    duration_ms = max(int(1000 / fps), 1)
    # Pillow GIF: convert to palette
    first, *rest = [im.convert("P", palette=Image.ADAPTIVE, colors=255) for im in images]
    gif_path.parent.mkdir(parents=True, exist_ok=True)
    first.save(
        gif_path,
        save_all=True,
        append_images=rest,
        duration=duration_ms,
        loop=0,
        disposal=2,
    )


def _load_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"), dtype=np.int16)


def _magenta_mask(rgb: np.ndarray, tol: int = 28) -> np.ndarray:
    return np.all(np.abs(rgb - MAGENTA) <= tol, axis=2)


def _fg_mask(rgb: np.ndarray, tol: int = 28) -> np.ndarray:
    return ~_magenta_mask(rgb, tol=tol)


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _hist_correlation(a: np.ndarray, b: np.ndarray, bins: int = 32) -> float:
    """Correlation of RGB histograms over foreground pixels. 1.0 = identical."""
    fa = a.reshape(-1, 3)
    fb = b.reshape(-1, 3)
    corrs = []
    for c in range(3):
        ha, _ = np.histogram(fa[:, c], bins=bins, range=(0, 256), density=True)
        hb, _ = np.histogram(fb[:, c], bins=bins, range=(0, 256), density=True)
        if ha.std() < 1e-9 or hb.std() < 1e-9:
            corrs.append(1.0 if np.allclose(ha, hb) else 0.0)
            continue
        corrs.append(float(np.corrcoef(ha, hb)[0, 1]))
    return float(np.mean(corrs))


def run_auto_qa(
    source_png: Path,
    frame_paths: list[Path],
    action: str,
) -> dict[str, Any]:
    """
    Automated fail conditions (approximate but strict):
      - limbs/tools clipped at frame edge
      - large appearance/color drift vs source
      - background not predominantly #FF00FF
      - camera / character center drift
      - possible extra-limb mass explosion
      - tool silhouette length instability (when tool mass present)
      - walk: near-identical left/right half of gait (fake walk)
      - weak loop closure (start vs end)
    """
    checks: list[dict[str, Any]] = []
    source = _load_rgb(source_png)
    src_fg = _fg_mask(source)
    src_bbox = _bbox(src_fg)
    src_center = None
    src_area = int(src_fg.sum())
    if src_bbox:
        x0, y0, x1, y1 = src_bbox
        src_center = ((x0 + x1) / 2.0, (y0 + y1) / 2.0)

    frames = [_load_rgb(p) for p in frame_paths]
    if not frames:
        return {
            "passed": False,
            "checks": [{"id": "has_frames", "passed": False, "detail": "no frames"}],
        }

    h, w = frames[0].shape[:2]
    # Resize source stats to frame size for comparison if needed
    if source.shape[:2] != (h, w):
        src_img = Image.fromarray(source.astype(np.uint8)).resize((w, h), Image.NEAREST)
        source = np.asarray(src_img, dtype=np.int16)
        src_fg = _fg_mask(source)
        src_bbox = _bbox(src_fg)
        src_area = int(src_fg.sum())
        if src_bbox:
            x0, y0, x1, y1 = src_bbox
            src_center = ((x0 + x1) / 2.0, (y0 + y1) / 2.0)

    # 1) Background magenta ratio
    bg_ratios = []
    for fr in frames:
        bg = _magenta_mask(fr)
        bg_ratios.append(float(bg.mean()))
    avg_bg = float(np.mean(bg_ratios))
    checks.append(
        {
            "id": "background_magenta",
            "passed": avg_bg >= 0.55 and min(bg_ratios) >= 0.45,
            "detail": {
                "avg_bg_ratio": round(avg_bg, 4),
                "min_bg_ratio": round(float(min(bg_ratios)), 4),
                "threshold_avg": 0.55,
            },
        }
    )

    # 2) Clipping: foreground touching frame border
    clip_hits = 0
    for fr in frames:
        fg = _fg_mask(fr)
        edge = np.zeros_like(fg)
        edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
        if (fg & edge).any():
            clip_hits += 1
    checks.append(
        {
            "id": "no_clipping",
            "passed": clip_hits == 0,
            "detail": {"frames_with_edge_contact": clip_hits},
        }
    )

    # 3) Center stability (camera / position drift)
    centers = []
    areas = []
    for fr in frames:
        fg = _fg_mask(fr)
        bb = _bbox(fg)
        areas.append(int(fg.sum()))
        if bb is None:
            centers.append(None)
        else:
            x0, y0, x1, y1 = bb
            centers.append(((x0 + x1) / 2.0, (y0 + y1) / 2.0))
    valid_centers = [c for c in centers if c is not None]
    if valid_centers and src_center:
        max_shift = max(
            math.hypot(c[0] - src_center[0], c[1] - src_center[1]) for c in valid_centers
        )
        # Allow small bob (~8% of min dimension)
        allow = 0.08 * min(w, h)
        checks.append(
            {
                "id": "stable_position",
                "passed": max_shift <= allow,
                "detail": {
                    "max_center_shift_px": round(max_shift, 2),
                    "allow_px": round(allow, 2),
                },
            }
        )
    else:
        checks.append(
            {
                "id": "stable_position",
                "passed": False,
                "detail": "missing foreground bbox",
            }
        )

    # 4) Appearance / color drift vs source (fg histogram correlation)
    hist_scores = []
    for fr in frames:
        fg = _fg_mask(fr)
        if fg.sum() < 50 or src_fg.sum() < 50:
            hist_scores.append(0.0)
            continue
        hist_scores.append(_hist_correlation(source[src_fg], fr[fg]))
    avg_hist = float(np.mean(hist_scores)) if hist_scores else 0.0
    checks.append(
        {
            "id": "appearance_color_lock",
            "passed": avg_hist >= 0.72 and min(hist_scores) >= 0.55,
            "detail": {
                "avg_hist_corr": round(avg_hist, 4),
                "min_hist_corr": round(float(min(hist_scores)), 4) if hist_scores else None,
            },
        }
    )

    # 5) Area explosion / collapse (extra limbs or missing body)
    if src_area > 0:
        ratios = [a / src_area for a in areas if a > 0]
        if ratios:
            max_r, min_r = max(ratios), min(ratios)
            checks.append(
                {
                    "id": "silhouette_area_stable",
                    "passed": max_r <= 1.45 and min_r >= 0.55,
                    "detail": {
                        "max_area_ratio": round(max_r, 3),
                        "min_area_ratio": round(min_r, 3),
                    },
                }
            )
        else:
            checks.append(
                {
                    "id": "silhouette_area_stable",
                    "passed": False,
                    "detail": "no foreground area",
                }
            )

    # 6) Tool length stability via bbox height of non-core body region is hard;
    #    approximate: overall bbox height variance (spear/hoe extend silhouette).
    heights = []
    widths = []
    for fr in frames:
        fg = _fg_mask(fr)
        bb = _bbox(fg)
        if bb:
            x0, y0, x1, y1 = bb
            heights.append(y1 - y0 + 1)
            widths.append(x1 - x0 + 1)
    if heights:
        h_mean = float(np.mean(heights))
        h_var = float(np.std(heights) / max(h_mean, 1.0))
        w_mean = float(np.mean(widths))
        w_var = float(np.std(widths) / max(w_mean, 1.0))
        checks.append(
            {
                "id": "tool_bbox_stable",
                "passed": h_var <= 0.18 and w_var <= 0.22,
                "detail": {
                    "height_cv": round(h_var, 4),
                    "width_cv": round(w_var, 4),
                },
            }
        )

    # 7) Loop closure: first vs last frame similarity on fg
    first, last = frames[0], frames[-1]
    fg_f = _fg_mask(first)
    fg_l = _fg_mask(last)
    if fg_f.sum() > 50 and fg_l.sum() > 50:
        loop_corr = _hist_correlation(first[fg_f], last[fg_l])
        # Pixel MSE on intersection bbox
        bb_f = _bbox(fg_f)
        bb_l = _bbox(fg_l)
        loop_center_shift = 0.0
        if bb_f and bb_l:
            cf = ((bb_f[0] + bb_f[2]) / 2, (bb_f[1] + bb_f[3]) / 2)
            cl = ((bb_l[0] + bb_l[2]) / 2, (bb_l[1] + bb_l[3]) / 2)
            loop_center_shift = math.hypot(cf[0] - cl[0], cf[1] - cl[1])
        allow_loop = 0.06 * min(w, h)
        checks.append(
            {
                "id": "loop_closure",
                "passed": loop_corr >= 0.70 and loop_center_shift <= allow_loop,
                "detail": {
                    "hist_corr": round(loop_corr, 4),
                    "center_shift_px": round(loop_center_shift, 2),
                    "allow_shift_px": round(allow_loop, 2),
                },
            }
        )
    else:
        checks.append(
            {
                "id": "loop_closure",
                "passed": False,
                "detail": "missing fg for loop check",
            }
        )

    # 8) Walk-specific: mid-cycle frames should differ (true alternation proxy)
    if action == "walk" and len(frames) >= 4:
        # Compare frame 1 vs frame 5 (approx opposite phases in 8-frame sample)
        a, b = frames[1], frames[5]
        fa, fb = _fg_mask(a), _fg_mask(b)
        if fa.sum() > 50 and fb.sum() > 50:
            # Structural difference via mean absolute difference on fg union
            union = fa | fb
            mad = float(np.mean(np.abs(a[union].astype(np.float32) - b[union].astype(np.float32))))
            # Too similar => fake walk (same leg pose)
            phase_corr = _hist_correlation(a[fa], b[fb])
            # Also compare lower half only
            mid_y = h // 2
            lower_a = a[mid_y:, :, :]
            lower_b = b[mid_y:, :, :]
            la = _fg_mask(lower_a)
            lb = _fg_mask(lower_b)
            lower_mad = 0.0
            if la.sum() > 20 and lb.sum() > 20:
                # Align by resizing not needed; use MAD on overlapping size
                lower_mad = float(
                    np.mean(
                        np.abs(
                            lower_a.astype(np.float32) - lower_b.astype(np.float32)
                        )[la | lb]
                    )
                )
            checks.append(
                {
                    "id": "walk_leg_alternation_proxy",
                    "passed": mad >= 6.0 and lower_mad >= 5.0,
                    "detail": {
                        "phase_mad": round(mad, 3),
                        "lower_mad": round(lower_mad, 3),
                        "phase_hist_corr": round(phase_corr, 4),
                        "note": "low MAD suggests left/right poses are nearly identical",
                    },
                }
            )
        else:
            checks.append(
                {
                    "id": "walk_leg_alternation_proxy",
                    "passed": False,
                    "detail": "insufficient fg for phase compare",
                }
            )

    # 9) Idle-specific: frames should be similar (no walking)
    if action == "idle" and len(frames) >= 2:
        mads = []
        for i in range(1, len(frames)):
            a, b = frames[0], frames[i]
            fa, fb = _fg_mask(a), _fg_mask(b)
            union = fa | fb
            if union.sum() == 0:
                continue
            mads.append(
                float(
                    np.mean(
                        np.abs(a.astype(np.float32) - b.astype(np.float32))[union]
                    )
                )
            )
        avg_mad = float(np.mean(mads)) if mads else 999.0
        checks.append(
            {
                "id": "idle_subtle_motion",
                "passed": avg_mad <= 35.0,
                "detail": {
                    "avg_mad_vs_first": round(avg_mad, 3),
                    "note": "very high MAD may indicate walking or large pose change",
                },
            }
        )

    passed = all(c["passed"] for c in checks)
    return {
        "passed": passed,
        "checks": checks,
        "frame_count": len(frames),
        "frame_size": [w, h],
    }


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_prompts(characters: list[str], root: Path = OUTPUT_ROOT) -> None:
    for character in characters:
        for action in ACTIONS:
            d = out_dir(character, action, root)
            d.mkdir(parents=True, exist_ok=True)
            prompt = build_prompt(character, action)
            (d / "prompt.txt").write_text(prompt + "\n", encoding="utf-8")
            (d / "source_ref.txt").write_text(
                str(source_png_for_character(character, action).resolve()) + "\n",
                encoding="utf-8",
            )


def process_video_attempt(
    character: str,
    action: str,
    video_src: Path,
    attempt: int,
    root: Path = OUTPUT_ROOT,
) -> AttemptResult:
    source_png = source_png_for_character(character, action)
    if not video_src.exists():
        raise FileNotFoundError(video_src)

    action_dir = out_dir(character, action, root)
    attempts_dir = action_dir / "attempts" / f"attempt-{attempt}"
    attempts_dir.mkdir(parents=True, exist_ok=True)

    video_name = f"{character}__{action}.mp4"
    video_dst = attempts_dir / video_name
    shutil.copy2(video_src, video_dst)

    frames_dir = attempts_dir / "frames"
    frame_paths = extract_even_frames(video_dst, frames_dir, FRAME_COUNT)
    gif_path = attempts_dir / f"{character}__{action}.gif"
    make_preview_gif(frame_paths, gif_path)

    qa = run_auto_qa(source_png, frame_paths, action)
    qa_path = attempts_dir / "qa.json"
    write_json(qa_path, qa)

    # Contact sheet for visual QA
    contact = make_contact_sheet(frame_paths, source_png)
    contact.save(attempts_dir / "contact_sheet.png")

    return AttemptResult(
        attempt=attempt,
        video_path=str(video_dst),
        frames_dir=str(frames_dir),
        gif_path=str(gif_path),
        qa=qa,
        passed=bool(qa["passed"]),
        timestamp=utc_now(),
    )


def make_contact_sheet(frame_paths: list[Path], source_png: Path) -> Image.Image:
    frames = [Image.open(p).convert("RGBA") for p in frame_paths]
    src = Image.open(source_png).convert("RGBA")
    # Normalize height
    th = max(im.height for im in frames)
    def fit(im: Image.Image) -> Image.Image:
        if im.height == th:
            return im
        ratio = th / im.height
        return im.resize((max(1, int(im.width * ratio)), th), Image.NEAREST)

    cells = [fit(src)] + [fit(f) for f in frames]
    # Label bar
    pad = 4
    total_w = sum(c.width for c in cells) + pad * (len(cells) + 1)
    total_h = th + pad * 2
    sheet = Image.new("RGBA", (total_w, total_h), (40, 40, 40, 255))
    x = pad
    for c in cells:
        sheet.paste(c, (x, pad), c if c.mode == "RGBA" else None)
        x += c.width + pad
    return sheet


def promote_attempt(character: str, action: str, attempt: AttemptResult, root: Path) -> None:
    """Copy winning attempt files to the action root with canonical names."""
    action_dir = out_dir(character, action, root)
    video_name = f"{character}__{action}.mp4"
    gif_name = f"{character}__{action}.gif"
    shutil.copy2(attempt.video_path, action_dir / video_name)
    shutil.copy2(attempt.gif_path, action_dir / gif_name)

    final_frames = action_dir / "frames"
    if final_frames.exists():
        shutil.rmtree(final_frames)
    shutil.copytree(attempt.frames_dir, final_frames)

    # Contact sheet
    src_contact = Path(attempt.video_path).parent / "contact_sheet.png"
    if src_contact.exists():
        shutil.copy2(src_contact, action_dir / "contact_sheet.png")

    write_json(action_dir / "qa.json", attempt.qa)
    write_json(
        action_dir / "attempt_meta.json",
        {
            "character": character,
            "action": action,
            "winning_attempt": attempt.attempt,
            "passed": attempt.passed,
            "timestamp": attempt.timestamp,
        },
    )


def cmd_init(args: argparse.Namespace) -> None:
    characters = args.characters or list(PILOT_CHARACTERS)
    if args.all_jobs:
        characters = character_names_from_jobs(JOBS_DIR)
    save_prompts(characters, OUTPUT_ROOT)
    manifest = {
        "version": 1,
        "kind": "i2v-jobs-locomotion-v1",
        "created": utc_now(),
        "export_root": str(EXPORT_ROOT),
        "jobs_dir": str(JOBS_DIR),
        "special_residents_dir": str(SPECIAL_RESIDENTS_DIR),
        "output_root": str(OUTPUT_ROOT),
        "characters": characters,
        "actions": list(ACTIONS),
        "max_attempts": MAX_ATTEMPTS,
        "frame_count": FRAME_COUNT,
        "notes": [
            "Source PNGs are identity-only references and are never modified.",
            "Completed idle/woodcutter assets are motion/rhythm references only.",
            "Generate videos externally (image_to_video), then ingest with --ingest.",
            "Source lookup supports 01_jobs and 04_special_residents.",
        ],
        "generation_queue": [
            {
                "character": c,
                "action": a,
                "source_png": str(source_png_for_character(c, a)),
                "prompt_file": str(out_dir(c, a) / "prompt.txt"),
                "target_video": str(out_dir(c, a) / f"{c}__{a}.mp4"),
            }
            for c in characters
            for a in ACTIONS
        ],
    }
    write_json(OUTPUT_ROOT / "pipeline_manifest.json", manifest)
    print(f"initialized {len(characters)} characters × {len(ACTIONS)} actions")
    print(f"output_root={OUTPUT_ROOT}")
    print(f"manifest={OUTPUT_ROOT / 'pipeline_manifest.json'}")


def cmd_ingest(args: argparse.Namespace) -> None:
    character = args.character
    action = args.action
    if action not in ACTIONS:
        raise SystemExit(f"action must be one of {ACTIONS}")
    video = Path(args.video)
    attempt = int(args.attempt)
    max_attempts = int(getattr(args, "max_attempts", MAX_ATTEMPTS))

    # Ensure prompt exists
    save_prompts([character], OUTPUT_ROOT)
    result = process_video_attempt(character, action, video, attempt, OUTPUT_ROOT)

    run_path = out_dir(character, action) / "run.json"
    if run_path.exists():
        run = json.loads(run_path.read_text(encoding="utf-8"))
    else:
        run = asdict(
            ActionRun(
                character=character,
                action=action,
                source_png=str(source_png_for_character(character, action)),
                prompt=build_prompt(character, action),
            )
        )

    run["attempts"] = [a for a in run.get("attempts", []) if a.get("attempt") != attempt]
    run["attempts"].append(asdict(result))
    run["attempts"].sort(key=lambda a: a["attempt"])

    if result.passed:
        promote_attempt(character, action, result, OUTPUT_ROOT)
        run["status"] = "passed"
        run["final_video"] = str(out_dir(character, action) / f"{character}__{action}.mp4")
        run["final_frames_dir"] = str(out_dir(character, action) / "frames")
        run["final_gif"] = str(out_dir(character, action) / f"{character}__{action}.gif")
    else:
        # Keep best attempt promoted if any previous passed; else mark failed if budget spent
        any_pass = any(a.get("passed") for a in run["attempts"])
        if any_pass:
            run["status"] = "passed"
        elif attempt >= max_attempts:
            # Promote last attempt for inspection even if failed
            promote_attempt(character, action, result, OUTPUT_ROOT)
            run["status"] = "failed"
            run["final_video"] = str(out_dir(character, action) / f"{character}__{action}.mp4")
            run["final_frames_dir"] = str(out_dir(character, action) / "frames")
            run["final_gif"] = str(out_dir(character, action) / f"{character}__{action}.gif")
        else:
            run["status"] = "retry"
            # Still promote latest for inspection while waiting for retry
            promote_attempt(character, action, result, OUTPUT_ROOT)
            run["final_video"] = str(out_dir(character, action) / f"{character}__{action}.mp4")
            run["final_frames_dir"] = str(out_dir(character, action) / "frames")
            run["final_gif"] = str(out_dir(character, action) / f"{character}__{action}.gif")

    write_json(run_path, run)
    print(json.dumps({"character": character, "action": action, "attempt": attempt, "passed": result.passed, "status": run["status"], "qa": result.qa}, ensure_ascii=False, indent=2))


def cmd_report(args: argparse.Namespace) -> None:
    characters = args.characters or list(PILOT_CHARACTERS)
    if args.all_jobs:
        characters = character_names_from_jobs(JOBS_DIR)

    report: dict[str, Any] = {
        "version": 1,
        "kind": "i2v-jobs-locomotion-qa-report",
        "generated": utc_now(),
        "characters": {},
        "summary": {"passed": 0, "failed": 0, "retry": 0, "pending": 0, "total": 0},
    }
    for c in characters:
        report["characters"][c] = {}
        for a in ACTIONS:
            run_path = out_dir(c, a) / "run.json"
            if not run_path.exists():
                report["characters"][c][a] = {"status": "pending"}
                report["summary"]["pending"] += 1
            else:
                run = json.loads(run_path.read_text(encoding="utf-8"))
                report["characters"][c][a] = run
                status = run.get("status", "pending")
                if status in report["summary"]:
                    report["summary"][status] += 1
                else:
                    report["summary"]["pending"] += 1
            report["summary"]["total"] += 1

    out = OUTPUT_ROOT / (args.out or "pilot_qa_report.json")
    write_json(out, report)

    # Human-readable markdown
    md_lines = [
        "# i2v jobs locomotion QA report",
        "",
        f"- generated: {report['generated']}",
        f"- summary: {report['summary']}",
        "",
    ]
    for c in characters:
        md_lines.append(f"## {c}")
        for a in ACTIONS:
            entry = report["characters"][c][a]
            status = entry.get("status", "pending")
            md_lines.append(f"### {a} — **{status}**")
            attempts = entry.get("attempts") or []
            if not attempts:
                md_lines.append("- no attempts yet")
                continue
            last = attempts[-1]
            md_lines.append(f"- attempts: {len(attempts)} / max {MAX_ATTEMPTS}")
            md_lines.append(f"- last_passed: {last.get('passed')}")
            qa = last.get("qa") or {}
            for check in qa.get("checks") or []:
                mark = "PASS" if check.get("passed") else "FAIL"
                md_lines.append(f"  - [{mark}] `{check.get('id')}` — {check.get('detail')}")
            md_lines.append(f"- video: `{entry.get('final_video')}`")
            md_lines.append(f"- gif: `{entry.get('final_gif')}`")
            md_lines.append(f"- frames: `{entry.get('final_frames_dir')}`")
            md_lines.append("")
    md_path = out.with_suffix(".md")
    md_path.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
    print(f"report_json={out}")
    print(f"report_md={md_path}")
    print(json.dumps(report["summary"], ensure_ascii=False))


def cmd_prompt(args: argparse.Namespace) -> None:
    print(build_prompt(args.character, args.action))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="i2v jobs idle/walk locomotion pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)

    init = sub.add_parser("init", help="Create output dirs, prompts, and queue manifest")
    init.add_argument("--characters", nargs="*", default=None)
    init.add_argument("--all-jobs", action="store_true")
    init.set_defaults(func=cmd_init)

    ingest = sub.add_parser("ingest", help="Ingest a generated video, extract frames, run QA")
    ingest.add_argument("--character", required=True)
    ingest.add_argument("--action", required=True, choices=ACTIONS)
    ingest.add_argument("--video", required=True)
    ingest.add_argument("--attempt", type=int, default=1)
    ingest.set_defaults(func=cmd_ingest)

    report = sub.add_parser("report", help="Write QA report for characters")
    report.add_argument("--characters", nargs="*", default=None)
    report.add_argument("--all-jobs", action="store_true")
    report.add_argument("--out", default="pilot_qa_report.json")
    report.set_defaults(func=cmd_report)

    prompt = sub.add_parser("prompt", help="Print prompt for character/action")
    prompt.add_argument("--character", required=True)
    prompt.add_argument("--action", required=True, choices=ACTIONS)
    prompt.set_defaults(func=cmd_prompt)

    return p


def main(argv: list[str] | None = None) -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
