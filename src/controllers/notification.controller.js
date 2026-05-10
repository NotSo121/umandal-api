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

    // ── Birthdays in current Sabha week (Saturday → Friday) ─────────────────
    // daysSinceSat: Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
    const daysSinceSat = (today.getDay() + 1) % 7;
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysSinceSat);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

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
        const bdayThisYr = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        const daysUntil  = Math.round((bdayThisYr - today) / (1000 * 60 * 60 * 24));
        return { ...b, daysUntil, birthdayDate: bdayThisYr };
      })
      .filter((b) => b.birthdayDate >= weekStart && b.birthdayDate <= weekEnd)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // ── Anniversaries of special events (next 14 days, admin only) ──────────
    let anniversaries = [];
    if (['ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      const allSpecial = await prisma.event.findMany({
        where:  { isSpecial: true, isActive: true, eventDate: { lt: today } },
        select: { id: true, name: true, eventDate: true, location: true },
      });

      anniversaries = allSpecial
        .map((e) => {
          const past        = new Date(e.eventDate);
          let   annivThisYr = new Date(today.getFullYear(), past.getMonth(), past.getDate());
          if (annivThisYr < today) {
            annivThisYr = new Date(today.getFullYear() + 1, past.getMonth(), past.getDate());
          }
          const daysUntil   = Math.round((annivThisYr - today) / (1000 * 60 * 60 * 24));
          const yearsAgo    = annivThisYr.getFullYear() - past.getFullYear();
          return { ...e, daysUntil, yearsAgo, anniversaryDate: annivThisYr };
        })
        .filter((e) => e.daysUntil <= 14)
        .sort((a, b) => a.daysUntil - b.daysUntil);
    }

    return res.json({
      success: true,
      data: {
        events:        eventsWithDays,
        birthdays:     upcomingBirthdays,
        anniversaries,
        total:         eventsWithDays.length + upcomingBirthdays.length + anniversaries.length,
      },
    });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getNotifications };
