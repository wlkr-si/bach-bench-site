# Bach Bench Site

Bach Bench gives AI models the same instruction to compose an original
15-second instrumental with a visual that moves to it. Each published Piece
can be played and compared using measurements of the recording. Listeners
judge the music.

The private Workshop runs models and records and checks their output. The
public Vault keeps the published Pieces and provides an index. The Site
presents that catalogue. The Worker reads the public version 1 index on each
catalogue request. Vault caching lasts 60 seconds. Piece analytics read detail
from the same revision. The chart renderer reads those details directly from
the Vault, and the Site build contains no Piece data.

On the preview hostname, open `/gallery?vault=staging` to use the fixed
`staging/site-96/index.json` object on the Vault. That selection follows links
for 30 minutes in the same browser. Open `/gallery?vault=live` to clear it.
The Worker uses the live index on every other hostname.

Use Node 24 or later, run `npm ci`, then `npm run dev` to work locally. Run
`npm run check` before opening a pull request. GitHub Actions checks pull
requests and deploys merges to the Cloudflare preview. Deployment reads
`PREVIEW_URL` from repository variables and uses `CLOUDFLARE_ACCOUNT_ID`
and a Cloudflare Individual Workers Editor token from repository secrets.
The token is scoped to the existing `bach-bench-site` Worker.

See [LICENSE](LICENSE) and the [third-party and brand notices](public/THIRD_PARTY_NOTICES.md).

## Share images

The Site job checks both the live index and the optional
`staging/site-98/index.json` fixture index every ten minutes. A merge touching
the drawing inputs also starts it. If either the index revision or the
drawing fingerprint changes, it renders that field's cards and chart PNGs
using the Site's existing drawing code. The job runs from main and publishes
under `derived/images/live/` or `derived/images/staging/site-98/` only.
The URLs use stable object keys with a 60-second cache, so repeated builds
replace derived images without accumulating a copy for every revision.
On the preview, add `?vault=staging-images` to open a page against the fixture.
The job writes the manifest last. The Site matches it to the current Vault
revision and falls back to the poster or a locally drawn card when needed.
Chart PNG and SVG downloads still export the chart's current on-screen view.
