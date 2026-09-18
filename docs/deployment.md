# Production deployment

CubeTimer-web is a static Vite SPA. In production it is built with a public CubeSync URL baked into the bundle, then served over HTTPS (typically by Caddy on the same VPS as CubeSync).

## URLs (cubetimer.cc)

| Role | URL |
| --- | --- |
| Web app | `https://cubetimer.cc` |
| CubeSync API | `https://api.cubetimer.cc` |

CubeSync must allow the web origin:

```env
CLIENT_URL=https://cubetimer.cc
ALLOWED_ORIGINS=https://cubetimer.cc
PUBLIC_URL=https://api.cubetimer.cc
DOMAIN=api.cubetimer.cc
WEB_DOMAIN=cubetimer.cc
```

Build locally:

```bash
VITE_CUBESYNC_URL=https://api.cubetimer.cc npm run build
```

Publish `dist/` to the VPS static root (default `/var/www/cubetimer`), which Caddy mounts at `/srv/web`.

## GitHub Actions deploy

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs when you push a `v*` tag (same pattern as CubeSync).

### Repository variables

| Name | Example |
| --- | --- |
| `VITE_CUBESYNC_URL` | `https://api.cubetimer.cc` |
| `DEPLOY_PATH` | `/var/www/cubetimer` (optional; this is the default) |

### Repository secrets

| Name | Purpose |
| --- | --- |
| `DEPLOY_HOST` | VPS hostname or IP |
| `DEPLOY_USER` | SSH user that can write `DEPLOY_PATH` |
| `DEPLOY_SSH_KEY` | Private key for that user |

Create a deploy-only SSH key on the VPS, add the public key to `~/.ssh/authorized_keys`, and restrict that user to rsync into `/var/www/cubetimer` when possible.

Install `rsync` on the VPS (required by the deploy job):

```bash
sudo apt update && sudo apt install -y rsync
```

Ensure the static root is readable by the Caddy container (non-root):

```bash
sudo chmod -R a+rX /var/www/cubetimer
```

### First deploy checklist

1. CubeSync is healthy: `curl -fsS https://api.cubetimer.cc/health/ready`
2. Variables and secrets above are set
3. Create and push a version tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`)
4. Open `https://cubetimer.cc` and confirm sign-in / sync against the API

Authenticated API traffic is not cached by the service worker. See also [CubeSync deployment](https://github.com/Maciek-Hetman/cubesync/blob/main/docs/deployment.md).
