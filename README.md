# Bach Bench Site

Bach Bench gives AI models the same instruction to compose an original
15-second instrumental with a visual that moves to it. Each published Piece
can be played and compared using measurements of the recording. Listeners
judge the music.

## Three repositories

| Part | Responsibility |
| --- | --- |
| [Workshop](https://github.com/wlkr-si/bach-workshop) (private) | Runs models, records and checks Pieces, keeps private run records. |
| [Vault](https://github.com/wlkr-si/bach-vault) | Holds the permanent record and original media and publishes the active index. |
| Site (this repository) | Displays and plays the Vault catalogue at [bach.wlkr.si](https://bach.wlkr.si). |

**A feature.** Open an issue and a Site pull request. Use Node 24 or later,
`npm ci`, `npm run dev` and `npm run check`. After checks and merge,
GitHub Actions deploys the Site Worker and verifies its commit at
`https://bach.wlkr.si/build-info.json`. The deployment reads the
`PRODUCTION_URL` repository variable and worker-scoped credentials.

**A Piece.** Run `node bench/add.mjs "<model>" --effort high` in the Workshop.
The Vault checks the resulting PR and republishes its index after merge.
The Worker reads the index at request time. The Site picks up the Piece
automatically as the 60-second cache refreshes.

The production route serves the Site Worker. The original custom-domain
Worker still serves old shared assets and the Results alias, and removing
the production route restores the previous Site. Keep those shared addresses
available when changing the routing.

To review a Workshop staging lane on the
[preview hostname](https://bach-bench-site.walkerworlddiscord.workers.dev/gallery),
open `/gallery?vault=staging&lane=<lane>`. That choice follows links in the
browser for 30 minutes. `/gallery?vault=live` clears it. Production always
reads the live Vault index.

See [LICENSE](LICENSE) and the [third-party and brand notices](public/THIRD_PARTY_NOTICES.md).

## Share images

The Site job checks both the live index and the optional
`staging/site-98/index.json` fixture index every ten minutes. A merge touching
the drawing inputs also starts it. The [0o10 clock](ops/share-image-clock)
checks those same indexes independently and starts the main workflow when
a publication is behind, using a Site-only GitHub App. If either the index revision or the
drawing fingerprint changes, it renders that field's cards and chart PNGs
using the Site's existing drawing code. The job runs from main and publishes
under `derived/images/live/` or `derived/images/staging/site-98/` only.
The URLs use stable object keys with a 60-second cache, so repeated builds
replace derived images without accumulating a copy for every revision.
On the preview, add `?vault=staging-images` to open a page against the fixture.
The job writes the manifest last. The Site matches it to the current Vault
revision and falls back to the poster or a locally drawn card when needed.
Chart PNG and SVG downloads still export the chart's current on-screen view.
