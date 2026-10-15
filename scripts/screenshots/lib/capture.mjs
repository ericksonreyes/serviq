// Screenshot capture helpers — generated docs artifacts (ADR-0018).
// Reuses the e2e harness for browser launch/login/persona steps; adds
// deterministic PNG output under docs/screenshots/<channel>/.
//
// Conventions (see .devin/skills/user-guide):
//   - states, not just happy paths: empty / validation / success / loading
//   - mobile viewport for the Service Agent PWA
//   - name files by the step they show: 01-request-form.png — they are
//     referenced from docs/guides/<channel>.MD by that name.
import { chromium, devices } from 'playwright'
import dns from 'node:dns/promises'
import fs from 'node:fs'

const GATEWAY = await dns.lookup('host.docker.internal').then((r) => r.address).catch(() => '192.168.65.254')
export const OUT = 'docs/screenshots'

export { login, BASE, PASS, TENANT } from '../../../tests/e2e/lib/harness.mjs'

// ServIQ pages signal "still loading" three ways: MUI progressbars,
// network chatter, and a plain "Loading…" text node. Wait for all of
// them to clear — a screenshot taken mid-load is a broken artifact.
export async function settled(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.locator('.MuiCircularProgress-root, [role="progressbar"]')
    .first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  await page.getByText('Loading…', { exact: true })
    .first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
}

/** Launch a capture run: browser + helpers, channel dir ensured. */
export async function capture(channel, fn) {
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP localhost ${GATEWAY}`] })
  const dir = `${OUT}/${channel}`
  fs.mkdirSync(dir, { recursive: true })
  const ctx = {
    async desktop() { return (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage() },
    async mobile() {
      return (await browser.newContext({ ...devices['iPhone 13'] })).newPage()
    },
    shot: async (page, name) => {
      const path = `${dir}/${name}.png`
      await page.screenshot({ path, fullPage: true })
      console.log(`  ${channel}/${name}.png`)
    },
  }
  try {
    await fn(ctx)
    console.log(`\n${channel}: captured`)
  } catch (e) {
    console.error(`\n${channel}: FAIL`)
    console.error(e.message)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}
