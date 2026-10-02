# Acre community things

Small, self-contained things people can add to their own Acre spaces. Build and publish in Acre under your own account; share the source here for others to learn from and improve.

## Submit yours

1. Copy `things/hello` to `things/<your-slug>`.
2. Write `code.html` (body HTML, inline CSS and JavaScript) and `manifest.json`. Use `thing.json` for the title, description, icon, color, your Acre handle and source license. Include your published thing UUID as `id` if you have one.
3. Run `node scripts/validate.mjs` with Node 24 or newer.
4. Publish in Acre’s Build screen and enable **Listed in the marketplace**. Or run the local publisher below.
5. Open a pull request with a screenshot, what it does, how you tested it, and any declared source actions. Maintainers review source, behavior and attribution before merging.

A merge shares source; it does not automatically publish code, act as you, or update installed versions. You own publishing. GitHub is optional: you can publish directly from Acre without an account here.

## Publish from your computer

Set `ACRE_URL` to your Acre server’s https origin, `ACRE_ANON_KEY` to its public API key and `ACRE_ACCESS_TOKEN` to **your own signed-in access token** in your local environment. Never commit a token or paste it into a pull request or issue. Then run:

```sh
node scripts/publish.mjs things/<your-slug>
```

The publisher checks your signed-in handle against the declared author, creates or updates only your own draft, publishes an immutable version and lists it. Save the returned UUID as `id` in `thing.json` to update the same listing next time. People’s existing placed copies keep their pinned version. If publication is interrupted, check Build before retrying.

## SDK and sandbox

The `acre` object provides context, private/public entries, events, settings, full-screen expansion and declared sources. [SDK reference](docs/things-sdk.md). No direct network requests, remote images/scripts/fonts, forms or frames work. Inline assets as data URLs. Code is public: keep secrets in Acre’s source settings, never in HTML. Limits: code 200 KB, manifest 20 KB, each entry 8 KB.

`game: "battleship"` opts a thing into server-enforced Battleship. `acre.game` supports inviting an accepted friend, placing a standard fleet, firing in turn and resigning. The opponent accepts through Acre’s inbox; each player gets a private board on their own space. The server never gives a thing the opponent’s hidden fleet.

## Review and releases

PR checks only validate files; they do not execute submitted HTML or use publishing secrets. Test a thing in Acre’s sandbox before merging. Review network/source declarations, misleading prompts, excessive polling, attribution and licenses. Maintainers do not publish on behalf of contributors. Changes to `scripts/` and `.github/` need maintainer review. Report problems through issues.

The SDK validators are copied from Acre; when the SDK changes, update `scripts/manifest.ts`, `scripts/sources.ts` and the reference together.
