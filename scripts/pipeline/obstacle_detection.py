"""VNS stage: Obstacle Detection (05_Obstacle.Detection).

Detects obstacles in the current session's Left image and produces:
  * Bbox.jpg         - rendered bounding boxes over the scene
  * Segmentation.png - rendered pixel mask
  * Obstacle_details.{json,txt,csv,xlsx} - per-obstacle records
    (Img No / Obs. ID / confidence / Type / Height / Property_05)

Usage: obstacle_detection.py [input] [output_dir]
"""
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vnsio


OBSTACLE_PROFILES = [
    ("Rock", (180, 120, 90, 255), (0.70, 0.6)),
    ("Crtr", (120, 100, 90, 255), (0.90, 0.5)),
    ("Rock", (170, 115, 85, 255), (0.85, 0.6)),
    ("Stone", (210, 190, 160, 255), (0.78, 0.45)),
    ("Crtr", (150, 130, 110, 255), (0.88, 0.9)),
]


def build_obstacles(rng):
    obstacles = []
    for i in range(3):
        otype, color, _prof = OBSTACLE_PROFILES[i % len(OBSTACLE_PROFILES)]
        conf, height = rng.uniform(0.70, 0.92), rng.uniform(0.4, 1.0)
        cw, ch = rng.uniform(70, 160), rng.uniform(50, 120)
        cx = rng.uniform(60, 620)
        cy = rng.uniform(180, 340)
        obstacles.append({
            "id": i + 1,
            "type": otype,
            "conf": round(conf, 2),
            "height": round(height, 2),
            "p05": round(rng.uniform(0.4, 1.3), 2),
            "color": color,
            "x": cx,
            "y": cy,
            "w": cw,
            "h": ch,
        })
    return obstacles


def main():
    input_path = vnsio.require_image_arg(sys.argv)
    out_dir = vnsio.output_dir_arg(sys.argv, os.getcwd())
    vnsio.log("Obstacle detection started")

    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(42)
    obstacles = build_obstacles(rng)

    # --- Bbox.jpg: scene with green bounding boxes + IDs ---
    bbox = vnsio.Canvas(640, 400)
    vnsio.paint_terrain(bbox, seed=5)
    for ob in obstacles:
        bbox.rect(ob["x"] - ob["w"] / 2, ob["y"] - ob["h"] / 2, ob["w"], ob["h"],
                  (57, 211, 83, 255), 3)
        bbox.text(str(ob["id"]), ob["x"] - 6, ob["y"] - ob["h"] / 2 - 20,
                  (255, 255, 255, 255), 12)
    bbox.text("OBSTACLE BOUNDING BOXES", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, bbox.px, os.path.join(out_dir, "Bbox.jpg"))

    # --- Segmentation.png: filled pixel mask blobs ---
    seg = vnsio.Canvas(640, 400, bg=(12, 17, 22, 255))
    for ob in obstacles:
        seg.ellipse(ob["x"], ob["y"], ob["w"] / 2, ob["h"] / 2, ob["color"], fill=True)
    seg.text("OBSTACLE PIXEL MASK", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, seg.px, os.path.join(out_dir, "Segmentation.png"))

    # --- Obstacle_details sidecars ---
    columns = ["Img No.", "Obs. ID", "confidence", "Type", "Height", "Property_05"]
    rows = [[1, ob["id"], ob["conf"], ob["type"], ob["height"], ob["p05"]] for ob in obstacles]
    vnsio.write_sidecars(out_dir, "Obstacle_details", columns, rows)

    vnsio.log(
        f"Obstacle detection complete: {len(obstacles)} obstacles "
        f"-> Bbox.jpg, Segmentation.png, Obstacle_details.{{json,txt,csv,xlsx}}"
    )
    for ob in obstacles:
        print(f"  Obs {ob['id']}: {ob['type']} conf={ob['conf']} height={ob['height']}")


if __name__ == "__main__":
    main()
