# Visual Regression Testing (Playwright)

## Setup (example)
```bash
npm i -D @playwright/test
npx playwright install
```

## Example Test
```ts
// tests/vrt/home.spec.ts
import {{ test, expect }} from '@playwright/test';

test('home page visual', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  expect(await page.screenshot()).toMatchSnapshot('home.png');
});
```

## CI Notes
- On PRs: run Playwright; upload diffs as artifacts.
- Optionally require human approval for snapshot updates.
