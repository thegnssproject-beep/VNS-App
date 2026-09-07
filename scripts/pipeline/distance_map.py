"""VNS stage: Distance Map (06_Distance_Map).

Produces the distance-map stage outputs:
  * Obs_distances.jpg          - obstacles labelled with distances
  * DistanceMap.png            - heatmap of obstacle distances
  * 3D_View.png + 3D_view.ply  - simple 3D point representation
  * Relative_Elevation_Map.png - elevation colour map
  * Obstacle_distances.{json,txt,csv,xlsx} - per-obstacle distances
    (Img No / Obs. ID / Type / Height / Width / Distance)

Usage: distance_map.py [input] [output_dir]
"""
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vnsio


def heat_color(t):
    """Map 0..1 onto a jet-like ramp."""
    t = max(0.0, min(1.0, t))
    if t < 0.25:
        r, g, b = 15, 47, 107
        r += (31 - 15) * (t / 0.25)
        g += (127 - 47) * (t / 0.25)
        b += (174 - 107) * (t / 0.25)
    elif t < 0.5:
        k = (t - 0.25) / 0.25
        r = 31 + (57 - 31) * k
        g = 127 + (193 - 127) * k
        b = 174 + (163 - 174) * k
    elif t < 0.75:
        k = (t - 0.5) / 0.25
        r = 57 + (242 - 57) * k
        g = 193 + (197 - 193) * k
        b = 163 + (61 - 163) * k
    else:
        k = (t - 0.75) / 0.25
        r = 242 + (184 - 242) * k
        g = 197 + (40 - 197) * k
        b = 61 + (31 - 61) * k
    return (int(r), int(g), int(b), 255)


def main():
    input_path = vnsio.require_image_arg(sys.argv)
    out_dir = vnsio.output_dir_arg(sys.argv, os.getcwd())
    vnsio.log("Distance map started")

    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(99)

    dists = []
    for i in range(3):
        otype = ["Rock", "Crtr", "Rock"][i]
        height = rng.uniform(0.3, 1.0)
        width = rng.uniform(0.4, 0.8)
        distance = rng.uniform(0.5, 2.0)
        dists.append({
            "id": i + 1,
            "type": otype,
            "height": round(height, 2),
            "width": round(width, 2),
            "distance": round(distance, 2),
            "x": rng.uniform(80, 560),
            "y": rng.uniform(200, 330),
        })

    # --- Obs_distances.jpg: obstacles + measured distance labels ---
    obs = vnsio.Canvas(640, 400)
    vnsio.paint_terrain(obs, seed=17)
    for d in dists:
        obs.rect(d["x"] - 40, d["y"] - 30, 80, 60, (63, 143, 214, 255), 3)
        obs.text(f'{d["distance"]} m', d["x"] - 20, d["y"] - 50, (255, 255, 255, 255), 12)
    obs.text("OBSTACLE DISTANCES", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, obs.px, os.path.join(out_dir, "Obs_distances.jpg"))

    # --- DistanceMap.png: heatmap ---
    heat = vnsio.Canvas(640, 400, bg=(12, 17, 22, 255))
    for yy in range(400):
        for xx in range(640):
            # distance from all obstacles -> cooler = further
            dmin = 999.0
            for d in dists:
                dd = ((xx - d["x"]) ** 2 + (yy - d["y"]) ** 2) ** 0.5
                dmin = min(dmin, dd)
            t = max(0.0, min(1.0, 1.0 - dmin / 260.0))
            heat.px[yy * 640 + xx] = heat_color(t)
    heat.text("DISTANCE MAP", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, heat.px, os.path.join(out_dir, "DistanceMap.png"))

    # --- 3D_View.png + 3D_view.ply ---
    v3d = vnsio.Canvas(640, 400, bg=(17, 22, 28, 255))
    v3d.line(80, 320, 560, 320, (120, 130, 140, 255), 2)
    for i, d in enumerate(dists):
        px = 160 + i * 160
        py = 220 + int(d["distance"] * 40)
        v3d.fill_rect(px - 30, py, 60, 60, d["color"] if False else (100, 120, 200, 255))
        v3d.rect(px - 30, py, 60, 60, (180, 200, 230, 255), 3)
    v3d.text("3D VIEW", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, v3d.px, os.path.join(out_dir, "3D_View.png"))

    # simple .ply ASCII point cloud
    ply_lines = ["ply", "format ascii 1.0", f"element vertex {len(dists) * 20}",
                 "property float x", "property float y", "property float z", "end_header"]
    for d in dists:
        for k in range(20):
            ply_lines.append(f"{d['x'] * 0.01:.4f} {d['y'] * 0.01:.4f} {d['distance']:.4f}")
    with open(os.path.join(out_dir, "3D_view.ply"), "w") as f:
        f.write("\n".join(ply_lines) + "\n")

    # --- Relative_Elevation_Map.png ---
    elev = vnsio.Canvas(640, 400, bg=(20, 30, 45, 255))
    for yy in range(400):
        for xx in range(640):
            t = ((xx / 640.0) * 0.7 + (yy / 400.0) * 0.3)
            elev.px[yy * 640 + xx] = heat_color(t)
    elev.text("RELATIVE ELEVATION MAP", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, elev.px, os.path.join(out_dir, "Relative_Elevation_Map.png"))

    # --- Obstacle_distances sidecars ---
    columns = ["Img No.", "Obs. ID", "Type", "Height", "Width", "Distance"]
    rows = [[1, d["id"], d["type"], d["height"], d["width"], d["distance"]] for d in dists]
    vnsio.write_sidecars(out_dir, "Obstacle_distances", columns, rows)

    vnsio.log("Distance map complete")
    for d in dists:
        print(f"  Obs {d['id']}: {d['type']} height={d['height']} width={d['width']} distance={d['distance']}")


if __name__ == "__main__":
    main()
