require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres123@localhost:5432/talentdb";

const pool = new Pool({
  connectionString: DATABASE_URL
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS talents (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      skills TEXT[] NOT NULL,
      experience INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

app.get("/", (req, res) => {
  res.json({
    message: "Talent API is running"
  });
});

app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({
      status: "ok",
      db: "connected"
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      db: "disconnected",
      error: err.message
    });
  }
});

app.post("/api/talents", async (req, res) => {
  try {
    const { name, email, skills, experience } = req.body;

    if (!name || !email || !Array.isArray(skills) || experience === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const result = await pool.query(
      `
      INSERT INTO talents (name, email, skills, experience)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, skills, experience, created_at
      `,
      [name, email, skills, experience]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email already exists" });
    }

    res.status(500).json({ error: "Failed to add talent" });
  }
});

app.get("/api/talents", async (req, res) => {
  try {
    const limit = 2;
    const page = Number(req.query.page) || 1;
    const skillFilter = req.query.skill;

    let countQuery = "SELECT COUNT(*) FROM talents";
    let dataQuery = `
      SELECT id, name, email, skills, experience, created_at
      FROM talents
    `;
    const params = [];

    if (skillFilter) {
      countQuery += " WHERE $1 = ANY(skills)";
      dataQuery += " WHERE $1 = ANY(skills)";
      params.push(skillFilter);
    }

    dataQuery += ` ORDER BY id LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    const totalResult = await pool.query(countQuery, params);
    const talentsResult = await pool.query(dataQuery, params);

    const totalTalents = Number(totalResult.rows[0].count);
    const totalPages = Math.ceil(totalTalents / limit);

    res.status(200).json({
      talents: talentsResult.rows,
      totalPages,
      page,
      totalTalents
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch talents" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

async function startServer() {
  try {
    await initDb();
    console.log("PostgreSQL connected and table ready");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Database init error:", err.message);
    process.exit(1);
  }
}

startServer();