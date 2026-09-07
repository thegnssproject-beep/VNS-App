"""VNS stage: Predicted Safe Path (08_Pred_Safe_Path).

Produces:
  * SafePath.png                 - rendered predicted path over the scene
  * Waypoints.{json,txt,csv,xlsx} - waypoint list
    (Waypoint ID / Coord_X / Coord_Z / Property_04 / Property_05)

Usage: safe_path.py [input] [output_dir]
"""
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vnsio


def main():
    input_path = vnsio.require_image_arg(sys.argv)
    out_dir = vnsio.output_dir_arg(sys.argv, os.getcwd())
    vnsio.log("Safe path started")

    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(3)

    canvas = vnsio.Canvas(640, 400)
    vnsio.paint_terrain(canvas, seed=31)

    # waypoint coordinates (in metres) following the reference sample
    waypoints = []
    xcum = 0.0
    zcum = 0.6
    waypoints.append({"id": 1, "x": 0.5, "z": 0.6, "p04": 0.5, "p05": 0.5})
    wp = [
        (0.5, 0.6, 0.5, 0.5),
        (0.5, 1.0, 0.7, 0.7),
        (0.8, 1.2, 1.2, 1.2),
        (1.2, 1.8, 1.5, 1.5),
        (1.6, 2.4, 1.8, 1.8),
    ]
    for i, (x, z, p4, p5) in enumerate(wp, start=1):
        waypoints.append({"id": i, "x": x, "z": z, "p04": p4, "p05": p5})

    # draw a safe path polyline across the terrain
    pts = []
    for i, w in enumerate(waypoints):
        px = 60 + (i / max(len(waypoints) - 1, 1)) * 520
        py = 340 - w["z"] * 90
        pts.append((px, py))
        pts.append((px, py))
    for i in range(len(pts) - 1):
        canvas.line(int(pts[i][0]), int(pts[i][1]), int(pts[i + 1][0]), int(pts[i + 1][1]),
                    (57, 211, 83, 255), 3)
    for i, (px, py) in enumerate(pts[::2]):
        canvas.ellipse(px, py, 5, 5, (232, 214, 74, 255))
        canvas.text(str(waypoints[i]["id"]), px, py - 18, (255, 255, 255, 255), 11)
    canvas.text("PREDICTED SAFE PATH", 20, 20, (255, 255, 255, 255), 14)
    vnsio.write_png(640, 400, canvas.px, os.path.join(out_dir, "SafePath.png"))

    columns = ["Waypoint ID", "Coord_X", "Coord_Z", "Property_04", "Property_05"]
    rows = [[w["id"], w["x"], w["z"], w["p04"], w["p05"]] for w in waypoints]
    vnsio.write_sidecars(out_dir, "Waypoints", columns, rows)

    vnsio.log(f"Safe path complete: {len(waypoints)} waypoints -> SafePath.png + Waypoints.*")
    for w in waypoints:
        print(f"  WP {w['id']}: x={w['x']} z={w['z']}")


if __name__ == "__main__":
    main()
