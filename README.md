# Airgap trial

Try an air-gapped Bitcoin transaction in the browser, on signet, with a public test seed. Never use it for coins with value.

The page is a demo wallet with a signer beside it, either Pico or BitHanko. The two exchange the transaction only as QR codes. The BitHanko demo itself is not modified: the page answers its camera request with whatever part of the wallet's QR is inside the phone's aiming frame, and decodes the signed QR it displays.

## Layout

| Path | What it is |
|---|---|
| `site/index.html` | The trial page |
| `vendor/bitwasm-signer-pico` | Firmware built for the browser, embedded as the signer |
| `vendor/bit-hanko` | The BitHanko testnet demo, embedded as the other signer |

Only testnet builds belong in `dist`. The installable BitHanko web app stays out, because it holds real seeds.

## Build

Needs Emscripten, Rust through rustup, CMake, Ninja, uv and pnpm.

```sh
git clone --recurse-submodules --shallow-submodules https://github.com/habakan/airgap-trial
cd airgap-trial
make
python3 -m http.server -d dist
```

The build fails if a local path ends up in `dist`.

## Walkthrough video

`walkthrough/record.mjs` drives the trial with the Pico or BitHanko signer in headless Chromium and records it, from loading the test SeedQR to scanning the signed transaction back into the wallet. It does not broadcast. Serve `dist` first, then:

```sh
cd walkthrough && pnpm install
CHROME=<path to a Chromium binary> node record.mjs pico http://localhost:8000/   # or bit-hanko
```

The video lands in `walkthrough/out/`. The run needs a confirmed UTXO on one of the test wallets.

## Hosting

Publish this from an origin that does not also serve a signer holding real seeds. Pages under one `github.io` account share an origin, and so share browser storage.

## License

MIT. See `LICENSE`. Third-party files in `dist` keep their own licenses, which are published next to them.
