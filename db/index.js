const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '../data/app.sqlite3');
let SQL, db;

async function ready() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: f => require.resolve('sql.js/dist/sql-wasm.wasm') });
    const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
    db = buf ? new SQL.Database(buf) : new SQL.Database();
  }
  return db;
}
function all(sql, params = []) {
  const stmt = db.prepare(sql); stmt.bind(params);
  const rows = []; while (stmt.step()) rows.push(stmt.getAsObject()); stmt.free();
  return rows;
}
function run(sql, params = []) {
  const stmt = db.prepare(sql); stmt.bind(params); stmt.step(); stmt.free();
}
function save() {
  const data = db.export(); fs.writeFileSync(DB_PATH, Buffer.from(data));
}

module.exports = { ready, all, run, save };
