// Records the Pico walkthrough: loads the test seed, signs a PSBT over QR codes and broadcasts it on signet.
// usage: CHROME=<chromium binary> node record.mjs [base url]   (BROADCAST=0 stops before broadcasting)
import { chromium } from "playwright-core";
import { mkdirSync, renameSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:8000/";
const SIZE = { width: 1440, height: 1200 };
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: "out/raw", size: SIZE } });
const page = await context.newPage();
const signer = page.frameLocator("#signer");
const wait = ms => page.waitForTimeout(ms);

// Headless video has no pointer, so the page draws one, plus a caption bar
await page.addInitScript(() => addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = `#wt-cursor { position:fixed; z-index:99999; left:0; top:0; width:22px; height:22px; margin:-11px 0 0 -11px; border-radius:50%;
      background:#ffcc33cc; border:3px solid #1b1a17; pointer-events:none; transition:transform .12s; }
    #wt-cursor.down { transform:scale(.7); }
    #wt-caption { position:fixed; z-index:99998; left:50%; bottom:28px; transform:translateX(-50%); max-width:1100px; padding:16px 26px; border-radius:12px;
      background:#141310e8; color:#fff; font:600 26px/1.35 system-ui, sans-serif; text-align:center; pointer-events:none; }
    #wt-caption:empty { display:none; }`;
  document.head.append(style);
  document.body.append(Object.assign(document.createElement("div"), { id: "wt-cursor" }), Object.assign(document.createElement("div"), { id: "wt-caption" }));
}));

let pointer = { x: SIZE.width / 2, y: SIZE.height / 2 };
const showPointer = (x, y, down) => page.evaluate(([x, y, down]) => {
  const c = document.getElementById("wt-cursor");
  c.style.left = `${x}px`; c.style.top = `${y}px`; c.classList.toggle("down", down);
}, [x, y, down]);
async function moveTo(x, y, { steps = 25, down = false } = {}) {
  const from = pointer;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    pointer = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
    await page.mouse.move(pointer.x, pointer.y);
    await showPointer(pointer.x, pointer.y, down);
  }
}
async function clickAt(x, y) {
  await moveTo(x, y);
  await showPointer(x, y, true); await page.mouse.down(); await wait(120);
  await page.mouse.up(); await showPointer(x, y, false);
}
const caption = text => page.evaluate(t => { document.getElementById("wt-caption").textContent = t; }, text);

const rect = selector => page.evaluate(s => {
  const b = document.querySelector(s).getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}, selector);
const inSigner = selector => page.evaluate(s => {
  const frame = document.getElementById("signer"), f = frame.getBoundingClientRect(), b = frame.contentDocument.querySelector(s).getBoundingClientRect();
  return { x: f.x + b.x, y: f.y + b.y, w: b.width, h: b.height };
}, selector);
const center = r => [r.x + r.w / 2, r.y + r.h / 2];
const click = async r => clickAt(...center(await r));
const key = async (k, pause = 1400) => { await click(inSigner(`.pad button[data-key="${k}"]`)); await wait(pause); };

// The signer is dragged by its frame, away from the buttons
async function dragSignerBy(dx, dy) {
  const d = await inSigner(".device"), x = d.x + d.w * .7, y = d.y + 15;
  await moveTo(x, y);
  await showPointer(x, y, true); await page.mouse.down();
  await moveTo(x + dx, y + dy, { steps: 45, down: true });
  await page.mouse.up(); await showPointer(x + dx, y + dy, false);
}
async function aimSignerAt(selector) {
  const [tx, ty] = center(await rect("#beam-target")), [qx, qy] = center(await rect(selector));
  await dragSignerBy(qx - tx, qy - ty);
}

await page.goto(BASE);
await signer.locator(".device canvas").waitFor();
await page.waitForFunction(() => /[1-9]/.test(document.getElementById("wallet-balance")?.textContent ?? ""), null, { timeout: 30000 });
await caption("A signet-only trial: a watch-only wallet and a signer, linked only by QR codes");
await wait(3500);
await page.evaluate(() => scrollTo({ top: 300, behavior: "smooth" }));
await wait(1500);

await caption("1. On the signer, choose “Scan SeedQR”");
await wait(1500);
await key(4, 800);
await caption("Move the signer so its camera sees the public test SeedQR");
await aimSignerAt("#seed-qr");
await wait(2500);
await caption("The key is loaded on the signer. The wallet only knows the public side");
await wait(3500);

await caption("2. In the wallet, create the transaction");
await click(rect("#wallet-next-compose")); await wait(1500);
await click(rect("#create")); await wait(2500);
await caption("The unsigned transaction (PSBT) becomes an animated QR");
await wait(3000);

await caption("3. Choose “Scan PSBT” and point the signer at the QR");
await key(4, 800);
await aimSignerAt("#qr");
await wait(3500);
await caption("Check the amount, the fee, the recipient and the change on the signer’s own screen");
await key(4, 2600); await key(4, 2600); await key(4, 2600);
await caption("Approve with SIGN");
await key(3, 1000); await key(4, 2500);
await caption("The signer shows the signed transaction as a QR");
await wait(2500);

await caption("4. Move the signer aside and scan the signed QR with the wallet camera");
await dragSignerBy(420, 0); await wait(600);
await click(rect("#open-signed-scan")); await wait(1500);
{
  const [lx, ly] = center(await inSigner(".device canvas")), [cx, cy] = center(await rect("#wallet-camera-frame"));
  await dragSignerBy(cx - lx, cy - ly);
}
await page.waitForFunction(() => !document.getElementById("wallet-screen-broadcast").hidden, null, { timeout: 30000 });
await caption("The wallet received the signed transaction");
await wait(3000);

if (process.env.BROADCAST !== "0") {
  await caption("Broadcast it to signet");
  await click(rect("#broadcast"));
  await page.waitForFunction(() => /Broadcast:/.test(document.getElementById("wallet-screen-broadcast").innerText), null, { timeout: 30000 });
  await wait(1500);
}
await caption("Only QR codes crossed the air gap. Try it yourself on this page");
await wait(4000);

const video = page.video();
await context.close();
await browser.close();
mkdirSync("out", { recursive: true });
renameSync(await video.path(), "out/walkthrough-pico.webm");
