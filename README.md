# Bach Bench Site

Bach Bench gives AI models the same instruction to compose an original
15-second instrumental with a visual that moves to it. Each published Piece
can be played and compared using measurements of the recording. Listeners
judge the music.

The private Workshop runs models and records and checks their output. The
public Vault keeps the published Pieces and provides an index. The Site
presents that catalogue. With the Vault connected, adding a Piece will
update the catalogue without a Site deployment.

The preview currently shows the Site with an empty catalogue. Use Node 24
or later, run `npm ci`, then `npm run dev` to work locally. Run
`npm run check` before opening a pull request. GitHub Actions checks pull
requests and deploys merges to the Cloudflare preview. The deploy reads
`PREVIEW_URL` from repository variables and uses `CLOUDFLARE_ACCOUNT_ID`
and a Cloudflare Individual Workers Editor token from repository secrets.
The token is scoped to the existing `bach-bench-site` Worker.

See [LICENSE](LICENSE) and the [third-party and brand notices](public/THIRD_PARTY_NOTICES.md).
