# Learning notes

## JWT Pizza code study and debugging

As part of `Deliverable ⓵ Development deployment: JWT Pizza`, start up the application and debug through the code until you understand how it works. During the learning process fill out the following required pieces of information in order to demonstrate that you have successfully completed the deliverable.

| User activity | Frontend component | Backend endpoints | Database SQL |
| --- | --- | --- | --- |
| View home page | home.tsx | none | none |
| Register new user<br/>(t@jwt.com, pw: test) | register.tsx | POST /api/auth | INSERT INTO user (name, email, password) VALUES (?,?,?)<br/>INSERT INTO userRole (userId, role, objectId) VALUES (?,?,0)<br/>INSERT INTO auth (token, userId) VALUES (?,?) ON DUPLICATE KEY UPDATE token=token |
| Login new user<br/>(t@jwt.com, pw: test) | login.tsx | PUT /api/auth | SELECT * FROM user WHERE email=?<br/>SELECT * FROM userRole WHERE userId=?<br/>INSERT INTO auth (token, userId) VALUES (?,?) ON DUPLICATE KEY UPDATE token=token |
| Order pizza | payment.tsx | POST /api/order | INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?,?,?,now())<br/>SELECT id FROM menu WHERE id=? — per item (getID validation)<br/>INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?,?,?,?) — per item |
| Verify pizza | delivery.tsx | none — POST goes straight to the **Pizza Factory** (`/api/order/verify`), not jwt-pizza-service | none (factory owns its own store; not part of this repo) |
| View profile page | dinerDashboard.tsx | GET /api/user/me (loaded once at app start)<br/>GET /api/order (order history) | SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT ?,?<br/>SELECT id, menuId, description, price FROM orderItem WHERE orderId=? — per order |
| View franchise<br/>(as diner) | franchiseDashboard.tsx | GET /api/franchise/:userId | SELECT objectId FROM userRole WHERE role='franchisee' AND userId=? → empty, no further queries |
| Logout | logout.tsx | DELETE /api/auth | DELETE FROM auth WHERE token=? |
| View About page | about.tsx | none | none |
| View History page | history.tsx | none | none |
| Login as franchisee<br/>(f@jwt.com, pw: franchisee) | login.tsx | PUT /api/auth | SELECT * FROM user WHERE email=?<br/>SELECT * FROM userRole WHERE userId=?<br/>INSERT INTO auth (token, userId) VALUES (?,?) ON DUPLICATE KEY UPDATE token=token |
| View franchise<br/>(as franchisee) | franchiseDashboard.tsx | GET /api/franchise/:userId | SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?<br/>SELECT id, name FROM franchise WHERE id IN (...)<br/>SELECT u.id, u.name, u.email FROM userRole ur JOIN user u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'<br/>SELECT s.id, s.name, COALESCE(SUM(oi.price),0) AS totalRevenue FROM dinerOrder do JOIN orderItem oi ON do.id=oi.orderId RIGHT JOIN store s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id |
| Create a store | createStore.tsx | POST /api/franchise/:franchiseId/store | (permission check re-runs the getFranchise queries above)<br/>INSERT INTO store (franchiseId, name) VALUES (?,?) |
| Close a store | closeStore.tsx | DELETE /api/franchise/:franchiseId/store/:storeId | (permission check re-runs the getFranchise queries above)<br/>DELETE FROM store WHERE franchiseId=? AND id=? |
| Login as admin<br/>(a@jwt.com, pw: admin) | login.tsx | PUT /api/auth | SELECT * FROM user WHERE email=?<br/>SELECT * FROM userRole WHERE userId=?<br/>INSERT INTO auth (token, userId) VALUES (?,?) ON DUPLICATE KEY UPDATE token=token |
| View Admin page | adminDashboard.tsx | GET /api/franchise?page&limit&name | SELECT id, name FROM franchise WHERE name LIKE ? LIMIT ? OFFSET ?<br/>SELECT u.id, u.name, u.email FROM userRole ur JOIN user u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee' — per franchise<br/>SELECT s.id, s.name, COALESCE(SUM(oi.price),0) AS totalRevenue ... WHERE s.franchiseId=? GROUP BY s.id — per franchise |
| Create a franchise for t@jwt.com | createFranchise.tsx | POST /api/franchise | SELECT id, name FROM user WHERE email=?<br/>INSERT INTO franchise (name) VALUES (?)<br/>INSERT INTO userRole (userId, role, objectId) VALUES (?, 'franchisee', ?) |
| Close the franchise for t@jwt.com | closeFranchise.tsx | DELETE /api/franchise/:franchiseId | DELETE FROM store WHERE franchiseId=?<br/>DELETE FROM userRole WHERE objectId=?<br/>DELETE FROM franchise WHERE id=? — all in one transaction |
