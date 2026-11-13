# Browser workspace access engine

The custom engine runs entirely in the browser. It needs no Redis, backend, API credentials, feature flag, or paid service. The homepage is public. Selecting a workspace or opening its URL directly shows the code prompt unless the browser already has an active allowance. The UI gives no code-format hints.

## Timing

- A valid entry activates a code with 24 hours of accumulated visible browsing time.
- All pages count, including the homepage, once a code is activated. Time before activation is not charged.
- Hidden tabs and closed pages do not count. Reloading or navigating preserves consumption.
- Visible pages heartbeat once per second. Web Locks serialize storage updates and a shared tab lease prevents double charging across visible windows. Without Web Locks, the lease remains a best-effort fallback.
- A suspended browser or heartbeat gap exceeding five seconds is treated as idle. Timing accuracy is approximately one heartbeat, not billing-grade precision.
- Re-entering a code never replenishes its unused allowance.
- When 24 hours are consumed, access closes and that code enters a 12-hour wall-clock cooldown. The cooldown continues while the site is closed. Entering it during cooldown shows a wait message and remaining time.
- After cooldown, that code can activate a fresh 24-hour allowance. Another valid code has its own allowance. All tabs share the currently selected code.
- The engine stores usage under `mah-workspace-access-v1` in localStorage. Storage failures deny workspace access rather than silently granting it.

## Boundaries

This is a browser-only visitor gate, as requested. Clearing site data, using another browser/private profile, modifying local data or the clock, or changing client code can bypass it. It does not protect the public JavaScript bundles or the optional circuit API. No global code limits, accounts or device identity are implied.

## Validation

Compile `apps/web/src/access/engine.ts` into a temporary CommonJS directory and run `ACCESS_TEST_BUILD=<directory> node --test apps/web/tests/access.test.cjs`. The tests cover exact code matching, cumulative usage, re-entry, visibility, tab coordination, cooldown boundaries, reuse and corrupt data. No production time or stored usage is altered for testing.
