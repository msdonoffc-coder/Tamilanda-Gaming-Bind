import postgres from "postgres";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set in .env file");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "tamilanda_salt_2024").digest("hex");
}

async function setup() {
  console.log("Setting up Tamilanda Bind Manager database...\n");

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      balance NUMERIC(18,2) NOT NULL DEFAULT '0',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ users table ready");

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  console.log("✓ sessions table ready");

  await sql`
    CREATE TABLE IF NOT EXISTS operations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cost NUMERIC(10,2) NOT NULL,
      result TEXT,
      access_token TEXT,
      manual_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ operations table ready");

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("✓ settings table ready");

  // Create admin account if not exists
  const adminHash = hashPassword("TamilandaX@178");
  const [existing] = await sql`SELECT id FROM users WHERE username = 'tamilanda'`;
  if (!existing) {
    await sql`
      INSERT INTO users (username, email, password_hash, balance)
      VALUES ('tamilanda', 'admin@tamilanda.com', ${adminHash}, '9999999999.00')
    `;
    console.log("\n✓ Admin account created");
    console.log("  Username: tamilanda");
    console.log("  Password: TamilandaX@178");
    console.log("  Balance:  ₹9,999,999,999");
  } else {
    console.log("\n✓ Admin account already exists");
  }

  console.log("\n✅ Database setup complete! Run: npm start\n");
  await sql.end();
}

setup().catch(err => {
  console.error("Setup failed:", err.message);
  process.exit(1);
});
