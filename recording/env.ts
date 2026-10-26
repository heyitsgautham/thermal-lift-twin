// Settings the recording scripts read from the environment. An empty value
// counts as unset, so a blank line copied from .env.example keeps the default.

export interface Viewport {
  name: string;
  width: number;
  height: number;
}

function setting(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

/** BASE_URL, the app the script drives, without a trailing slash. */
export function baseUrl(fallback: string, env: NodeJS.ProcessEnv = process.env): string {
  const raw = setting("BASE_URL", env) ?? fallback;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`BASE_URL must be an absolute URL such as http://localhost:3000, got "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`BASE_URL must use http or https, got "${raw}"`);
  }
  return raw.replace(/\/+$/, "");
}

/** VIEWPORTS, comma-separated WIDTHxHEIGHT sizes such as 1920x1080,1440x900. */
export function viewports(fallback: string, env: NodeJS.ProcessEnv = process.env): Viewport[] {
  const raw = setting("VIEWPORTS", env) ?? fallback;
  return raw.split(",").map((part) => {
    const name = part.trim();
    const m = /^(\d{2,5})x(\d{2,5})$/.exec(name);
    if (!m) throw new Error(`VIEWPORTS entries must look like 1920x1080, got "${name}" in "${raw}"`);
    return { name, width: Number(m[1]), height: Number(m[2]) };
  });
}
