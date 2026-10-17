# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through GitHub:
**Security → Report a vulnerability** on this repository. Include steps to reproduce and the impact.

You can expect an acknowledgement within a week. Fixes are released on `main`.

## Scope

The studio runs locally and handles untrusted input in a few places: downloaded web pages (`studio article`,
`studio snip`), media fetched with yt-dlp, and third-party Lottie/SVG files. Reports about these paths are especially
welcome.

## Secrets

The studio needs no API keys for normal use. The optional TTS fallback reads `OPENROUTER_API_KEY` from `.env`, which is
git-ignored. If you think you have found a committed secret, report it as above.
