const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/dashboard/stats
const getStats = async (req, res) => {
  try {
    const [
      totalBhakto,
      activeBhakto,
      totalLeaders,
      totalEvents,
      totalAttendance,
      presentAttendance,
      upcomingEvents,
      recentEvents,
      societyStats,
      categoryStats,
    ] = await Promise.all([
      // Total bhakto
      prisma.bhakto.count(),

      // Active bhakto
      prisma.bhakto.count({ where: { isActive: true } }),

      // Total leaders
      prisma.bhakto.count({ where: { isLeader: true } }),

      // Total events
      prisma.event.count(),

      // Total attendance records
      prisma.attendance.count(),

      // Total present records
      prisma.attendance.count({ where: { isPresent: true } }),

      // Upcoming events (future, next 5)
      prisma.event.findMany({
        where:   { eventDate: { gte: new Date() } },
        orderBy: { eventDate: 'asc' },
        take: 5,
        select: {
          id: true, name: true, eventDate: true, location: true,
          _count: { select: { attendances: { where: { isPresent: true } } } },
        },
      }),

      // Recent events (past, last 5)
      prisma.event.findMany({
        where:   { eventDate: { lt: new Date() } },
        orderBy: { eventDate: 'desc' },
        take: 5,
        select: {
          id: true, name: true, eventDate: true, location: true,
          _count: { select: { attendances: { where: { isPresent: true } } } },
        },
      }),

      // Bhakto count per society
      prisma.society.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { bhaktos: true } },
        },
        orderBy: { name: 'asc' },
      }),

      // Bhakto count per category
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { bhaktos: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    // ── Pocket count for non-admin ──────────────────────────────────────────
    let pocketCount = null;
    if (req.user.role !== 'ADMIN') {
      const userRow = await prisma.user.findUnique({
        where:  { id: req.user.sub },
        select: { bhaktoId: true },
      });
      if (userRow?.bhaktoId) {
        const leaderBhakto = await prisma.bhakto.findUnique({
          where:  { id: userRow.bhaktoId },
          select: { fullName: true },
        });
        if (leaderBhakto?.fullName) {
          pocketCount = await prisma.bhakto.count({
            where: { referenceBy: leaderBhakto.fullName },
          });
        }
      }
    }

    // ── Upcoming birthdays (next 14 days) ──
    const allWithDOB = await prisma.bhakto.findMany({
      where:  { dateOfBirth: { not: null }, isActive: true },
      select: { id: true, fullName: true, dateOfBirth: true, mobileNo: true, photoUrl: true },
    });

    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const in14Days = new Date(today);
    in14Days.setDate(today.getDate() + 14);

    const upcomingBirthdays = allWithDOB
      .map((b) => {
        const dob        = new Date(b.dateOfBirth);
        let   bdayThisYr = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        if (bdayThisYr < today) {
          bdayThisYr = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
        }
        const daysUntil = Math.round((bdayThisYr - today) / (1000 * 60 * 60 * 24));
        return { ...b, daysUntil, birthdayDate: bdayThisYr };
      })
      .filter((b) => b.daysUntil <= 14)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    return res.json({
      success: true,
      data: {
        bhakto: {
          total:    activeBhakto,
          active:   activeBhakto,
          inactive: totalBhakto - activeBhakto,
          leaders:  totalLeaders,
        },
        events: {
          total: totalEvents,
        },
        attendance: {
          total:   totalAttendance,
          present: presentAttendance,
          absent:  totalAttendance - presentAttendance,
        },
        upcomingEvents: upcomingEvents.map((e) => ({
          id:              e.id,
          name:            e.name,
          eventDate:       e.eventDate,
          location:        e.location,
          attendanceCount: e._count.attendances,
        })),
        recentEvents: recentEvents.map((e) => ({
          id:              e.id,
          name:            e.name,
          eventDate:       e.eventDate,
          location:        e.location,
          attendanceCount: e._count.attendances,
        })),
        societyStats: societyStats.map((s) => ({
          id:          s.id,
          name:        s.name,
          bhaktoCount: s._count.bhaktos,
        })),
        categoryStats: categoryStats.map((c) => ({
          id:          c.id,
          name:        c.name,
          bhaktoCount: c._count.bhaktos,
        })),
        pocketCount,
        upcomingBirthdays: upcomingBirthdays.map((b) => ({
          id:          b.id,
          fullName:    b.fullName,
          mobileNo:    b.mobileNo,
          photoUrl:    b.photoUrl,
          dateOfBirth: b.dateOfBirth,
          daysUntil:   b.daysUntil,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getStats };
