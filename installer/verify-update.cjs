const { resolve } = require('node:path');
const fs = require('node:fs');
const { DatabaseSync: Database } = require('node:sqlite');
const installDir = resolve(process.argv[3] || resolve(__dirname, 'update-smoke'));
const total = Number(process.argv[4] || 57);
const dir = resolve(installDir, 'app/data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(resolve(dir, 'client.db'));
if (process.argv[2] === 'prepare') {
  db.exec('CREATE TABLE product (id INTEGER PRIMARY KEY, name TEXT, stock_quantity INTEGER)');
  const insert = db.prepare('INSERT INTO product VALUES (?, ?, ?)');
  for (let i = 1; i <= total; i++) insert.run(i, 'Produto teste ' + i, i + 10);
  fs.writeFileSync(resolve(installDir, 'app/.env'), 'DATABASE_URL="file:./data/client.db"\nPORT=31987\nCLIENT_MARKER=preservar-configuracao\n');
} else {
  const result = db.prepare('SELECT count(*) AS total, sum(stock_quantity) AS stock FROM product').get();
  if (result.total !== total || result.stock !== total * (total + 1) / 2 + total * 10) throw Error(JSON.stringify(result));
  console.log(total + ' produtos e todas as quantidades preservados: ' + JSON.stringify(result));
}
db.close();
