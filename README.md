# FormFit

![tests](https://github.com/RahilSahu/formfit/actions/workflows/tests.yml/badge.svg)

**Make your photo, signature and documents fit the exact rules of online application forms, without uploading them anywhere.**

Live: **https://formfit-lilac.vercel.app**

## The problem

Every year, millions of applicants in India fill in exam, job and admission forms (SSC, UPSC, IBPS, SBI, railways, NTA) and get stopped at the final step by an upload rule:

- A phone photo is 2 to 5 MB. The form allows **20 to 50 KB**. One KB over and it is rejected.
- Most forms also set a **minimum**. A signature compressed to 7 KB fails a "10 to 20 KB" rule just as surely as an oversized one.
- The notice fixes **exact pixels** too: 200 x 230 px for a bank exam photo, 140 x 60 px for its signature.
- The file must be a real JPG; PNG and iPhone HEIC photos are refused.

The usual escapes are both bad. Cyber cafes charge for the resize and keep copies of photos, signatures and ID documents sitting on shared computers. Free compressor websites make you **upload your Aadhaar, marksheets and photographs to unknown servers** in exchange for a resize.

## What FormFit does differently

- **Fits the whole range, not just the ceiling.** It finds the highest JPEG quality under the maximum, then, if the file lands under the minimum, pads it with a JPEG comment segment to sit mid-range. The picture never changes; only the file weight does.
- **Exact pixels.** Center-crop and resize to the dimensions your notice specifies, with one-tap presets for common exams and a Custom mode for everything else.
- **Documents to PDF under a limit.** Photograph each page, get one PDF built to fit 200 KB, 300 KB, 500 KB or 1 MB portal limits.
- **Zero upload, verifiably.** Everything runs in the browser with the Canvas API. There is no server side at all, and this repository is the whole product: if you do not trust the claim, read the code, or run it yourself.
- **Works offline.** After the first visit the image tool is cached as a PWA and works with no connection, which matters in exactly the places cyber cafes do.

## Use it

Open the live link, pick Photo / Signature or Documents to PDF, choose a preset or type the numbers from your notice, download. No account, no ads, no watermark.

Presets reflect specs commonly published in recent notices (SSC signature 10 to 20 KB; IBPS/SBI photo 200 x 230 px at 20 to 50 KB and signature 140 x 60 px at 10 to 20 KB; UPSC 20 to 300 KB; NTA photo 10 to 200 KB). Notices change between cycles: always check your own notice and use Custom when it differs.

## How the fitting works

`fit.mjs` holds the core, independent of the browser:

1. `bestAtScale` binary-searches JPEG quality (the encoder is injected: canvas in the browser, a fake in tests) for the largest output under the max.
2. If even the lowest quality is too heavy, the image is downscaled in steps and the search repeats.
3. If the winner is under the minimum, `padJpeg` inserts JPEG COM segments (legal, ignored by viewers and validators) to reach mid-range exactly. Unit tests verify the padded file byte-for-byte: SOI preserved, COM marker after it, original tail intact, exact target length.

## Run and test locally

```bash
node --test tests/        # 8 tests, no dependencies
python3 -m http.server    # then open http://localhost:8000
```

## Roadmap

- HEIC input decoding in the browser, for iPhone photos
- Signature background cleanup (paper shadow removal)
- Merging and re-fitting existing PDFs
- More presets as notices publish them (state boards, visas, university admissions)

## License

MIT. Built for every applicant who has ever watched a form reject their photo at the last step.
