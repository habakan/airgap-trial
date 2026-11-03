// Records a walkthrough of the trial: loads the test seed and signs a PSBT over QR codes. It stops before broadcasting.
// usage: CHROME=<chromium binary> node record.mjs pico|bit-hanko [base url]
import { chromium } from "playwright-core";
import { mkdirSync, renameSync } from "node:fs";

const SIGNER = process.argv[2] ?? "pico";
if (!["pico", "bit-hanko"].includes(SIGNER)) throw new Error(`unknown signer: ${SIGNER}`);
const BASE = process.argv[3] ?? "http://localhost:8000/";
// The phone is taller than the Pico, and has to reach the SeedQR at the top
const SIZE = { width: 1440, height: SIGNER === "pico" ? 1200 : 1300 };
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

// Drags from the Pico's frame, away from its buttons, or from the phone's bar
async function dragSignerBy(dx, dy) {
  const d = SIGNER === "pico" ? await inSigner(".device") : await rect("#phone-bar");
  const x = SIGNER === "pico" ? d.x + d.w * .7 : d.x + d.w / 2, y = SIGNER === "pico" ? d.y + 15 : d.y + d.h / 2;
  await moveTo(x, y);
  await showPointer(x, y, true); await page.mouse.down();
  await moveTo(x + dx, y + dy, { steps: 45, down: true });
  await page.mouse.up(); await showPointer(x + dx, y + dy, false);
}
async function aimSignerAt(selector) {
  const [tx, ty] = center(await rect("#beam-target")), [qx, qy] = center(await rect(selector));
  await dragSignerBy(qx - tx, qy - ty);
}
async function moveSignerTo(x, y) {
  const h = await rect("#hww-window");
  await dragSignerBy(x - h.x, y - h.y);
}
async function tapPhone(locator, pause = 1500) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await clickAt(b.x + b.width / 2, b.y + b.height / 2);
  await wait(pause);
}

await page.goto(SIGNER === "pico" ? BASE : `${BASE}?signer=bit-hanko`);
await (SIGNER === "pico" ? signer.locator(".device canvas") : signer.getByText("Scan your backup QR")).waitFor();
await page.waitForFunction(() => /[1-9]/.test(document.getElementById("wallet-balance")?.textContent ?? ""), null, { timeout: 30000 });
await caption(`A signet-only trial: a watch-only wallet and ${SIGNER === "pico" ? "a Pico signer" : "BitHanko on a phone"}, linked only by QR codes`);
await wait(3500);
await page.evaluate(() => scrollTo({ top: 300, behavior: "smooth" }));
await wait(1500);

if (SIGNER === "pico") {
  await caption("1. On the signer, choose “Scan SeedQR”");
  await wait(1500);
  await key(4, 800);
} else {
  await caption("1. In BitHanko, tap “Scan your backup QR”");
  await wait(1000);
  await tapPhone(signer.getByText("Scan your backup QR"), 800);
}
await caption(`Move the ${SIGNER === "pico" ? "signer" : "phone"} so its camera sees the public test SeedQR`);
await aimSignerAt("#seed-qr");
await wait(2500);
if (SIGNER === "bit-hanko") {
  await moveSignerTo(780, 380); await wait(500);
  await caption("Compare the fingerprint, then open the wallet");
  await tapPhone(signer.getByText("Open the wallet"));
}
await caption("The key is loaded on the signer. The wallet only knows the public side");
await wait(3500);

await caption("2. In the wallet, create the transaction");
await click(rect("#wallet-next-compose")); await wait(1500);
await click(rect("#create")); await wait(2500);
await caption("The unsigned transaction (PSBT) becomes an animated QR");
await wait(3000);

if (SIGNER === "pico") {
  await caption("3. Choose “Scan PSBT” and point the signer at the QR");
  await key(4, 800);
  await aimSignerAt("#qr");
  await wait(3500);
  await caption("Check the amount, the fee, the recipient and the change on the signer’s own screen");
  await key(4, 2600); await key(4, 2600); await key(4, 2600);
  await caption("Approve with SIGN");
  await key(3, 1000); await key(4, 2500);
} else {
  await caption("3. Tap “Sign a transaction” and point the phone at the QR");
  await tapPhone(signer.getByText("Sign a transaction"), 800);
  await aimSignerAt("#qr");
  await wait(3000);
  await moveSignerTo(780, 380); await wait(500);
  await caption("Check the amount, the fee, the recipient and the change on the phone");
  const h = await rect("#hww-window");
  await moveTo(h.x + h.w / 2, h.y + 500);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 120); await wait(350); }
  await caption("Tick each output after checking it, then sign");
  for (const box of await signer.locator(".check input").all()) await tapPhone(box, 600);
  await tapPhone(signer.getByRole("button", { name: "Sign transaction" }), 1200);
  await tapPhone(signer.locator("#confirm-sign"), 2000);
}
await caption("The signer shows the signed transaction as a QR");
await wait(2500);

await caption("4. Scan the signed QR with the wallet camera");
if (SIGNER === "pico") {
  await dragSignerBy(420, 0); await wait(600);
  await click(rect("#open-signed-scan")); await wait(1500);
  const [lx, ly] = center(await inSigner(".device canvas")), [cx, cy] = center(await rect("#wallet-camera-frame"));
  await dragSignerBy(cx - lx, cy - ly);
} else {
  await wait(1000);
  await click(rect("#open-signed-scan"));
}
await page.waitForFunction(() => !document.getElementById("wallet-screen-broadcast").hidden, null, { timeout: 30000 });
await caption("The wallet received the signed transaction, ready to broadcast");
await wait(3000);

await caption("Only QR codes crossed the air gap. Try it yourself on this page");
await wait(4000);

const video = page.video();
await context.close();
await browser.close();
mkdirSync("out", { recursive: true });
renameSync(await video.path(), `out/walkthrough-${SIGNER}.webm`);
