const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper — same as in bhakto.controller.js
const getLeaderName = async (userId) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { bhaktoId: true },
    });
    if (!user?.bhaktoId) return null;
    const bhakto = await prisma.bhakto.findUnique({
      where: { id: user.bhaktoId },
      select: { fullName: true },
    });
    return bhakto?.fullName ?? null;
  } catch { return null; }
};

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in14Days = new Date(today);
    in14Days.setDate(today.getDate() + 14);

    // ── Upcoming events (next 14 days) ──────────────────────────────────────
    const events = await prisma.event.findMany({
      where:   { eventDate: { gte: today, lte: in14Days } },
      orderBy: { eventDate: 'asc' },
      select:  { id: true, name: true, eventDate: true, location: true },
    });

    const eventsWithDays = events.map((e) => {
      const daysUntil = Math.round(
        (new Date(e.eventDate) - today) / (1000 * 60 * 60 * 24),
      );
      return { ...e, daysUntil };
    });

    // ── Upcoming birthdays (next 14 days) ────────────────────────────────────
    const birthdayFilter = { dateOfBirth: { not: null }, isActive: true };

    // Non-admin: only their pocket
    if (!['ADMIN','SUPER_ADMIN'].includes(req.user.role)) {
      const leaderName = await getLeaderName(req.user.sub);
      if (leaderName) birthdayFilter.referenceBy = leaderName;
    }

    const allWithDOB = await prisma.bhakto.findMany({
      where:  birthdayFilter,
      select: {
        id: true, fullName: true, dateOfBirth: true,
        mobileNo: true, photoUrl: true,
      },
    });

    const upcomingBirthdays = allWithDOB
      .map((b) => {
        const dob        = new Date(b.dateOfBirth);
        let   bdayThisYr = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (bdayThisYr < today) {
          bdayThisYr = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
        }
        const daysUntil = Math.round((bdayThisYr - today) / (1000 * 60 * 60 * 24));
        return { ...b, daysUntil };
      })
      .filter((b) => b.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return res.json({
      success: true,
      data: {
        events:    eventsWithDays,
        birthdays: upcomingBirthdays,
        total:     eventsWithDays.length + upcomingBirthdays.length,
      },
    });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getNotifications };
