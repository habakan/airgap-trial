.DEFAULT_GOAL := dist
PICO := vendor/bitwasm-signer-pico
HANKO := vendor/bit-hanko
CARGO_HOME ?= $(HOME)/.cargo

.PHONY: dist pico hanko check-paths clean

pico:
	git -C $(PICO) submodule update --init components/parts
	[ -d $(PICO)/third_party/secp256k1 ] || $(MAKE) -C $(PICO) deps-host
	cd $(PICO) && ./tools/build/toolchain.sh
	$(MAKE) -C $(PICO) check-repro
	RUSTFLAGS="--remap-path-prefix=$(CARGO_HOME)=/cargo" $(MAKE) -C $(PICO) web TESTNET=1 TEST_SEED=1

hanko:
	cd $(HANKO) && pnpm install --frozen-lockfile && pnpm build:web

dist: pico
	rm -rf dist && mkdir dist
	W=$(PICO)/build/web-signet; for f in signer.html send_support.js send_support.wasm parser.mjs parser.wasm \
	  jsQR.min.js jsQR-LICENSE.txt html2canvas.min.js html2canvas-LICENSE.txt; do cp $$W/$$f dist/; done
	S=$$(awk '$$2 == "build/parser.wasm" { print $$1 }' $(PICO)/checksums.txt); \
	  sed "s/^const PARSER_SHA256 = \".*\";/const PARSER_SHA256 = \"$$S\";/" site/index.html > dist/index.html
	touch dist/.nojekyll
	$(MAKE) check-paths

# Rust and C builds can embed the builder's home directory, and everything in dist is published
check-paths:
	@if grep -rlaE '/Users/[a-zA-Z]|$(HOME)/' dist; then echo "a local path is in dist"; exit 1; fi

clean:
	rm -rf dist
