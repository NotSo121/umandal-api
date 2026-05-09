const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Runs every Wednesday at 9:00 AM IST (Asia/Kolkata)
// Creates a "Friday Sabha" event for the upcoming Friday, if one doesn't exist yet.
const startEventScheduler = () => {
  cron.schedule('0 9 * * 3', async () => {
    try {
      // Compute the upcoming Friday (2 days from Wednesday)
      const now    = new Date();
      const friday = new Date(now);
      friday.setDate(now.getDate() + 2);
      friday.setHours(0, 0, 0, 0);

      const fridayEnd = new Date(friday);
      fridayEnd.setHours(23, 59, 59, 999);

      // Find the "Friday Sabha" EventCategory
      const category = await prisma.eventCategory.findFirst({
        where: { name: 'Friday Sabha' },
      });

      // Check if an event already exists for this Friday with this category
      const existing = await prisma.event.findFirst({
        where: {
          eventDate:       { gte: friday, lte: fridayEnd },
          eventCategoryId: category?.id ?? undefined,
          name:            'Friday Sabha',
        },
      });

      if (existing) {
        console.log(`[scheduler] Friday Sabha for ${friday.toDateString()} already exists — skipping`);
        return;
      }

      const event = await prisma.event.create({
        data: {
          name:            'Friday Sabha',
          eventDate:       friday,
          eventCategoryId: category?.id ?? null,
        },
      });

      console.log(`[scheduler] Created Friday Sabha event id=${event.id} for ${friday.toDateString()}`);
    } catch (err) {
      console.error('[scheduler] Failed to create Friday Sabha event:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[scheduler] Event scheduler started — Friday Sabha auto-create every Wednesday 9 AM IST');
};

module.exports = { startEventScheduler };
