const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// GET /api/items?all=1 (admin can request all; default returns active only)
router.get("/", async (req, res) => {
  const all = req.query.all === "1";

  const items = await prisma.item.findMany({
    where: all ? {} : { isActive: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  res.json(items);
});

// POST /api/items
router.post("/", async (req, res) => {
  const name = (req.body.name || "").trim();
  const type = (req.body.type || "service").toString();
  const price = Number(req.body.price);

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: "Invalid price" });

  const item = await prisma.item.create({
    data: {
      name,
      type: type === "product" ? "product" : "service",
      price,
      isActive: true,
    },
  });

  res.json(item);
});

// PUT /api/items/:id  (update name/price/type/isActive)
router.put("/:id", async (req, res) => {
  const { id } = req.params;

  const data = {};
  if (req.body.name !== undefined) {
    const name = (req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Name is required" });
    data.name = name;
  }

  if (req.body.price !== undefined) {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: "Invalid price" });
    data.price = price;
  }

  if (req.body.type !== undefined) {
    const type = (req.body.type || "service").toString();
    data.type = type === "product" ? "product" : "service";
  }

  if (req.body.isActive !== undefined) {
    data.isActive = !!req.body.isActive;
  }

  const updated = await prisma.item.update({
    where: { id },
    data,
  });

  res.json(updated);
});

module.exports = router;