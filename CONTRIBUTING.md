# Contributing

Thanks for your interest! Bug reports, docs fixes and focused improvements are welcome.

## Before you start

- Read [`_studio/STUDIO.md`](_studio/STUDIO.md) (CLI and workflow) and [`_studio/STYLE.md`](_studio/STYLE.md) (house
  standard). The house rules there are deliberate product decisions. Please open an issue to discuss changing one
  before you send a PR.
- For anything larger than a small fix, open an issue first so we can agree on the approach.

## Development

```bash
npm run setup     # install the tool folders and the MCP server
npm run lint      # syntax-check every studio script
npm test          # mcp-openverse-audio test suite
```

Match the surrounding code: ES modules, no build step, short functions, comments only where the *why* isn't obvious.
Keep the studio free to run, so don't add new paid services or tools that need API keys.

## Pull requests

- Keep each PR to one change and explain what it changes and why.
- Never commit videos, renders, downloaded media, library assets, `.env` or `.mcp.json`. `.gitignore` covers these,
  so don't force-add them.
- Make sure `npm run lint` and `npm test` pass.

## Licence of contributions

By submitting a contribution you agree that it is licensed under the project's
[PolyForm Noncommercial License 1.0.0](LICENSE), and that the maintainer may also offer it under a separate
commercial licence. Contributions to `mcp-openverse-audio/` are licensed under MIT.
