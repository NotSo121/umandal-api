const cron  = require('node-cron');
const https = require('https');
const { PrismaClient } = require('@prisma/client');
const { sendPush } = require('../utils/fcm');

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

  // Every day at 11:00 PM IST — remind leaders who haven't submitted attendance
  cron.schedule('0 23 * * *', async () => {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

      const todayEvents = await prisma.event.findMany({
        where: { eventDate: { gte: todayStart, lte: todayEnd }, isActive: true, isOpen: true },
        select: { id: true, name: true },
      });
      if (todayEvents.length === 0) return;

      const users = await prisma.user.findMany({
        where: { fcmToken: { not: null }, bhaktoId: { not: null }, isActive: true },
        select: { id: true, fcmToken: true, bhaktoId: true, bhakto: { select: { fullName: true } } },
      });
      if (users.length === 0) return;

      for (const event of todayEvents) {
        for (const user of users) {
          if (!user.bhakto?.fullName) continue;

          const pocket = await prisma.bhakto.findMany({
            where:  { referenceBy: user.bhakto.fullName, isActive: true },
            select: { id: true },
          });
          if (pocket.length === 0) continue;

          const submitted = await prisma.attendance.count({
            where: { eventId: event.id, bhaktoId: { in: pocket.map((b) => b.id) } },
          });

          if (submitted === 0) {
            await sendPush(
              user.fcmToken,
              'Attendance Reminder',
              `Please fill attendance for "${event.name}"`,
            );
          }
        }
      }
      console.log(`[scheduler] Attendance reminder sent for ${todayEvents.length} event(s)`);
    } catch (err) {
      console.error('[scheduler] Attendance reminder error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[scheduler] Attendance reminder cron started — every day 11 PM IST');

  // ── Keep-alive: ping self every 14 min to prevent Render cold starts ──────
  cron.schedule('*/14 * * * *', () => {
    https.get('https://umandal-api.onrender.com/', (res) => {
      console.log(`[keep-alive] ping OK — status ${res.statusCode}`);
    }).on('error', (e) => {
      console.error('[keep-alive] ping failed:', e.message);
    });
  });
  console.log('[scheduler] Keep-alive cron started — pinging every 14 min');
};

module.exports = { startEventScheduler };
