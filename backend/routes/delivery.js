import express from 'express';
import { getAvailableDeliverySlots } from '../services/deliverySlotService.js';

const router = express.Router();

/**
 * GET /api/delivery/slots
 * Returns only future available delivery slots based on India time (Asia/Kolkata),
 * cut-off times before each slot, opening hours, and per-slot limits from config.
 */
router.get('/slots', async (req, res) => {
  try {
    const now = req.query.simulatedTime ? new Date(req.query.simulatedTime) : undefined;
    const slotsData = await getAvailableDeliverySlots({ now });
    res.json(slotsData);
  } catch (err) {
    console.error('[Delivery Slots Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve delivery slots', details: err.message });
  }
});

export default router;
