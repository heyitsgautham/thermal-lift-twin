// Cuts the calendar drag out of the recorded MP4 into docs/hero.gif for the README.
//   pnpm tsx recording/hero-gif.ts
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { SCENES } from "./storyboard";

const ROOT = dirname(fileURLToPath(import.meta.url));
const drag = SCENES.find((s) => s.id === "drag")!;
const from = drag.start_s - 0.5;
const length = 15;
const mp4 = resolve(ROOT, "out/calendar-take.mp4");
const gif = resolve(ROOT, "../docs/hero.gif");
const filter = `fps=12,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;

execFileSync(ffmpegPath as unknown as string, ["-y", "-loglevel", "error", "-ss", String(from), "-t", String(length), "-i", mp4, "-vf", filter, gif], {
  stdio: "inherit",
});
console.log(`wrote ${gif}`);
