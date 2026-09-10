import { test, expect, seed, visiblePage } from './fixtures'
import { PATH } from '../src/router/paths'

/**
 * E2E-M19-05 (FR-19.1, Sync-API §2): the login screen with no answer.
 *
 * The default project runs no backend behind its preview server, which is
 * exactly the condition under test: `GET /auth/config` comes back as a
 * gateway failure — neither the endpoints that mean *log in* nor the 501
 * that means *no login needed*. That is why this case lives here rather than
 * beside E2E-M19-02, whose whole point is a backend that does answer.
 *
 * Both non-answers — this one and a fetch that never lands at all — used to
 * be `!resp.ok` and set the same flag the 501 sets, so this screen told a
 * person whose server was broken that it did not require a login. The
 * assertion that carries the fix is an *absence*, so it is asserted beside
 * two positive signals: the failure that is genuinely true, and the sign-in
 * that must stay reachable, because attempting it is the only thing left
 * that can find out. The network-failure half of the same rule is a unit
 * case (`LoginPage.spec.ts`) — a rejected fetch is not something a preview
 * server can be asked to produce.
 */
test('E2E-M19-05: a server that did not answer is not a server without a login @m19', async ({
  page,
}) => {
  await seed(page, { mode: 'server' })
  await page.goto(PATH.login)

  const visible = visiblePage(page)
  await expect(visible.getByText('did not say whether a login is needed')).toBeVisible()
  await expect(visible.getByText('does not require a login')).toHaveCount(0)
  await expect(visible.getByTestId('login-action')).toBeVisible()
})
