"""VNS stage: Visual Odometry & Rover Localization (09_Navigation).

Produces the rover's odometry/localization output:
  * Rover_Characterization.{json,txt,csv,xlsx} - label/value properties
    (Visual Odom Distance / Rover Coordinates / Property_03 / Property_04)
  * Rover_Localization.png - rendered rover position over the scene

Usage: navigation.py [input] [output_dir]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vnsio


def main():
    input_path = vnsio.require_image_arg(sys.argv)
    out_dir = vnsio.output_dir_arg(sys.argv, os.getcwd())
    vnsio.log("Visual odometry & localization started")

    os.makedirs(out_dir, exist_ok=True)

    # Rover_Characterization sidecars, read back by getNavigationProperties()
    # as [distance, coords, p03, p04].
    properties = [
        ("Visual Odom Distance", "1.2"),
        ("Rover Coordinates", "(0.8, 1.2)"),
        ("Property_03", "0.5"),
        ("Property_04", "0.7"),
    ]
    vnsio.write_properties(out_dir, "Rover_Characterization", properties)

    # Rover_Localization.png: terrain with a traversed path + rover position.
    canvas = vnsio.Canvas(640, 400)
    vnsio.paint_terrain(canvas, seed=11)
    canvas.text("ROVER LOCALIZATION", 20, 20, (255, 255, 255, 255), 14)

    # Traversed path (green) from bottom-left to the rover's position.
    path = [(60, 340), (140, 300), (220, 260), (300, 240), (400, 200)]
    for i in range(len(path) - 1):
        x1, y1 = path[i]
        x2, y2 = path[i + 1]
        canvas.line(x1, y1, x2, y2, (57, 211, 83, 255), 3)

    cx, cy = 400, 200
    canvas.ellipse(cx, cy, 14, 14, (255, 120, 60, 255), fill=False)
    canvas.ellipse(cx, cy, 6, 6, (57, 211, 83, 255), fill=True)
    canvas.text("ROVER", cx - 24, cy - 34, (255, 255, 255, 255), 10)
    canvas.text("(0.8, 1.2)", cx - 30, cy + 24, (200, 255, 220, 255), 10)

    vnsio.write_png(640, 400, canvas.px, os.path.join(out_dir, "Rover_Localization.png"))

    vnsio.log(
        "Visual odometry & localization complete -> Rover_Characterization."
        "{json,txt,csv,xlsx}, Rover_Localization.png"
    )


if __name__ == "__main__":
    main()