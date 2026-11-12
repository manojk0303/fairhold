import "server-only";

/** Evidence-gathering helpers used as tools by the verifier and mediator agents. */

const MAX_BYTES = 1_500_000;

function allowedHost(u: URL) {
  const own = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : "";
  if (u.host === own) return true;
  const h = u.hostname;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.includes(":")) return false; // raw IPv6
  return true;
}

async function fetchText(url: string, accept = "text/html,*/*") {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs can be inspected");
  if (!allowedHost(u)) throw new Error("That host is not reachable from the verifier");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": "FairholdVerifier/1.0 (+deliverable check)", Accept: accept },
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
    });
    const buf = await res.arrayBuffer();
    const text = new TextDecoder().decode(buf.slice(0, MAX_BYTES));
    return { status: res.status, finalUrl: res.url, contentType: res.headers.get("content-type") ?? "", text, bytes: buf.byteLength };
  } finally {
    clearTimeout(t);
  }
}

const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function all(re: RegExp, s: string, max = 50) {
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(s)) && out.length < max) out.push(m);
  return out;
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? "";

/** Structured inspection report of a web page, built for an LLM reviewer. */
export async function inspectPage(url: string): Promise<string> {
  const page = await fetchText(url);
  const html = page.text;
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? "";
  const body = html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const noScript = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");

  const headings = all(/<(h[1-3])[^>]*>([\s\S]*?)<\/\1>/i, noScript, 40).map(
    (m) => `${m[1]}: ${strip(m[2])}`,
  );
  const links = all(/<a\b[^>]*>([\s\S]*?)<\/a>/i, noScript, 60).map((m) => {
    const tag = m[0].slice(0, m[0].indexOf(">") + 1);
    const cls = attr(tag, "class");
    return `${strip(m[1]) || "(no text)"} -> ${attr(tag, "href")}${cls ? ` [class="${cls.slice(0, 60)}"]` : ""}`;
  });
  const images = all(/<img\b[^>]*>/i, noScript, 40).map(
    (m) => `src=${attr(m[0], "src").slice(0, 120)} alt="${attr(m[0], "alt")}"`,
  );
  const forms = all(/<form\b[\s\S]*?<\/form>/i, noScript, 10).map((m) => {
    const fields = all(/<(input|textarea|select)\b[^>]*>/i, m[0], 30).map((f) => {
      const t = f[0];
      return `${f[1]}[type=${attr(t, "type") || "text"} name=${attr(t, "name")} required=${/\brequired\b/i.test(t)}]`;
    });
    return `form action=${attr(m[0], "action") || "(none)"} fields: ${fields.join(", ")}`;
  });
  const buttons = all(/<button\b[^>]*>([\s\S]*?)<\/button>/i, noScript, 30).map((m) => {
    const cls = attr(m[0].slice(0, m[0].indexOf(">") + 1), "class");
    return `${strip(m[1])}${cls ? ` [class="${cls.slice(0, 60)}"]` : ""}`;
  });

  // Pull CSS (inline + up to 3 same-site stylesheets) for colours and responsive rules.
  let css = all(/<style[^>]*>([\s\S]*?)<\/style>/i, html, 10).map((m) => m[1]).join("\n");
  const sheetHrefs = all(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/i, head, 6)
    .map((m) => attr(m[0], "href"))
    .filter(Boolean)
    .slice(0, 3);
  for (const href of sheetHrefs) {
    try {
      const s = await fetchText(new URL(href, page.finalUrl).toString(), "text/css");
      css += "\n" + s.text.slice(0, 200_000);
    } catch {
      /* ignore */
    }
  }
  const inlineStyles = all(/style=["']([^"']+)["']/i, noScript, 200).map((m) => m[1]).join(";");
  const colours = [
    ...new Set(
      [...(css + inlineStyles).matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toLowerCase()),
    ),
  ].slice(0, 30);
  const mediaQueries = [...new Set([...css.matchAll(/@media[^{]+/g)].map((m) => m[0].trim()))].slice(0, 10);

  const text = strip(noScript);
  return [
    `URL: ${page.finalUrl} (HTTP ${page.status}, ${page.contentType}, ${page.bytes} bytes)`,
    `Title: ${strip(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "(none)")}`,
    `Meta description: ${attr(head.match(/<meta[^>]*name=["']description["'][^>]*>/i)?.[0] ?? "", "content") || "(none)"}`,
    `Viewport meta: ${attr(head.match(/<meta[^>]*name=["']viewport["'][^>]*>/i)?.[0] ?? "", "content") || "(none)"}`,
    `Lang attribute: ${attr(html.match(/<html[^>]*>/i)?.[0] ?? "", "lang") || "(none)"}`,
    `Headings:\n${headings.join("\n") || "(none)"}`,
    `Links (${links.length}):\n${links.join("\n") || "(none)"}`,
    `Buttons: ${buttons.join(" | ") || "(none)"}`,
    `Forms:\n${forms.join("\n") || "(none)"}`,
    `Images (${images.length}):\n${images.join("\n") || "(none)"}`,
    `Colours found in CSS: ${colours.join(", ") || "(none)"}`,
    `Responsive @media rules: ${mediaQueries.join(" | ") || "(none)"}`,
    `Visible text (${text.split(" ").length} words, truncated):\n${text.slice(0, 3500)}`,
    `CSS rules (whitespace-collapsed, truncated):\n${css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").slice(0, 2500) || "(none)"}`,
  ].join("\n\n");
}

function parseRepo(input: string) {
  const m = input.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i) ?? input.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) throw new Error("Give a GitHub repo as owner/name or a github.com URL");
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function gh(path: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "FairholdVerifier",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub ${path} -> HTTP ${res.status}`);
  return res.json();
}

export async function inspectRepo(input: string): Promise<string> {
  const { owner, repo } = parseRepo(input);
  const meta = await gh(`/repos/${owner}/${repo}`);
  const [tree, readme, commits] = await Promise.all([
    gh(`/repos/${owner}/${repo}/git/trees/${meta.default_branch}?recursive=1`).catch(() => null),
    gh(`/repos/${owner}/${repo}/readme`).catch(() => null),
    gh(`/repos/${owner}/${repo}/commits?per_page=10`).catch(() => []),
  ]);
  const paths: string[] = (tree?.tree ?? []).filter((t: { type: string }) => t.type === "blob").map((t: { path: string }) => t.path);
  const readmeText = readme?.content ? Buffer.from(readme.content, "base64").toString("utf8") : "(no README)";
  return [
    `Repo: ${meta.full_name} — ${meta.description ?? "(no description)"}`,
    `Default branch: ${meta.default_branch}; language: ${meta.language}; license: ${meta.license?.spdx_id ?? "none"}; last push: ${meta.pushed_at}; stars: ${meta.stargazers_count}`,
    `Recent commits:\n${(commits as { commit: { message: string; author: { date: string } } }[]).map((c) => `- ${c.commit.author.date.slice(0, 10)} ${c.commit.message.split("\n")[0]}`).join("\n")}`,
    `Files (${paths.length}${paths.length > 250 ? ", first 250 shown" : ""}):\n${paths.slice(0, 250).join("\n")}`,
    `README (truncated):\n${readmeText.slice(0, 6000)}`,
  ].join("\n\n");
}

export async function readRepoFile(input: string, path: string): Promise<string> {
  const { owner, repo } = parseRepo(input);
  const f = await gh(`/repos/${owner}/${repo}/contents/${path.replace(/^\//, "")}`);
  if (Array.isArray(f)) return `Directory listing: ${f.map((x: { name: string }) => x.name).join(", ")}`;
  const text = Buffer.from(f.content ?? "", "base64").toString("utf8");
  return `${path} (${f.size} bytes):\n${text.slice(0, 10_000)}`;
}

/** Deterministic facts about an uploaded image (format, pixel size, bytes). */
export function imageFacts(dataUrl: string) {
  const [meta, b64] = dataUrl.split(",");
  const mediaType = meta.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const buf = Buffer.from(b64 ?? "", "base64");
  let width = 0,
    height = 0;
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    width = buf.readUInt32BE(16);
    height = buf.readUInt32BE(20);
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        height = buf.readUInt16BE(i + 5);
        width = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
  } else if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
    const chunk = buf.slice(12, 16).toString();
    if (chunk === "VP8X") {
      width = 1 + buf.readUIntLE(24, 3);
      height = 1 + buf.readUIntLE(27, 3);
    }
  }
  return { mediaType, bytes: buf.length, width, height, base64: b64 ?? "" };
}
