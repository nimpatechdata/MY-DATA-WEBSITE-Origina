require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const api = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "..", "public");

app.use(cors());
app.use(express.json({
  verify(req, _res, buffer) {
    req.rawBody = buffer.toString("utf8");
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.use("/api", api);

app.get("/checkout", (_req, res) => {
  res.sendFile(path.join(publicDir, "checkout.html"));
});

app.get("/agents", (_req, res) => {
  res.sendFile(path.join(publicDir, "agents.html"));
});

app.get("/agents/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "agent-dashboard.html"));
});

app.get("/success", (_req, res) => {
  res.sendFile(path.join(publicDir, "success.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API route not found." });
  }
  return res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`NImpatech data bundles running at http://localhost:${PORT}`);
});
