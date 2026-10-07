import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { Franchise, Order, Role, User } from '../src/service/pizzaService';

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
    'a@jwt.com': { id: '1', name: 'Pizza Admin', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] },
    'f@jwt.com': { id: '2', name: 'Pizza Franchisee', email: 'f@jwt.com', password: 'franchisee', roles: [{ role: Role.Diner }] },
    'fr@jwt.com': { id: '4', name: 'Franchise Owner', email: 'fr@jwt.com', password: 'franchise', roles: [{ role: Role.Diner }, { role: Role.Franchisee, objectId: '2' }] },
  };

  await page.route('*/**/api/auth', async (route) => {
    if (route.request().method() === 'POST') {
      const registerReq = route.request().postDataJSON();
      if (!registerReq.name || !registerReq.email || !registerReq.password) {
        await route.fulfill({ status: 400, json: { message: 'name, email, and password are required' } });
        return;
      }
      const newUser: User = { id: String(Object.keys(validUsers).length + 3), name: registerReq.name, email: registerReq.email, password: registerReq.password, roles: [{ role: Role.Diner }] };
      validUsers[registerReq.email] = newUser;
      loggedInUser = newUser;
      const registerRes = {
        user: loggedInUser,
        token: 'abcdef',
      };
      await route.fulfill({ json: registerRes });
      return;
    }

    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: 'abcdef',
    };
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({ json: loginRes });
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });

  await page.route('*/**/api/order/menu', async (route) => {
    const menuRes = [
      { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
      { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });

  const franchises: Franchise[] = [
    {
      id: '2',
      name: 'LotaPizza',
      admins: [{ id: '4', name: 'Franchise Owner', email: 'fr@jwt.com' }],
      stores: [
        { id: '4', name: 'Lehi' },
        { id: '5', name: 'Springville' },
        { id: '6', name: 'American Fork' },
      ],
    },
    { id: '3', name: 'PizzaCorp', stores: [{ id: '7', name: 'Spanish Fork' }] },
    { id: '4', name: 'topSpot', stores: [] },
  ];

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      const franchiseReq = route.request().postDataJSON();
      const admins = (franchiseReq.admins ?? []).map((admin: { email: string }) => {
        const user = validUsers[admin.email];
        if (!user) return undefined;
        return { id: user.id, name: user.name, email: user.email };
      });
      if (admins.length === 0 || admins.includes(undefined)) {
        await route.fulfill({ status: 404, json: { message: `unknown user for franchise admin ${franchiseReq.admins?.[0]?.email}` } });
        return;
      }
      const newFranchise: Franchise = { ...franchiseReq, id: String(franchises.length + 2), admins, stores: [] };
      franchises.push(newFranchise);
      await route.fulfill({ json: newFranchise });
      return;
    }

    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: { franchises, more: false } });
  });

  await page.route(/\/api\/franchise\/\d+$/, async (route) => {
    expect(route.request().method()).toBe('GET');
    const userId = route.request().url().split('/').pop();
    const userFranchises = franchises.filter((franchise) => franchise.admins?.some((admin) => admin.id === userId));
    await route.fulfill({ json: userFranchises });
  });

  await page.route(/\/api\/franchise\/\d+\/store$/, async (route) => {
    expect(route.request().method()).toBe('POST');
    const franchiseId = route.request().url().split('/').slice(-2)[0];
    const franchise = franchises.find((f) => f.id === franchiseId);
    if (!franchise) {
      await route.fulfill({ status: 404, json: { message: 'unknown franchise' } });
      return;
    }
    const storeReq = route.request().postDataJSON();
    const newStore = { id: String(Date.now()), name: storeReq.name, totalRevenue: 0 };
    franchise.stores = [...(franchise.stores ?? []), newStore];
    await route.fulfill({ json: newStore });
  });

  await page.route(/\/api\/franchise\/\d+\/store\/\d+$/, async (route) => {
    expect(route.request().method()).toBe('DELETE');
    const [franchiseId, , storeId] = route.request().url().split('/').slice(-3);
    const franchise = franchises.find((f) => f.id === franchiseId);
    if (franchise) {
      franchise.stores = (franchise.stores ?? []).filter((store) => store.id !== storeId);
    }
    await route.fulfill({ json: { message: 'store deleted' } });
  });

  const orders: Record<string, Order[]> = {
    '3': [
      {
        id: '1',
        franchiseId: '2',
        storeId: '4',
        date: '2024-06-05T05:14:40.000Z',
        items: [
          { menuId: '1', description: 'Veggie', price: 0.0038 },
          { menuId: '2', description: 'Pepperoni', price: 0.0042 },
        ],
      },
    ],
  };

  await page.route('*/**/api/order', async (route) => {
    if (route.request().method() === 'GET') {
      const dinerId = loggedInUser?.id ?? '';
      await route.fulfill({ json: { id: dinerId, dinerId, orders: orders[dinerId] ?? [] } });
      return;
    }

    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: 'eyJpYXQ',
    };
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: orderRes });
  });

  await page.goto('/');
}

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('diner dashboard', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'KC' }).click();
  await expect(page.getByRole('heading')).toContainText('Your pizza kitchen');
  await expect(page.getByRole('main')).toContainText('Kai Chen');
  await expect(page.getByRole('main')).toContainText('d@jwt.com');
  await expect(page.getByRole('main')).toContainText('diner');
  await expect(page.getByRole('main')).toContainText('Here is your history of all the good times.');
  await expect(page.getByRole('table')).toContainText('0.008 ₿');
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading')).toContainText('Mama Rucci, my my');
  await page.getByRole('link', { name: 'About' }).click();
  await expect(page.getByRole('main')).toContainText('The secret sauce');
  await expect(page.getByRole('img').nth(3)).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Franchise' }).click();
  await expect(page.getByRole('main')).toContainText('So you want a piece of the pie?');
});

test('admin login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'PA', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  await expect(page.getByRole('table')).toContainText('LotaPizza');
});

test('franchise login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('fr@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchise');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'FO', exact: true })).toBeVisible();
  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  await expect(page.getByRole('heading', { name: 'LotaPizza' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Lehi');
  await expect(page.getByRole('table')).toContainText('Springville');
  await expect(page.getByRole('table')).toContainText('American Fork');
});

test('create store', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('fr@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchise');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  await expect(page.getByRole('heading', { name: 'LotaPizza' })).toBeVisible();
  await page.getByRole('button', { name: 'Create store' }).click();
  await expect(page.getByRole('heading')).toContainText('Create store');
  await page.getByPlaceholder('store name').fill('Provo');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'LotaPizza' })).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Provo');
});

test('close store', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('fr@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('franchise');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByLabel('Global').getByRole('link', { name: 'Franchise' }).click();
  await expect(page.getByRole('table')).toContainText('Lehi');
  await page.getByRole('row', { name: /Lehi/ }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading')).toContainText('Sorry to see you go');
  await expect(page.getByRole('main')).toContainText('LotaPizza');
  await expect(page.getByRole('main')).toContainText('Lehi');
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('heading', { name: 'LotaPizza' })).toBeVisible();
  await expect(page.getByRole('table')).not.toContainText('Lehi');
  await expect(page.getByRole('table')).toContainText('Springville');
});

test('create franchise', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('link', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await expect(page.getByRole('heading')).toContainText('Create franchise');
  await page.getByRole('textbox', { name: 'franchise name' }).fill('SLC');
  await page.getByRole('textbox', { name: 'franchisee admin email' }).fill('f@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByText("Mama Ricci's kitchen")).toBeVisible();
  await expect(page.getByRole('table')).toContainText('SLC');
  await expect(page.getByRole('table')).toContainText('Pizza Franchisee');
});

test('register', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page.getByRole('heading')).toContainText('Welcome to the party');
  await page.getByRole('textbox', { name: 'Full name' }).fill('Test One');
  await page.getByRole('textbox', { name: 'Email address' }).fill('t@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('test');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('link', { name: 'TO', exact: true })).toBeVisible();
});

test('purchase with login', async ({ page }) => {
  await basicInit(page);

  await page.getByRole('button', { name: 'Order now' }).click();

  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('0.008')).toBeVisible();
});
