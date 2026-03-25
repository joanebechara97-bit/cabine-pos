const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getBusinessId(req) {
  return req.session?.user?.businessId || null;
}

// GET /api/items?all=1
router.get('/', async (req, res) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(400).json({ error: 'Business not found in session' });
    }

    const all = req.query.all === '1';

    const items = await prisma.item.findMany({
      where: {
        businessId,
        ...(all ? {} : { isActive: true })
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }]
    });

    return res.json(items);
  } catch (err) {
    console.error('GET /api/items error:', err);
    return res.status(500).json({ error: 'Failed to load items' });
  }
});

// POST /api/items
router.post('/', async (req, res) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(400).json({ error: 'Business not found in session' });
    }

    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price || 0);
    const type = String(req.body.type || 'service').trim() === 'product' ? 'product' : 'service';

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    const item = await prisma.item.create({
      data: {
        businessId,
        name,
        price,
        type,
        isActive: true
      }
    });

    return res.json(item);
  } catch (err) {
    console.error('POST /api/items error:', err);
    return res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/items/:id
router.put('/:id', async (req, res) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return res.status(400).json({ error: 'Business not found in session' });
    }

    const { id } = req.params;
    const data = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Name is required' });
      data.name = name;
    }

    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Invalid price' });
      }
      data.price = price;
    }

    if (req.body.type !== undefined) {
      const type = String(req.body.type || 'service').trim();
      data.type = type === 'product' ? 'product' : 'service';
    }

    if (req.body.isActive !== undefined) {
      data.isActive = !!req.body.isActive;
    }

    const existing = await prisma.item.findFirst({
      where: { id, businessId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updated = await prisma.item.update({
      where: { id },
      data
    });

    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/items/:id error:', err);
    return res.status(500).json({ error: 'Failed to update item' });
  }
});

module.exports = router;