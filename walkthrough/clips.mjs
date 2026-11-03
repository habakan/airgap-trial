// Cuts the guide clips out of a CLIPS=1 recording into site/clips/.
// usage: node clips.mjs pico|bit-hanko
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const signer = process.argv[2] ?? "pico";
const clips = JSON.parse(readFileSync(`out/clips-${signer}.json`, "utf8"));
mkdirSync("../site/clips", { recursive: true });
for (const { name, start, end, crop } of clips) {
  // 2x the guide's width, so the clip stays sharp on high-density screens
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(start), "-to", String(end), "-i", `out/walkthrough-${signer}-clips.webm`,
    "-vf", `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=432:-2:flags=lanczos`, "-an",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-preset", "slow", "-movflags", "+faststart",
    `../site/clips/${signer}-${name}.mp4`]);
}
