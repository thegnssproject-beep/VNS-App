# VNS - Obstacle Detection test script
# -------------------------------------
# This is a placeholder script used to verify that the "Run Detection"
# button on the Obstacle Detection tab can invoke a Python executable.
#
# It expects two arguments (typical invocation):
#   test_detection.py <input_image_path> <output_dir>
#
# For now it just writes a small log (with the CLI args echoed) to the
# output directory so you can confirm the .exe was launched correctly.
# Replace the body of this file with the real detection pipeline later.

import sys
import os
from datetime import datetime


def main():
    input_image = sys.argv[1] if len(sys.argv) > 1 else ""
    output_dir = sys.argv[2] if len(sys.argv) > 2 else ""

    print(f"[VNS test_detection] started at {datetime.now().isoformat()}")
    print(f"[VNS test_detection] input_image = {input_image!r}")
    print(f"[VNS test_detection] output_dir  = {output_dir!r}")

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        log_path = os.path.join(output_dir, "detection_run.log")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(f"timestamp: {datetime.now().isoformat()}\n")
            f.write(f"input_image: {input_image}\n")
            f.write(f"output_dir: {output_dir}\n")
            f.write("status: ok (placeholder script ran successfully)\n")
        print(f"[VNS test_detection] wrote {log_path}")

    print("[VNS test_detection] done")


if __name__ == "__main__":
    main()
