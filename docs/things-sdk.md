# The Acre SDK

Build custom things for Acre: small web pages that run on people’s cards.

## Community submissions

Publish from Build and enable Listed in the marketplace to share a thing under your own account. For source contributions and review, open a pull request at https://github.com/Fais649/acre-things. The repository includes an example, package checks and a publishing script. A merge does not publish or alter anyone’s installed things.

## Battleship games

Declare game: "battleship" in your manifest. acre.game calls the server from a placed board owned by the player. Actions: state, friends, invite ({ friend: userId }), place ({ fleet: five arrays of cell numbers }), fire ({ cell: 0..99 }), and resign. Fleet lengths are 5, 4, 3, 3 and 2; every ship is straight and contiguous. Invitations go to a friend’s inbox; acceptance places their private board on their own space. State includes only your fleet, incoming shots, your shots, sunk enemy ships, status, opponent, ready, opponentReady, myTurn and won. The server locks moves and keeps all unsunk enemy cells private. Pause refreshes when acre.active is false. Previews cannot call the game server.

```js
const state = await acre.game('state')
await acre.game('invite', { friend: friendId })
await acre.game('place', { fleet: [[0,1,2,3,4],[20,21,22,23],[40,41,42],[60,61,62],[80,81]] })
await acre.game('fire', { cell: 13 })
```

## What a thing is

A thing is a small web page that runs on someone’s card. Write it as body content: HTML, with any <style> and <script> you like, inline. It lays out at the size it’s shown, so CSS pixels are screen points. The global `acre` object is how it talks to Acre.

## What it can’t do

Nothing leaves the page. There’s no network (no fetch, no remote images, fonts or scripts), no frames, forms or navigation. Images and media have to be data: or blob: URLs. A thing can’t track who looks at it; whatever it needs goes through the SDK, and the database decides who may read and write what. Links open through acre.open, which always asks first.

## Who and where

These are set before your code runs, and kept current.

```js
acre.me      // { id, handle, name, isOwner }  whoever is looking
acre.owner   // { id, handle, name }           whose card it's on
acre.config  // the owner's settings (see Settings)
acre.mode    // 'view', 'edit' (the owner is arranging), or 'preview'
acre.size    // { width, height } in points
acre.item    // this placed thing's id
acre.thing   // { id, name, version }
```

## Entries: your thing’s data

Each person keeps their own small values on a placed thing, one per key (JSON, up to 8 KB; up to 64 keys per person). You only ever write your own, so nobody can overwrite anyone else: a poll counts everyone’s own vote, a guestbook shows everyone’s own line. Entries are public to everyone who can see the thing, unless you set them private, which only you can read. The owner’s public entries are the thing’s shared state: acre.shared reads them.

```js
await acre.set('vote', 2)                     // your entry
await acre.set('draft', text, { private: true })  // only you can read this
await acre.get('vote')                        // yours, or null
await acre.all('vote')                        // everyone's public entries:
//   [{ user: { id, handle, name }, value, at, private }]
await acre.shared('status')                   // the owner's entry, or null
await acre.remove('vote')                     // take yours back
```

## Live

Anyone’s entry changing, the owner changing settings, and the thing being resized all arrive as events.

```js
const stop = acre.on('change', ({ key, user }) => draw())
acre.on('config', (config) => draw())
acre.on('resize', ({ width, height }) => layout())
acre.on('mode', (mode) => …)
stop()  // every acre.on returns a function that stops it
```

## Settings

Declare settings in your thing’s manifest and Acre builds the form: the owner fills it in from their arrange bar, and the values arrive as acre.config. Types are text, number, toggle, choice and color.

```js
{
  "size": { "w": 560, "h": 620 },
  "settings": [
    { "key": "question", "label": "Question", "type": "text", "default": "Pizza or tacos?" },
    { "key": "limit", "label": "Max votes", "type": "number", "default": 1, "min": 1, "max": 10 },
    { "key": "anonymous", "label": "Hide names", "type": "toggle", "default": false },
    { "key": "style", "label": "Style", "type": "choice", "options": ["Bars", "Pie"], "default": "Bars" },
    { "key": "accent", "label": "Accent", "type": "color", "default": "#FFE14D" }
  ]
}
```

## Sources: your owner’s own services

A thing can read a service of its owner’s choosing (their task list, say) and, for the owner, act on it. Declare each source in the manifest: its reads (GET, a fixed path and query) and actions (a method and a path, where the only thing your page fills in is a {placeholder} of letters, digits, - and _). When they place it, the owner gives each source a base URL and a token in its settings. Those stay on Acre’s server: your code is public, so it never sees either, and the server only ever makes the requests you declared, to the owner’s base URL, over https, never to a private or local address, never following a redirect, with nothing of the page’s but its placeholders and, for an action that declares one, its body. An action (not a DELETE) may declare a body: its fields, each a string (max length, counted in characters, up to 2000; an enum; or format "date" or "datetime"), number (min, max, integer), boolean, or an object of those, any of them nullable; up to 16 fields a level, one level deep. The server sends only the declared fields, checked, as JSON; a field that doesn’t fit is refused with "bad-body", and fields you didn’t declare are dropped and named back in "dropped". A read or action may carry an "about" (up to 80 characters), shown to the owner beside the request. Anyone who can see the thing can read; one answer is shared by all of them for a minute (a failure for 15 seconds). Only the owner can act, from their own card; acting clears that source’s answers, so the next read is fresh. If a new version of yours asks for different requests, each owner approves them in settings before they work. Names are lowercase letters, digits and _; up to 4 sources, 16 reads and 16 actions each; paths up to 300 characters, without "//", ".." or encoded dots and slashes; auth is "bearer" (the default), "none" or { "header": "X-Api-Key" }; answers up to 1 MB. In a preview, sources answer with code "preview".

```js
// manifest
"sources": {
  "tasks": {
    "label": "Tasks",
    "url": "https://tasks.example.com",
    "auth": "bearer",
    "reads": { "open": { "path": "/v1/tasks", "query": { "limit": "100" } } },
    "actions": {
      "done": { "method": "POST", "path": "/v1/tasks/{id}/complete" },
      "move": { "method": "PATCH", "path": "/v1/tasks/{id}", "about": "move a task",
                "body": { "status": { "type": "string", "enum": ["next", "waiting"] },
                          "due": { "type": "string", "format": "date", "nullable": true } } }
    }
  }
}

// your code
const tasks = acre.source('tasks')
const { data, at, cached } = await tasks.read('open')   // anyone who can see it
await tasks.act('done', { id: task.id })                // its owner only
await tasks.act('move', { id: task.id }, { status: 'waiting', due: null })   // a declared body
// a refusal rejects with error.code (and error.status, the service's own):
//   'not-set-up'  'needs-approval'  'owner-only'  'not-visible'  'preview'
//   'upstream'  'timeout'  'too-big'  'redirect-refused'  'refused-address'  'busy'  'bad-body'
```

## Everything else

A few things only the app can do.

```js
acre.open('https://example.com')  // asks first; https only
acre.haptic('light' | 'medium' | 'heavy' | 'selection' | 'success')
acre.toast('Saved')                // a moment's note over the thing
acre.expand()                      // the same thing, full screen: only right after a tap on it
acre.expanded                      // true when it's the full-screen one
```

## Versions and sharing

Your draft is yours alone until you publish it. Publishing makes a numbered version that never changes; placed things stay on their version until their owner updates, so a change of yours never breaks someone else’s card. Turn on “Listed” to show it in the marketplace; unlisted things can still be added by anyone who opens them.
