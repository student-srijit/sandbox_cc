// pow-worker.js
// This script runs in a background Web Worker thread to avoid blocking the main UI thread.
// It brute-forces a SHA-256 hash collision without the user realizing it's happening.

self.addEventListener('message', async (e) => {
    const { challenge, difficulty } = e.data;
    const targetPrefix = '0'.repeat(difficulty);
    let nonce = 0;

    // Web Crypto API is available in Workers, but we need a fast synchronous hasher
    // For a real production app, you'd compile a tiny WASM module. 
    // Here we use a micro pure-JS SHA-256 implementation to avoid async overhead.

    // Basic JS SHA-256 (Simplified for standalone worker execution)
    function sha256js(ascii) {
        function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }

        var mathPow = Math.pow;
        var maxWord = mathPow(2, 32);
        var lengthProperty = 'length';
        var i, j; // Used as a counter across the whole file
        var result = '';

        var words = [];
        var asciiBitLength = ascii[lengthProperty] * 8;

        var hash = sha256js.h = sha256js.h || [];
        var k = sha256js.k = sha256js.k || [];
        var primeCounter = k[lengthProperty];

        var isComposite = {};
        for (var candidate = 2; primeCounter < 64; candidate++) {
            if (!isComposite[candidate]) {
                for (i = 0; i < 313; i += candidate) {
                    isComposite[i] = candidate;
                }
                hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
                k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
            }
        }

        ascii += '\x80';
        while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
        for (i = 0; i < ascii[lengthProperty]; i++) {
            j = ascii.charCodeAt(i);
            if (j >> 8) return; // ASCII check
            words[i >> 2] |= j << ((3 - i) % 4) * 8;
        }
        words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
        words[words[lengthProperty]] = (asciiBitLength)

        for (j = 0; j < words[lengthProperty];) {
            var w = words.slice(j, j += 16);
            var oldHash = hash;
            hash = hash.slice(0, 8);

            for (i = 0; i < 64; i++) {
                var i2 = i + j;
                var w15 = w[i - 15], w2 = w[i - 2];

                var a = hash[0], e = hash[4];
                var temp1 = hash[7]
                    + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                    + ((e & hash[5]) ^ ((~e) & hash[6]))
                    + k[i]
                    + (w[i] = (i < 16) ? w[i] : (
                        w[i - 16]
                        + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                        + w[i - 7]
                        + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                    ) | 0
                    );
                var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                    + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

                hash = [(temp1 + temp2) | 0].concat(hash);
                hash[4] = (hash[4] + temp1) | 0;
            }

            for (i = 0; i < 8; i++) {
                hash[i] = (hash[i] + oldHash[i]) | 0;
            }
        }

        for (i = 0; i < 8; i++) {
            for (j = 3; j + 1; j--) {
                var b = (hash[i] >> (j * 8)) & 255;
                result += ((b < 16) ? 0 : '') + b.toString(16);
            }
        }
        return result;
    }

    // Brute force loop
    const maxTries = 5_000_000;
    while (nonce < maxTries) {
        const hash = sha256js(`${challenge}${nonce}`);
        if (hash.startsWith(targetPrefix)) {
            // Solved! Send nonce back to main thread
            self.postMessage({ nonce, hash });
            return;
        }
        nonce++;

        // Yield occasionally to prevent killing the worker
        if (nonce % 10000 === 0) {
            await new Promise(r => setTimeout(r, 0));
        }
    }

    self.postMessage({ error: 'Max iterations reached without collision' });
});
