# Airgap trial

Try an air-gapped Bitcoin transaction in the browser, on signet, with a public test seed. Never use it for coins with value.

The page is a demo wallet with a signer beside it. The two exchange the transaction only as QR codes.

## Layout

| Path | What it is |
|---|---|
| `site/index.html` | The trial page |
| `vendor/bitwasm-signer-pico` | Firmware built for the browser, embedded as the signer |
| `vendor/bit-hanko` | BitHanko, built by `make hanko`. Not connected to the trial page and not in `dist` yet |

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

## Hosting

Publish this from an origin that does not also serve a signer holding real seeds. Pages under one `github.io` account share an origin, and so share browser storage.

## License

MIT. See `LICENSE`. Third-party files in `dist` keep their own licenses, which are published next to them.
