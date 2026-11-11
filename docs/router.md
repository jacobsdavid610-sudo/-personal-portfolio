# router.js

Matches URL paths against route patterns like `/users/:id` and
`/files/*path`, and builds paths back from a pattern and its parameters.
The most specific route wins, whatever order the routes were added in. No
dependencies.

## Why

Every small HTTP server ends up with a chain of `if (url.startsWith(...))`
checks, and the order of that chain quietly decides which handler runs:
put `/users/:id` above `/users/new` and "new" becomes a user id. I wanted
matching where the order routes are listed in doesn't matter, where two
routes that clash are an error when they're added instead of a surprise
in production, and where building a link can't produce a path the router
would read differently.

## API

```js
const { Router, build } = require("./scripts/router.js");

const r = new Router()
  .add("/users/:id", showUser)
  .add("/users/new", newUser)
  .add("/files/*path", serveFile);

r.match("/users/new");          // { pattern: "/users/new", value: newUser, params: {} }
r.match("/users/42?tab=x");     // { pattern: "/users/:id", value: showUser, params: { id: "42" } }
r.match("/files/a/b%20c.txt");  // { ..., params: { path: "a/b c.txt" } }
r.match("/nope");               // null

build("/users/:id", { id: "a b" });          // "/users/a%20b"
build("/files/*path", { path: "x/y z" });    // "/files/x/y%20z"
```

- `new Router()`, then `add(pattern, value)` (chainable; `value` defaults to
  the pattern) and `match(path)`. `size` is the number of routes.
- `build(pattern, params)` returns the encoded path.
- `parseRoutes(text, source)` makes a Router from routes-file text.
- `parsePattern(pattern)` checks a pattern and returns its parts.

Patterns:

- `/about`: static segments, matched exactly (case-sensitive).
- `/users/:id`: a parameter, one non-empty segment.
- `/files/*path`: a wildcard, one or more segments to the end, joined
  with `/`. Only allowed as the last segment.
- Names are `[A-Za-z_][A-Za-z0-9_]*`. A `:` or `*` anywhere but the start of
  a segment is plain text.

## CLI usage

```
router.js ROUTES_FILE PATH...
```

ROUTES_FILE has one route per line: a pattern and an optional name. Blank
lines and `#` comments are ignored. Each PATH gets one line of JSON.

From Git Bash on Windows, set `MSYS_NO_PATHCONV=1`, otherwise arguments
like `/users/new` are rewritten into Windows paths before node sees them.

## Real example

```
$ cat ex.routes
# app routes
/                     home
/users/new            user-new
/users/:id            user-show
/users/:id/edit       user-edit
/static/*path         assets

$ node scripts/router.js ex.routes /users/new /users/42 /users/new/edit \
    "/users/J%C3%BCrgen?tab=posts" /static/css/site.css /admin
{"path":"/users/new","route":"/users/new","name":"user-new","params":{}}
{"path":"/users/42","route":"/users/:id","name":"user-show","params":{"id":"42"}}
{"path":"/users/new/edit","route":"/users/:id/edit","name":"user-edit","params":{"id":"new"}}
{"path":"/users/J%C3%BCrgen?tab=posts","route":"/users/:id","name":"user-show","params":{"id":"Jürgen"}}
{"path":"/static/css/site.css","route":"/static/*path","name":"assets","params":{"path":"css/site.css"}}
{"path":"/admin","route":null}
$ echo $?
1
```

`/users/new/edit` shows the fallback: the static `new` branch has no `edit`
under it, so the router backs out and tries `:id`.

A clash is reported with the line:

```
$ cat bad.routes
/users/:id
/users/:name/posts
$ node scripts/router.js bad.routes /x
router: bad.routes:2: :name in /users/:name/posts conflicts with :id after /users
```

## Exit codes

- `0` - every PATH matched a route.
- `1` - at least one PATH matched nothing (all of them are still printed).
- `2` - usage error, unreadable routes file, or a bad or clashing route.

## Design notes

- **Specificity, segment by segment.** Routes live in a tree. At each
  segment a static child is tried first, then the parameter, then the
  wildcard. The leftmost segment decides: with `/:a/static` and
  `/fixed/:b`, the path `/fixed/static` goes to `/fixed/:b`.
- **Backtracking.** If the more specific branch leads nowhere, the search
  backs out and tries the next one, dropping any parameters it picked up on
  the way. Search depth is bounded by the longest route, so a path with
  50,000 segments is fine.
- **Clashes are errors.** Two patterns that match exactly the same paths
  (`/a` and `/a/`, `/f/*a` and `/f/*b`) are rejected, and so are parameters
  with different names in the same place (`/u/:id` and `/u/:name/posts`),
  because one of the two names would silently never be filled in.
- **Split first, decode second.** The path is split on `/` and each segment
  is then percent-decoded, so `%2F` stays inside its parameter: `/users/a%2Fb`
  gives `name = "a/b"`. Static pattern segments are decoded too, so
  `/caf%C3%A9` and `/café` are the same route. A wildcard joins its
  segments with `/`, so there `a%2Fb` and `a/b` come out the same.
- **Malformed input is no match, not an exception.** Bad percent-encoding,
  empty segments (`/a//b`) and relative paths all return `null`, so a
  hostile URL becomes a 404 and never a 500. One trailing slash is ignored;
  the query string and fragment are dropped.
- **`build` is the inverse of `match`.** Values are encoded with
  `encodeURIComponent` (wildcards per segment), and a test checks that
  `match(build(p, params)).params` gives `params` back, including `?`, `#`,
  `%` and non-ASCII. Empty values are refused because the path they'd make
  can't match.
- **`__proto__` is just a name.** Params are built with `Object.fromEntries`,
  so a parameter called `__proto__` becomes an own property instead of
  changing the object's prototype.

## Running the tests

```
node --test tests/test_router.js
```

30 tests: static, parameter and wildcard matching, precedence in every
add order, backtracking (including dropping stale parameters), trailing
slashes, empty segments, query strings, percent-decoding and bad encoding,
`__proto__`, very long paths, duplicate and clashing routes, bad patterns,
`build` and the `build`/`match` round trip, the routes file format, and
the CLI including exit codes.
