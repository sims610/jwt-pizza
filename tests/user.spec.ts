import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { Role, User } from '../src/service/pizzaService';

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const users: User[] = [{ id: '1', name: 'Pizza Admin', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] }];
  for (let i = 1; i <= 11; i++) {
    users.push({ id: String(i + 1), name: `Diner ${i}`, email: `d${i}@jwt.com`, password: 'diner', roles: [{ role: Role.Diner }] });
  }

  // Register, login, and logout
  await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      loggedInUser = undefined;
      await route.fulfill({ json: { message: 'logout successful' } });
      return;
    }

    const req = route.request().postDataJSON();
    if (method === 'POST') {
      loggedInUser = { id: String(users.length + 1), name: req.name, email: req.email, password: req.password, roles: [{ role: Role.Diner }] };
      users.push(loggedInUser);
    } else {
      loggedInUser = users.find((u) => u.email === req.email && u.password === req.password);
      if (!loggedInUser) {
        await route.fulfill({ status: 401, json: { message: 'unknown user' } });
        return;
      }
    }
    await route.fulfill({ json: { user: loggedInUser, token: 'abcdef' } });
  });

  // getUser, listUsers, updateUser, deleteUser
  await page.route(/\/api\/user(\/[^?]*)?(\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === '/api/user/me') {
      await route.fulfill({ json: loggedInUser });
      return;
    }

    if (url.pathname === '/api/user' && method === 'GET') {
      const pageNum = Number(url.searchParams.get('page') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const nameFilter = (url.searchParams.get('name') ?? '*').replace(/\*/g, '');
      const matches = users.filter((u) => u.name?.includes(nameFilter));
      const start = pageNum * limit;
      await route.fulfill({ json: { users: matches.slice(start, start + limit), more: matches.length > start + limit } });
      return;
    }

    const userId = url.pathname.split('/').pop();
    const index = users.findIndex((u) => u.id === userId);
    if (method === 'PUT') {
      const req = route.request().postDataJSON();
      users[index] = { ...users[index], name: req.name, email: req.email, password: req.password || users[index].password };
      loggedInUser = users[index];
      await route.fulfill({ json: { user: loggedInUser, token: 'abcdef' } });
    } else if (method === 'DELETE') {
      users.splice(index, 1);
      await route.fulfill({ json: { message: 'user deleted' } });
    }
  });

  // The diner dashboard also loads order history
  await page.route('*/**/api/order', async (route) => {
    await route.fulfill({ json: { id: '1', dinerId: loggedInUser?.id, orders: [] } });
  });

  // The admin dashboard also loads franchises
  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    await route.fulfill({ json: { franchises: [], more: false } });
  });

  await page.goto('/');
}

async function loginAsAdmin(page: Page) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
}

test('updateUser', async ({ page }) => {
  await basicInit(page);
  const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Register' }).click();

  await page.getByRole('link', { name: 'pd' }).click();

  await expect(page.getByRole('main')).toContainText('pizza diner');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  await page.getByRole('button', { name: 'Update' }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('pizza diner');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('h3')).toContainText('Edit user');
  await page.getByRole('textbox').first().fill('pizza dinerx');
  await page.getByRole('button', { name: 'Update' }).click();

  await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

  await expect(page.getByRole('main')).toContainText('pizza dinerx');

  await page.getByRole('link', { name: 'Logout' }).click();
  await page.getByRole('link', { name: 'Login' }).click();

  await page.getByRole('textbox', { name: 'Email address' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill('diner');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'pd' }).click();

  await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('admin lists users', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);

  await expect(page.getByRole('row', { name: /Pizza Admin/ })).toContainText('a@jwt.com');
  await expect(page.getByRole('row', { name: /Pizza Admin/ })).toContainText('admin');
  await expect(page.getByRole('row', { name: /Diner 9/ })).toContainText('diner');
});

test('admin pages through users', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);

  await expect(page.getByRole('button', { name: 'Prev' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('row', { name: /Diner 11/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Pizza Admin/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

  await page.getByRole('button', { name: 'Prev' }).click();
  await expect(page.getByRole('row', { name: /Pizza Admin/ })).toBeVisible();
});

test('admin filters users by name', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);

  await page.getByRole('textbox', { name: 'Name' }).fill('Admin');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('row', { name: /Diner 1/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Pizza Admin/ })).toBeVisible();
});

test('admin deletes a user', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);

  await expect(page.getByRole('row', { name: /Diner 3/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Diner 3' }).click();
  await expect(page.getByRole('row', { name: /Diner 3/ })).toHaveCount(0);
});
