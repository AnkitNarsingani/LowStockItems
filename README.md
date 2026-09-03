# LowStockItems

To check stock items that are low in stock and don't have a PO against them,
and to raise the purchase order for them.

## Routes

| Route | Page |
|---|---|
| `/` | Low stock items table |
| `/po/new` | New Purchase Order page |

Routing uses `BrowserRouter`, so any host must rewrite unknown paths to
`index.html` — `netlify.toml` does this. A hash router is not an option: the
Zoho OAuth implicit grant already uses `window.location.hash` for the token.

## Local development

```
npm install
npm start
```

Requires these environment variables (a `.env.local` works for local runs):

```
REACT_APP_ZOHO_CLIENT_ID=
REACT_APP_ZOHO_REDIRECT_URI=
REACT_APP_ZOHO_ORG=
```

Zoho traffic goes through the existing Cloudflare Worker proxy; no key is
needed in the client.

## Deployment — Netlify

The app is hosted on Netlify (it was on GitHub Pages, which cannot run the
Netlify Functions the Lost Sale module needs).

- `netlify.toml` sets the build, the functions directory and the SPA rewrite.
- Set the three `REACT_APP_*` variables above in Netlify's environment settings.
- Add the Netlify URL to the allowed redirect URIs in the Zoho API console and
  point `REACT_APP_ZOHO_REDIRECT_URI` at it, or OAuth will fail on the domain.
- `package.json` no longer sets `homepage`, and the `gh-pages` deploy scripts
  have been removed — CRA's `/LowStockItems/` asset prefix breaks at a domain
  root.

## Specs

Behaviour is specified in [docs/](docs/):

- `LowStockItems-Algorithm-Spec.md` — the allocation and reorder engines.
- `LowStockItems-Build-Spec-Phase1-2.md` — the New PO page and Lost Sale module.

Quantity allocation methods 1 and 2 are pre-existing behaviour and are marked
**MUST PRESERVE**; methods 3–6 live in `src/lib/allocation.js`.
