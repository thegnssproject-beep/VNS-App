# VNS - hello world test script
# -----------------------------
# Dead-simple script to prove the "Run Detection" button can launch a
# Python executable. Prints to stdout (the button shows it in a toast on
# failure only, but captures it) and writes hello.txt into the output dir.
#
# Usage: hello_world.py [input_image] [output_dir]
import sys
import os
from datetime import datetime


def main():
    input_image = sys.argv[1] if len(sys.argv) > 1 else "none"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else ""

    print("Hello World from VNS!")

    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        with open(os.path.join(output_dir, "hello.txt"), "w", encoding="utf-8") as f:
            f.write(f"Hello World from VNS!\n")
            f.write(f"ran at: {datetime.now().isoformat()}\n")
            f.write(f"input_image: {input_image}\n")


if __name__ == "__main__":
    main()