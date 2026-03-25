const db = require("./db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      author TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quote_categories (
      quote_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (quote_id, category_id),
      FOREIGN KEY (quote_id) REFERENCES quotes(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  // Insert sample categories
  const categories = ["motivation", "debugging", "career", "funny", "javascript"];
  const insertCategory = db.prepare(`INSERT OR IGNORE INTO categories (name) VALUES (?)`);
  categories.forEach((cat) => insertCategory.run(cat));
  insertCategory.finalize();

  // Insert sample quotes
  const insertQuote = db.prepare(`
    INSERT INTO quotes (text, author)
    SELECT ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM quotes WHERE text = ? AND author = ?
    )
  `);

  const sampleQuotes = [
    ["Programs must be written for people to read, and only incidentally for machines to execute.", "Harold Abelson"],
    ["First, solve the problem. Then, write the code.", "John Johnson"],
    ["Fix the cause, not the symptom.", "Steve Maguire"],
    ["JavaScript is the duct tape of the Internet.", "Charlie Campbell"],
    ["Experience is the name everyone gives to their mistakes.", "Oscar Wilde"]
  ];

  sampleQuotes.forEach(([text, author]) => {
    insertQuote.run(text, author, text, author);
  });
  insertQuote.finalize();

  // Assign quote-category relationships
  db.all(`SELECT id, text FROM quotes`, [], (err, quotes) => {
    if (err) {
      console.error(err.message);
      return;
    }

    db.all(`SELECT id, name FROM categories`, [], (err2, cats) => {
      if (err2) {
        console.error(err2.message);
        return;
      }

      const catMap = {};
      cats.forEach((c) => {
        catMap[c.name] = c.id;
      });

      const quoteMap = {};
      quotes.forEach((q) => {
        quoteMap[q.text] = q.id;
      });

      const relations = [
        ["Programs must be written for people to read, and only incidentally for machines to execute.", "career"],
        ["Programs must be written for people to read, and only incidentally for machines to execute.", "motivation"],
        ["First, solve the problem. Then, write the code.", "motivation"],
        ["First, solve the problem. Then, write the code.", "debugging"],
        ["Fix the cause, not the symptom.", "debugging"],
        ["JavaScript is the duct tape of the Internet.", "javascript"],
        ["JavaScript is the duct tape of the Internet.", "funny"],
        ["Experience is the name everyone gives to their mistakes.", "career"],
        ["Experience is the name everyone gives to their mistakes.", "funny"]
      ];

      const insertRelation = db.prepare(`
        INSERT OR IGNORE INTO quote_categories (quote_id, category_id)
        VALUES (?, ?)
      `);

      relations.forEach(([quoteText, catName]) => {
        const quoteId = quoteMap[quoteText];
        const categoryId = catMap[catName];
        if (quoteId && categoryId) {
          insertRelation.run(quoteId, categoryId);
        }
      });

      insertRelation.finalize();
      console.log("Database initialized with sample data.");
    });
  });
});