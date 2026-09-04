/**
 * Holds the e2e suite to its shared helpers.
 *
 * Two things are checked, and both are the same defect seen from either end:
 * a spec that spells out a sequence the suite already owns.
 *
 * 1. **The visible-page selector.** `ion-router-outlet > .ion-page:not(...)`
 *    is the suite's answer to "assert what is rendered, never the URL", and
 *    it was written out fifteen times under three different names. A copy is
 *    not wrong on the day it is made — it is wrong on the day the selector
 *    has to change, because nothing points at the fourteen that did not.
 * 2. **A helper the suite already exports.** `fillIonic` existed seven times,
 *    `tripWithRows` three, `createItem` four. The copies had already drifted
 *    in their settle steps, which is the drift that costs a flake and names
 *    no cause.
 *
 * 3. **A helper renamed.** The name list above is only as good as the names,
 *    and the copies that mattered were called something else: five functions
 *    re-implemented `createItem` under four names, and two of them had drifted
 *    exactly where the log said copies drift — the *settle* step. One of those
 *    two failed the first run made with `retries: 0` (T-8), on WebKit, as
 *    "the tag chip never appeared": the editor had not finished opening, the
 *    raw `.fill()` asserted nothing, and the tag name landed in the *name*
 *    field. So the third rule is by shape rather than by name — a spec-local
 *    function that clicks a routine's opening control **and** fills its first
 *    field is that routine, whatever it is called.
 *
 * All three are allowed inside `client/e2e/helpers/` and `client/e2e/fixtures.ts`,
 * which is where the one copy lives.
 *
 * Node built-ins only, so it needs no install; wired into `make ci` and the
 * CI client job beside the other node gates.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/* Run from the repository root (`make ci`) or from `client/` (CI job). */
const root = resolve(process.cwd().endsWith("client") ? ".." : ".");
const E2E = resolve(root, "client/e2e");

/** The selector that says which page is painted. It lives in `visiblePage`. */
const VISIBLE_PAGE_SELECTOR =
  "ion-router-outlet > .ion-page:not(.ion-page-hidden)";

/**
 * Helpers a spec must import rather than re-declare. Each is exported from
 * `client/e2e/helpers/`; the gate matches a *declaration*, so calling one is
 * always fine.
 */
const SHARED_HELPERS = [
  "fillIonic",
  "tripWithRows",
  "startTrip",
  "packRow",
  "openRowMenu",
  "chooseInRowMenu",
  "assignTraveler",
  "createItem",
  "backToInventory",
];

/** Where the one copy of each of the above is allowed to live. */
function isHome(file) {
  const rel = relative(E2E, file);
  return rel === "fixtures.ts" || rel.startsWith("helpers/");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/**
 * A routine a spec must not re-declare under another name, identified by the
 * two controls it cannot avoid: the one that opens it and the one it fills
 * first. Both have to appear in the same function body — a test that merely
 * opens the editor is doing something else, and there are a dozen of those.
 */
const ROUTINES = [
  {
    helper: "createItem",
    opens: "m9-fab",
    fills: "m10-name",
  },
];

/** The body of `async function name(` starting at `from`, by brace matching. */
function functionBody(source, from) {
  const open = source.indexOf("{", from);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

const declaration = new RegExp(
  `(?:function|const)\\s+(${SHARED_HELPERS.join("|")})\\b\\s*[(=]`,
  "g",
);

const findings = [];
for (const file of walk(E2E)) {
  if (isHome(file)) continue;
  const source = readFileSync(file, "utf8");
  const where = relative(root, file);

  source.split("\n").forEach((line, i) => {
    if (line.includes(VISIBLE_PAGE_SELECTOR)) {
      findings.push(
        `${where}:${i + 1}: the visible-page selector — import \`visiblePage\``,
      );
    }
  });

  for (const hit of source.matchAll(declaration)) {
    const line = source.slice(0, hit.index).split("\n").length;
    findings.push(
      `${where}:${line}: \`${hit[1]}\` is declared again — import it from e2e/helpers`,
    );
  }

  for (const hit of source.matchAll(/\basync function (\w+)\s*\(/g)) {
    const body = functionBody(source, hit.index);
    for (const routine of ROUTINES) {
      if (!body.includes(routine.opens) || !body.includes(routine.fills)) continue;
      const line = source.slice(0, hit.index).split("\n").length;
      findings.push(
        `${where}:${line}: \`${hit[1]}\` opens ${routine.opens} and fills ${routine.fills} — ` +
          `that is \`${routine.helper}\` under another name; import it`,
      );
    }
  }
}

if (findings.length > 0) {
  console.error(
    "e2e helpers gate: a spec re-declares what the suite already owns\n",
  );
  for (const f of findings) console.error(`  ${f}`);
  console.error(
    "\nThe shared copies live in client/e2e/helpers/ and client/e2e/fixtures.ts.",
  );
  process.exit(1);
}
