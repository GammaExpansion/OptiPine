# Build-time license supplements

`scripts/licenses.ts` collects the installed web workspace's production dependencies, including
transitive dependencies and installed peers, without dev dependencies. It emits the app's MIT
license, full font licenses, the chart license and notice, and a combined third-party notice into
`dist/licenses/`. Versions come from installed manifests. These files are also available in dev
and preview; the production server serves them as UTF-8 plain text. No network access is needed
at build time.

The dialog's copy follows PR #43's `THIRD_PARTY_NOTICES.md`. Its catalogs load with the dialog.
The generated notices are independent of that document, which also covers repository test data
and tools that are not shipped with the app.

Three upstream npm releases omit license or notice files, and one notice covers code copied
rather than installed. The adjacent `.txt` files preserve the upstream texts verbatim:

- `lightweight-charts-NOTICE.txt`: Lightweight Charts 5.2.1,
  <https://github.com/tradingview/lightweight-charts/blob/v5.2.1/NOTICE>.
- `fancy-canvas-LICENSE.txt`: fancy-canvas 2.1.0,
  <https://github.com/tradingview/fancy-canvas/blob/7ece7601f05b624496f485cee65789ad691427df/LICENSE>.
- `react-remove-scroll-bar-LICENSE.txt`: react-remove-scroll-bar 2.3.8 declares MIT but omits
  its text. Upstream subsequently added this license (including its original 2025 copyright)
  in <https://github.com/theKashey/react-remove-scroll-bar/blob/7301c160fda44cb8cf2b9fdfde61efad35736196/LICENSE>.

- `octicons-LICENSE.txt`: the header's GitHub mark copies the `mark-github-16` path of
  `@primer/octicons` 19.15.1 into `src/components/Icon.tsx`; this is that release's MIT license,
  <https://unpkg.com/@primer/octicons@19.15.1/LICENSE>.

Supplements apply only to the listed versions. Review them when upgrading; new packages without
license texts fail the build. Font files retain the licenses distributed by Fontsource; the
dialog and combined notices also retain the font author credits from PR #43.
