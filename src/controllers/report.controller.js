const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Helper: get logged-in user's linked leader name
const getLeaderName = async (userId) => {
  try {
    const uid = parseInt(userId);
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { bhaktoId: true },
    });
    if (!user?.bhaktoId) return null;
    const bhakto = await prisma.bhakto.findUnique({
      where: { id: user.bhaktoId },
      select: { fullName: true },
    });
    return bhakto?.fullName ?? null;
  } catch (e) {
    console.error('[getLeaderName] error:', e.message);
    return null;
  }
};

// Helper: get bhakto IDs for a given leader name
const getBhaktoIdsForLeader = async (leaderName) => {
  const bhaktos = await prisma.bhakto.findMany({
    where: { referenceBy: leaderName },
    select: { id: true },
  });
  return bhaktos.map((b) => b.id);
};

// GET /api/reports/events
// Admin: all events (optionally filtered by ?referenceBy=name)
// User: events scoped to their team only
const getEventReport = async (req, res) => {
  try {
    const { referenceBy } = req.query;
    const isAdmin = req.user.role === 'ADMIN';

    // Determine the leader filter
    let bhaktoIds = null; // null = no filter (all)
    if (!isAdmin) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.json({ success: true, data: [] });
      }
      bhaktoIds = await getBhaktoIdsForLeader(leaderName);
    } else if (referenceBy) {
      bhaktoIds = await getBhaktoIdsForLeader(referenceBy);
    }

    const events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { eventDate: 'desc' },
    });

    const result = await Promise.all(
      events.map(async (event) => {
        const attendanceWhere = { eventId: event.id };
        if (bhaktoIds !== null) {
          attendanceWhere.bhaktoId = { in: bhaktoIds };
        }

        const [total, present] = await Promise.all([
          prisma.attendance.count({ where: attendanceWhere }),
          prisma.attendance.count({ where: { ...attendanceWhere, isPresent: true } }),
        ]);

        const rate = total > 0 ? Math.round((present / total) * 100) : 0;

        return {
          id:        event.id,
          name:      event.name,
          eventDate: event.eventDate,
          location:  event.location,
          isOpen:    event.isOpen,
          total,
          present,
          absent:    total - present,
          rate,
        };
      })
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/reports/events/:eventId
// Returns attendance records for one event, scoped by role/filter
const getEventReportDetail = async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const { referenceBy } = req.query;
    const isAdmin = req.user.role === 'ADMIN';

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    let bhaktoIds = null;
    if (!isAdmin) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.json({ success: true, data: { event, attendance: [] } });
      }
      bhaktoIds = await getBhaktoIdsForLeader(leaderName);
    } else if (referenceBy) {
      bhaktoIds = await getBhaktoIdsForLeader(referenceBy);
    }

    const attendanceWhere = { eventId };
    if (bhaktoIds !== null) {
      attendanceWhere.bhaktoId = { in: bhaktoIds };
    }

    const attendances = await prisma.attendance.findMany({
      where: attendanceWhere,
      include: {
        bhakto: {
          select: {
            id: true, fullName: true, mobileNo: true, photoUrl: true, referenceBy: true,
          },
        },
      },
      orderBy: [{ isPresent: 'desc' }, { bhakto: { fullName: 'asc' } }],
    });

    return res.json({ success: true, data: { event, attendance: attendances } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/reports/leaders  (admin only)
// Returns leader list with current active bhakto count
const getLeaderSummary = async (req, res) => {
  try {
    const leaders = await prisma.bhakto.findMany({
      where: { isLeader: true, isActive: true },
      select: { id: true, fullName: true, mobileNo: true },
      orderBy: { fullName: 'asc' },
    });

    const result = await Promise.all(
      leaders.map(async (leader) => {
        const bhaktoCount = await prisma.bhakto.count({
          where: { referenceBy: leader.fullName, isActive: true },
        });
        return { ...leader, bhaktoCount };
      })
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/reports/leaders/detail?name=<leaderName>  (admin only)
// Event-wise stats for one leader's team
const getLeaderDetail = async (req, res) => {
  try {
    const { name: leaderName } = req.query;
    if (!leaderName) {
      return res.status(400).json({ success: false, error: 'Leader name is required' });
    }

    const bhaktoIds = await getBhaktoIdsForLeader(leaderName);

    if (bhaktoIds.length === 0) {
      return res.json({ success: true, data: { leaderName, bhaktoCount: 0, events: [] } });
    }

    const events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { eventDate: 'desc' },
    });

    const eventStats = await Promise.all(
      events.map(async (event) => {
        const where = { eventId: event.id, bhaktoId: { in: bhaktoIds } };
        const [total, present] = await Promise.all([
          prisma.attendance.count({ where }),
          prisma.attendance.count({ where: { ...where, isPresent: true } }),
        ]);
        const rate = total > 0 ? Math.round((present / total) * 100) : 0;
        return {
          id:        event.id,
          name:      event.name,
          eventDate: event.eventDate,
          location:  event.location,
          total,
          present,
          absent:    total - present,
          rate,
        };
      })
    );

    return res.json({
      success: true,
      data: { leaderName, bhaktoCount: bhaktoIds.length, events: eventStats },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getEventReport, getEventReportDetail, getLeaderSummary, getLeaderDetail };
