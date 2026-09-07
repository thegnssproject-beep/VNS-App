import fs from "fs";
import pdf from "pdf-parse";
const files = [
  "C:\\YousufVNS\\Report Layout\\Report Layout.pdf",
  "C:\\Users\\sahibalaljee\\Downloads\\Vision_Navigation_Software (1)\\Vision_Navigation_Software\\15_Report\\session_run_20260902_003717\\Vision_Navigation_Analysis_Report_session_run_20260902_003717.pdf"
];
for (const f of files) {
  const buf = fs.readFileSync(f);
  try {
    const data = await pdf(buf);
    console.log("===== " + f.split("\\").pop() + " (pages=" + data.numpages + ") =====");
    console.log(data.text);
    console.log("\n");
  } catch (e) {
    console.log("ERR reading " + f + ": " + e.message);
  }
}
