# Share image clock

The systemd user timer on 0o10 checks the two public Vault revisions every
ten minutes. It dispatches the Site workflow on main if a manifest is
missing or behind and no image job is active. The GitHub workflow retains
its usual checks and performs all drawing and upload. Pushes that change
drawing inputs still start it directly.

The private organization GitHub App is installed only on bach-bench-site.
Its only writable permission is Actions. The clock requests a short-lived
installation token and never needs the R2 upload credential. Its private
key is backed up in My Passwords as GitHub App key (Bach Bench share image
clock). On 0o10 it belongs in the clock's private config directory with
mode 0600. The service loads it with systemd's LoadCredential. Keep the
application and installation IDs in app.env in the same directory.

Install the service and timer under ~/.config/systemd/user and the Python
file under ~/.local/lib/bach-bench-image-clock. Enable the timer and inspect
its journal to verify a scheduled invocation. Stop and disable the timer
to roll back the external clock. GitHub's native schedule and drawing
push trigger remain available.
