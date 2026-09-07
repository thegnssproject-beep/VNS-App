"""VNS stage: Occupancy Grid (07_Occupancy_Grid).

Produces:
  * Grid.png                 - rendered occupancy grid
  * Grid.{json,txt,csv,xlsx} - grid properties (Obs ID / Type / Coords / Width)

Usage: occupancy_grid.py [input] [output_dir]
"""
import os
import sys
import random

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vnsio


def main():
    input_path = vnsio.require_image_arg(sys.argv)
    out_dir = vnsio.output_dir_arg(sys.argv, os.getcwd())
    vnsio.log("Occupancy grid started")

    os.makedirs(out_dir, exist_ok=True)
    rng = random.Random(7)

    grid = vnsio.Canvas(640, 400, bg=(244, 247, 251, 255))
    # light grid lines
    for gx in range(0, 640, 64):
        grid.line(gx, 0, gx, 400, (219, 228, 238, 255), 1)
    for gy in range(0, 400, 40):
        grid.line(0, gy, 640, gy, (219, 228, 238, 255), 1)

    obstacles = []
    for i in range(3):
        otype = ["Big Rock", "Rock", "Crtr"][i]
        ox = rng.uniform(80, 560)
        oy = rng.uniform(80, 320)
        ow = rng.uniform(50, 120)
        obstacles.append({
            "id": i + 1,
            "type": otype,
            "x": round(ox * 0.01, 2),
            "z": round(oy * 0.01, 2),
            "width": round(ow * 0.01, 2),
            "px": ox,
            "py": oy,
            "pw": ow,
        })
        grid.rect(ox - ow / 2, oy - ow / 2, ow, ow, (224, 138, 43, 255), 3)
        grid.text(str(i + 1), ox - 6, oy - 6, (47, 111, 176, 255), 12)
    grid.text("OCCUPANCY GRID", 20, 20, (47, 111, 176, 255), 14)
    vnsio.write_png(640, 400, grid.px, os.path.join(out_dir, "Grid.png"))

    # Grid.txt format from the reference build (label/value block) --
    columns = ["Obs. ID", "Type", "Coord_X", "Coord_Z", "Width"]
    rows = [[ob["id"], ob["type"], ob["x"], ob["z"], ob["width"]] for ob in obstacles]

    # Also write the human Grid.txt in the reference label style
    with open(os.path.join(out_dir, "Grid.txt"), "w") as f:
        for ob in obstacles:
            f.write(f"{'Obs. ID':>10} {ob['id']}\n")
            f.write(f"{'Obs. Type':>10} {ob['type']}\n")
            f.write(f"{'Coordinates - x':>10} {ob['x']}m\n")
            f.write(f"{'Coordinates - z':>10} {ob['z']}m\n")
            f.write(f"{'Obs. Width':>10} {ob['width']}m\n")

    vnsio.write_sidecars(out_dir, "Grid", columns, rows)

    vnsio.log("Occupancy grid complete")
    print(f"Wrote Grid.png + Grid.{{json,txt,csv,xlsx}} ({len(obstacles)} obstacles)")


if __name__ == "__main__":
    main()
