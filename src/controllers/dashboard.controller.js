    const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/dashboard/stats
const getStats = async (req, res) => {
  try {
    // Run all counts in parallel for performance
    const [
      totalBhakto,
      activeBhakto,
      totalLeaders,
      totalEvents,
      totalAttendance,
      presentAttendance,
      recentEvents,
      mandalStats,
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

      // Last 5 events
      prisma.event.findMany({
        orderBy: { eventDate: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          eventDate: true,
          location: true,
          _count: { select: { attendances: true } },
        },
      }),

      // Bhakto count per mandal
      prisma.mandal.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { bhaktos: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        bhakto: {
          total:   totalBhakto,
          active:  activeBhakto,
          inactive: totalBhakto - activeBhakto,
          leaders: totalLeaders,
        },
        events: {
          total: totalEvents,
        },
        attendance: {
          total:   totalAttendance,
          present: presentAttendance,
          absent:  totalAttendance - presentAttendance,
        },
        recentEvents: recentEvents.map((e) => ({
          id:             e.id,
          name:           e.name,
          eventDate:      e.eventDate,
          location:       e.location,
          attendanceCount: e._count.attendances,
        })),
        mandalStats: mandalStats.map((m) => ({
          id:          m.id,
          name:        m.name,
          bhaktoCount: m._count.bhaktos,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getStats };