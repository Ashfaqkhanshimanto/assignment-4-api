const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const db = require("./db");
require("./initDb");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

// Load OpenAPI file and update server URL dynamically
const openApiDocument = require("./openapi.json");
openApiDocument.servers = [{ url: BASE_URL }];

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to the Programming Quotes API",
    documentation: `${BASE_URL}/docs`
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Get all categories
app.get("/api/categories", (req, res) => {
  db.all(`SELECT id, name FROM categories ORDER BY name`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get all quotes by category
app.get("/api/categories/:category/quotes", (req, res) => {
  const category = req.params.category;

  const sql = `
    SELECT q.id, q.text, q.author, q.likes, q.dislikes
    FROM quotes q
    JOIN quote_categories qc ON q.id = qc.quote_id
    JOIN categories c ON qc.category_id = c.id
    WHERE c.name = ?
    ORDER BY q.id
  `;

  db.all(sql, [category], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get random quote from all
app.get("/api/quotes/random", (req, res) => {
  db.get(`SELECT * FROM quotes ORDER BY RANDOM() LIMIT 1`, [], (err, quote) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!quote) {
      return res.status(404).json({ error: "No quotes found" });
    }
    res.json(quote);
  });
});

// Get random quote from category
app.get("/api/quotes/random/:category", (req, res) => {
  const category = req.params.category;

  const sql = `
    SELECT q.id, q.text, q.author, q.likes, q.dislikes
    FROM quotes q
    JOIN quote_categories qc ON q.id = qc.quote_id
    JOIN categories c ON qc.category_id = c.id
    WHERE c.name = ?
    ORDER BY RANDOM()
    LIMIT 1
  `;

  db.get(sql, [category], (err, quote) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!quote) {
      return res.status(404).json({ error: "No quote found for this category" });
    }
    res.json(quote);
  });
});

// Get quote by ID
app.get("/api/quotes/:id", (req, res) => {
  const id = req.params.id;

  db.get(`SELECT * FROM quotes WHERE id = ?`, [id], (err, quote) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    db.all(
      `
      SELECT c.name
      FROM categories c
      JOIN quote_categories qc ON c.id = qc.category_id
      WHERE qc.quote_id = ?
      ORDER BY c.name
      `,
      [id],
      (err2, categories) => {
        if (err2) {
          return res.status(500).json({ error: err2.message });
        }

        quote.categories = categories.map((c) => c.name);
        res.json(quote);
      }
    );
  });
});

// Add a new category
app.post("/api/categories", (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Category name is required" });
  }

  const normalizedName = name.trim().toLowerCase();

  db.run(`INSERT INTO categories (name) VALUES (?)`, [normalizedName], function (err) {
    if (err) {
      return res.status(400).json({ error: "Category already exists or invalid" });
    }

    res.status(201).json({
      id: this.lastID,
      name: normalizedName
    });
  });
});

// Add a new quote and assign categories
app.post("/api/quotes", (req, res) => {
  const { text, author, categories } = req.body;

  if (!text || !text.trim() || !author || !author.trim() || !Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({
      error: "text, author, and categories array are required"
    });
  }

  const normalizedCategories = categories.map((c) => c.trim().toLowerCase());

  db.run(
    `INSERT INTO quotes (text, author) VALUES (?, ?)`,
    [text.trim(), author.trim()],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const quoteId = this.lastID;
      const placeholders = normalizedCategories.map(() => "?").join(",");

      db.all(
        `SELECT id, name FROM categories WHERE name IN (${placeholders})`,
        normalizedCategories,
        (err2, rows) => {
          if (err2) {
            return res.status(500).json({ error: err2.message });
          }

          if (rows.length !== normalizedCategories.length) {
            return res.status(400).json({ error: "One or more categories do not exist" });
          }

          const stmt = db.prepare(
            `INSERT OR IGNORE INTO quote_categories (quote_id, category_id) VALUES (?, ?)`
          );

          rows.forEach((row) => {
            stmt.run(quoteId, row.id);
          });

          stmt.finalize((err3) => {
            if (err3) {
              return res.status(500).json({ error: err3.message });
            }

            res.status(201).json({
              id: quoteId,
              text: text.trim(),
              author: author.trim(),
              categories: normalizedCategories
            });
          });
        }
      );
    }
  );
});

// Assign existing quote to additional category
app.post("/api/quotes/:id/categories", (req, res) => {
  const quoteId = req.params.id;
  const { category } = req.body;

  if (!category || !category.trim()) {
    return res.status(400).json({ error: "Category is required" });
  }

  const normalizedCategory = category.trim().toLowerCase();

  db.get(`SELECT id FROM quotes WHERE id = ?`, [quoteId], (err, quote) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    db.get(`SELECT id FROM categories WHERE name = ?`, [normalizedCategory], (err2, cat) => {
      if (err2) {
        return res.status(500).json({ error: err2.message });
      }

      if (!cat) {
        return res.status(404).json({ error: "Category not found" });
      }

      db.run(
        `INSERT OR IGNORE INTO quote_categories (quote_id, category_id) VALUES (?, ?)`,
        [quoteId, cat.id],
        function (err3) {
          if (err3) {
            return res.status(500).json({ error: err3.message });
          }

          res.status(201).json({
            message: "Category assigned to quote",
            quote_id: Number(quoteId),
            category: normalizedCategory
          });
        }
      );
    });
  });
});

// Vote on a quote
app.post("/api/quotes/:id/vote", (req, res) => {
  const quoteId = req.params.id;
  const { vote } = req.body;

  if (vote !== "like" && vote !== "dislike") {
    return res.status(400).json({ error: 'Vote must be "like" or "dislike"' });
  }

  const field = vote === "like" ? "likes" : "dislikes";

  db.run(
    `UPDATE quotes SET ${field} = ${field} + 1 WHERE id = ?`,
    [quoteId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: "Quote not found" });
      }

      db.get(`SELECT * FROM quotes WHERE id = ?`, [quoteId], (err2, row) => {
        if (err2) {
          return res.status(500).json({ error: err2.message });
        }
        res.json(row);
      });
    }
  );
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
});