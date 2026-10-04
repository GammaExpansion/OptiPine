# Security policy

## Supported versions

OptiPine has no releases yet. Security fixes go to the `main` branch.

## Reporting a vulnerability

Please report a vulnerability privately, not in a public issue or pull request. Use GitHub's
private reporting: open the repository's **Security** tab and choose **Report a vulnerability**,
or go to <https://github.com/GammaExpansion/OptiPine/security/advisories/new>.

Include what is affected, how to reproduce it (a script, a request or a file, as small as you can
make it), and what an attacker could do with it. We will acknowledge the report, keep you informed
while we fix it, and credit you in the advisory unless you prefer otherwise.

## What is in scope

- **The market data proxy**: `@pine/market-data`'s request validation and the Node servers that
  host it (`apps/web/server` and the Vite dev and preview servers), for example a request that
  reaches a host or path other than the providers' APIs.
- **The production server's static files**: reading anything outside `apps/web/dist`.
- **Untrusted input in the browser app**: a Pine script, a CSV file or a calendar or profile file
  that runs code or reads data it should not. Scripts are interpreted by the engine in Web Workers
  and are never evaluated as JavaScript.

A script that is slow or never finishes is not a vulnerability: the user can cancel any run. Bugs
in computed results belong in a regular issue.
