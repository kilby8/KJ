const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

async function initAuthStore(dbFilePath) {
  const SQL = await initSqlJs();
  const defaultPath = process.env.RENDER
    ? '/tmp/auth.sqlite'
    : path.join(process.cwd(), 'server', 'auth.sqlite');
  const resolvedPath = dbFilePath || defaultPath;

  let db;
  if (fs.existsSync(resolvedPath)) {
    db = new SQL.Database(fs.readFileSync(resolvedPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Keep a known temporary admin account for the current login-only phase.
  db.run(
    `
      INSERT INTO users (username, password, updated_at)
      VALUES ($username, $password, $updatedAt)
      ON CONFLICT(username) DO UPDATE SET
        password = excluded.password,
        updated_at = excluded.updated_at;
    `,
    {
      $username: DEFAULT_ADMIN_USERNAME,
      $password: DEFAULT_ADMIN_PASSWORD,
      $updatedAt: Date.now(),
    },
  );

  function persist() {
    const outDir = path.dirname(resolvedPath);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(resolvedPath, Buffer.from(db.export()));
  }

  function getUser(username) {
    const stmt = db.prepare('SELECT username, password FROM users WHERE username = $username LIMIT 1');
    try {
      stmt.bind({ $username: username });
      if (!stmt.step()) return null;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  let persistenceMode = 'file';
  try {
    persist();
  } catch (err) {
    // Keep service online even if the target path is not writable in the runtime container.
    persistenceMode = 'memory';
    console.warn(`Warning: failed to persist auth DB at ${resolvedPath}: ${err?.message || err}`);
  }

  return {
    dbPath: resolvedPath,
    persistenceMode,
    getUser,
  };
}

module.exports = { initAuthStore };

