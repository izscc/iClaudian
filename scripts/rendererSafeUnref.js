const UNSAFE_TIMER_UNREF_PATTERNS = [
  {
    name: 'claude-sdk-process-transport-close',
    pattern: /if \(\$ && !\$\.killed && \$\.exitCode === null\) setTimeout\(\(X\) => \{\s*if \(X\.killed \|\| X\.exitCode !== null\) return;\s*X\.kill\("SIGTERM"\), setTimeout\(\(J\) => \{\s*if \(J\.exitCode === null\) J\.kill\("SIGKILL"\);\s*\}, 5e3, X\)\.unref\(\);\s*\}, ([A-Za-z_$][A-Za-z0-9_$]*), \$\)\.unref\(\), \$\.once\("exit", (\(\) => (?:\{[^{}]*\}|[^;{}]+))\);/g,
    replacement:
      'if ($ && !$.killed && $.exitCode === null) {' +
      '\n      const processKillTimer = setTimeout((X) => {' +
      '\n        if (X.killed || X.exitCode !== null) return;' +
      '\n        X.kill("SIGTERM");' +
      '\n        const forceKillTimer = setTimeout((J) => {' +
      '\n          if (J.exitCode === null) J.kill("SIGKILL");' +
      '\n        }, 5e3, X);' +
      '\n        forceKillTimer.unref?.();' +
      '\n      }, $1, $);' +
      '\n      processKillTimer.unref?.();' +
      '\n      $.once("exit", $2);' +
      '\n    }',
  },
  {
    name: 'mcp-sdk-stdio-close-wait',
    pattern: /new Promise\(\((resolve\d+)\) => setTimeout\(\1, 2e3\)\.unref\(\)\)/g,
    replacement:
      'new Promise(($1) => {' +
      '\n        const closeTimeout = setTimeout($1, 2e3);' +
      '\n        closeTimeout.unref?.();' +
      '\n      })',
  },
];

const TIMER_CALL_PREFIXES = ['setTimeout(', 'setInterval('];

function patchRendererUnsafeUnrefSites(contents) {
  let nextContents = contents;
  const appliedPatches = [];

  for (const patch of UNSAFE_TIMER_UNREF_PATTERNS) {
    const matchCount = [...nextContents.matchAll(patch.pattern)].length;
    if (matchCount === 0) {
      continue;
    }
    nextContents = nextContents.replace(patch.pattern, patch.replacement);
    appliedPatches.push({ name: patch.name, count: matchCount });
  }

  // Generic fallback: rewrite any remaining `setTimeout(...).unref()` /
  // `setInterval(...).unref()` into optional-chained `.unref?.()`. This survives
  // SDK minifier variable renames (Node detaches the timer; in the Obsidian
  // renderer the timer id is a number and the call safely no-ops).
  const generic = patchTrailingTimerUnref(nextContents);
  if (generic.count > 0) {
    nextContents = generic.contents;
    appliedPatches.push({ name: 'generic-trailing-timer-unref', count: generic.count });
  }

  return {
    contents: nextContents,
    appliedPatches,
  };
}

function patchTrailingTimerUnref(contents) {
  const ranges = collectTimerUnrefRanges(contents);
  if (ranges.length === 0) {
    return { contents, count: 0 };
  }

  // Splice from the rightmost site first so earlier offsets stay valid; nested
  // outer/inner sites are collected out of positional order, so sort here.
  const ordered = [...ranges].sort((a, b) => b.unrefStart - a.unrefStart);
  let patched = contents;
  for (const { unrefStart, end } of ordered) {
    patched = `${patched.slice(0, unrefStart)}.unref?.()${patched.slice(end)}`;
  }

  return { contents: patched, count: ranges.length };
}

/**
 * Collect every `setTimeout(...).unref()` / `setInterval(...).unref()` site,
 * including timer calls nested inside another timer call's arguments. Returns
 * the ranges in ascending order.
 */
function collectTimerUnrefRanges(contents) {
  const ranges = [];
  let searchIndex = 0;

  while (searchIndex < contents.length) {
    const timerStart = findNextTimerCall(contents, searchIndex);
    if (!timerStart) {
      break;
    }

    const callEnd = findMatchingParen(contents, timerStart.openParenIndex);
    if (callEnd === -1) {
      searchIndex = timerStart.openParenIndex + 1;
      continue;
    }

    const unrefMatch = contents.slice(callEnd + 1).match(/^(\s*)\.unref\(\)/);
    if (unrefMatch) {
      ranges.push({
        start: timerStart.startIndex,
        unrefStart: callEnd + 1 + unrefMatch[1].length,
        end: callEnd + 1 + unrefMatch[0].length,
        snippet: contents.slice(timerStart.startIndex, callEnd + 1 + unrefMatch[0].length),
      });
    }

    // Advance into the arguments so nested timer calls are also scanned.
    searchIndex = timerStart.openParenIndex + 1;
  }

  return ranges;
}

function findUnsafeTimerUnrefSites(contents) {
  return collectTimerUnrefRanges(contents).map((range) => ({
    line: contents.slice(0, range.start).split('\n').length,
    snippet: range.snippet,
  }));
}

function findNextTimerCall(contents, startIndex) {
  let nextMatch = null;

  for (const prefix of TIMER_CALL_PREFIXES) {
    const index = contents.indexOf(prefix, startIndex);
    if (index === -1) {
      continue;
    }
    if (!nextMatch || index < nextMatch.startIndex) {
      nextMatch = {
        prefix,
        startIndex: index,
        openParenIndex: index + prefix.length - 1,
      };
    }
  }

  return nextMatch;
}

function findMatchingParen(contents, openParenIndex) {
  let depth = 1;
  let quote = null;

  for (let index = openParenIndex + 1; index < contents.length; index += 1) {
    const char = contents[index];

    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

module.exports = {
  findUnsafeTimerUnrefSites,
  patchRendererUnsafeUnrefSites,
};
