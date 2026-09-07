"""VNS stage: Telemetry / Telecommand log (12_Telemetry_Data / 11_Telecommand_Data).

Produces the ongoing command/telemetry log:
  * 11_Telecommand_Data: Telemetry.{json,txt,csv,xlsx}
    (Img No / Module / Size / Value / timestamp / Status)
  * 12_Telemetry_Data:   Telemetry.{json,txt,csv,xlsx}
    (VO Distance Traveled (m) / Lunar Coordinates (N) / Lunar Coordinates (E))

Takes a 'channel' argument (telemetry | telecommand) so both folders can be
fed from the same executable, each with the exact column schema the app's
reader (normalizeTelemetryRecord / normalizeCmdRecord in electron/main.cjs)
expects.

Usage: telemetry.py [channel] [output_dir]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vnsio


def main():
    channel = sys.argv[1] if len(sys.argv) > 1 else "telemetry"
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
    vnsio.log(f"Telemetry/telecommand ({channel}) started")

    os.makedirs(out_dir, exist_ok=True)

    if channel == "telecommand":
        columns = ["Img No", "Module", "Size", "Value", "timestamp", "Status"]
        rows = [
            ["TC001", 1, "2KB", "", "1:25:23", "Completed"],
            ["TC002", 2, "4KB", "", "2:25:23", "In Progress"],
            ["TC003", 3, "3KB", "", "3:25:23", "Success"],
            ["TC004", 4, "2KB", "", "4:25:23", "Completed"],
        ]
    else:
        columns = ["VO Distance Traveled (m)", "Lunar Coordinates (N)", "Lunar Coordinates (E)"]
        rows = [
            ["12.5", "S 28.4521", "E 21.2440"],
            ["34.8", "S 28.4518", "E 21.2447"],
            ["55.2", "S 28.4514", "E 21.2455"],
            ["78.9", "S 28.4509", "E 21.2463"],
        ]
    vnsio.write_sidecars(out_dir, "Telemetry", columns, rows)

    vnsio.log(f"Telemetry ({channel}) complete -> Telemetry.{{json,txt,csv,xlsx}}")


if __name__ == "__main__":
    main()
