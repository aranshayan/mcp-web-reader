# Security policy

## Supported versions

Only the latest released version receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability** (https://github.com/aranshayan/mcp-web-reader/security/advisories/new). Include what you found, steps to reproduce, and the version affected.

You can expect an acknowledgement within a few days. Once a fix is released, the advisory is published and you are credited if you wish.

## What counts as a vulnerability here

- SSRF: reaching private, loopback, link-local or cloud-metadata addresses (including via redirects, DNS rebinding or IPv6 forms)
- Ignoring `robots.txt`, size, time or content-type limits
- Leaking local data to remote servers

Behaviour that is already documented as a limitation in the README is not a vulnerability, but improvements are welcome as regular issues.
