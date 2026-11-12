/**
 * A sample freelancer deliverable used by the demo: a standalone bakery website served as raw HTML,
 * independent of Fairhold's own styles, so the AI verifier inspects it exactly like a real client site.
 * Default version has realistic gaps (no message field, a missing alt text, short menu, dead order link).
 * ?v=2 is the "fixed" delivery.
 */
const svg = (bg: string, fg: string, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${bg}"/><circle cx="240" cy="160" r="90" fill="${fg}" opacity="0.85"/><text x="240" y="300" font-family="Georgia" font-size="22" text-anchor="middle" fill="${fg}">${label}</text></svg>`,
  )}`;

export async function GET(req: Request) {
  const fixed = new URL(req.url).searchParams.get("v") === "2";
  const menu = [
    ["Country sourdough loaf", "7.50"],
    ["Seeded rye", "8.00"],
    ["Butter croissant", "3.75"],
    ["Pain au chocolat", "4.25"],
    ["Cardamom bun", "4.50"],
    ["Cinnamon morning roll", "4.00"],
    ...(fixed
      ? [
          ["Lemon poppy loaf cake (slice)", "4.75"],
          ["Brown butter cookie", "3.25"],
          ["Custom celebration cake (6-inch)", "48.00"],
        ]
      : []),
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bloom &amp; Rye — Neighbourhood Bakery</title>
<meta name="description" content="Bloom & Rye is a neighbourhood bakery baking sourdough, rye and pastries every morning.">
<style>
  :root { --green: #2f6b4f; --cream: #fbf7f0; --ink: #2b2620; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: var(--ink); background: var(--cream); line-height: 1.6; }
  header, section, footer { padding: 48px 24px; max-width: 980px; margin: 0 auto; }
  h1 { font-size: 3rem; margin: 0 0 8px; }
  .cta { display: inline-block; background: #2f6b4f; color: #fff; padding: 12px 22px; border-radius: 999px; text-decoration: none; font-family: system-ui, sans-serif; font-weight: 600; border: 0; cursor: pointer; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .grid img { width: 100%; height: auto; border-radius: 12px; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 8px 0; border-bottom: 1px solid #e6dccb; }
  td:last-child { text-align: right; }
  form { display: grid; gap: 12px; max-width: 480px; }
  input, textarea { padding: 10px 12px; border: 1px solid #cbbfa8; border-radius: 8px; font: inherit; }
  @media (max-width: 720px) { h1 { font-size: 2.2rem; } .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>Bloom &amp; Rye</h1>
  <p>Slow-fermented bread and honest pastries, baked on Elm Street since 2019.</p>
  <a class="cta" href="${fixed ? "#order" : "#"}">Order for pickup</a>
</header>

<section aria-label="Our bakes">
  <div class="grid">
    <img src="${svg("#e9dcc4", "#8a5a2b", "sourdough")}" alt="A round country sourdough loaf with a deep golden crust">
    <img src="${svg("#efe3cf", "#a0662e", "croissant")}" alt="${fixed ? "Flaky butter croissants cooling on a wire rack" : ""}">
    <img src="${svg("#e3e8dc", "#2f6b4f", "rye")}" alt="Sliced seeded rye bread on a wooden board">
  </div>
</section>

<section id="hours">
  <h2>Opening hours</h2>
  <table>
    <tr><td>Monday</td><td>7:00 – 15:00</td></tr>
    <tr><td>Tuesday</td><td>7:00 – 15:00</td></tr>
    <tr><td>Wednesday</td><td>7:00 – 15:00</td></tr>
    <tr><td>Thursday</td><td>7:00 – 15:00</td></tr>
    <tr><td>Friday</td><td>7:00 – 17:00</td></tr>
    <tr><td>Saturday</td><td>8:00 – 17:00</td></tr>
    <tr><td>Sunday</td><td>8:00 – 13:00</td></tr>
  </table>
</section>

<section id="menu">
  <h2>Menu</h2>
  <table>
    ${menu.map(([n, p]) => `<tr><td>${n}</td><td>$${p}</td></tr>`).join("\n    ")}
  </table>
</section>

${
  fixed
    ? `<section id="order">
  <h2>Order for pickup</h2>
  <form action="/samples/bloom-and-rye/order" method="post">
    <input name="name" placeholder="Your name" required>
    <input name="items" placeholder="What would you like?" required>
    <input name="pickup" type="date" required>
    <button class="cta" type="submit">Place pickup order</button>
  </form>
</section>`
    : ""
}

<section id="contact">
  <h2>Custom cakes &amp; questions</h2>
  <form action="/samples/bloom-and-rye/contact" method="post">
    <input name="name" placeholder="Your name"${fixed ? " required" : ""}>
    <input name="email" type="email" placeholder="Email" required>
    ${fixed ? `<textarea name="message" rows="4" placeholder="Tell us about your cake" required></textarea>` : ""}
    <button class="cta" type="submit">Send message</button>
  </form>
</section>

<footer>
  <p>Bloom &amp; Rye · 14 Elm Street · hello@bloomandrye.example</p>
</footer>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
