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
// SUPER_ADMIN: always global (optional ?referenceBy= filter)
// ADMIN + ?myTeam=true: scoped to own pocket (My Team Report)
// ADMIN (no myTeam flag): global with optional ?referenceBy= filter (Event Report)
// USER: always scoped to own pocket
const getEventReport = async (req, res) => {
  try {
    const { referenceBy } = req.query;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isAdmin      = ['ADMIN','SUPER_ADMIN'].includes(req.user.role);
    const myTeam       = req.query.myTeam === 'true';

    // Determine the leader filter
    let bhaktoIds = null; // null = no filter (all)
    if (isSuperAdmin) {
      if (referenceBy) bhaktoIds = await getBhaktoIdsForLeader(referenceBy);
    } else if (!isAdmin || myTeam) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.json({ success: true, data: [] });
      }
      bhaktoIds = await getBhaktoIdsForLeader(leaderName);
    } else {
      if (referenceBy) bhaktoIds = await getBhaktoIdsForLeader(referenceBy);
    }

    // Total bhaktos in scope — computed once, used as denominator for rate
    const totalBhaktos = bhaktoIds !== null
      ? bhaktoIds.length
      : await prisma.bhakto.count({ where: { isActive: true } });

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

        const [present, absent] = await Promise.all([
          prisma.attendance.count({ where: { ...attendanceWhere, isPresent: true } }),
          prisma.attendance.count({ where: { ...attendanceWhere, isPresent: false } }),
        ]);

        const notMarked = totalBhaktos - present - absent;
        const rate      = totalBhaktos > 0 ? Math.round((present / totalBhaktos) * 100) : 0;

        return {
          id:        event.id,
          name:      event.name,
          eventDate: event.eventDate,
          location:  event.location,
          isOpen:    event.isOpen,
          total:     totalBhaktos,
          present,
          absent,
          notMarked,
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
// Returns attendance records for one event, scoped by role/myTeam flag
const getEventReportDetail = async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const { referenceBy } = req.query;
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isAdmin      = ['ADMIN','SUPER_ADMIN'].includes(req.user.role);
    const myTeam       = req.query.myTeam === 'true';

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    let bhaktoIds = null;
    if (isSuperAdmin) {
      if (referenceBy) bhaktoIds = await getBhaktoIdsForLeader(referenceBy);
    } else if (!isAdmin || myTeam) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.json({ success: true, data: { event, attendance: [] } });
      }
      bhaktoIds = await getBhaktoIdsForLeader(leaderName);
    } else {
      if (referenceBy) bhaktoIds = await getBhaktoIdsForLeader(referenceBy);
    }

    const attendanceWhere = { eventId };
    if (bhaktoIds !== null) {
      attendanceWhere.bhaktoId = { in: bhaktoIds };
    }

    const totalBhaktos = bhaktoIds !== null
      ? bhaktoIds.length
      : await prisma.bhakto.count({ where: { isActive: true } });

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

    return res.json({ success: true, data: { event, attendance: attendances, totalBhaktos } });
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
// Event-wise stats for one leader's team.
// Non-SUPER_ADMIN with bhaktoId: auto-scopes to own leader (ignores ?name=).
const getLeaderDetail = async (req, res) => {
  try {
    let resolvedLeaderName = req.query.name;

    // Non-SUPER_ADMIN: if they have a linked bhaktoId, always scope to their own leader
    if (req.user.role !== 'SUPER_ADMIN') {
      const ownLeader = await getLeaderName(req.user.sub);
      if (ownLeader) resolvedLeaderName = ownLeader;
    }

    if (!resolvedLeaderName) {
      return res.status(400).json({ success: false, error: 'Leader name is required' });
    }

    const leaderName = resolvedLeaderName;
    const bhaktoIds = await getBhaktoIdsForLeader(leaderName);

    if (bhaktoIds.length === 0) {
      return res.json({ success: true, data: { leaderName, bhaktoCount: 0, events: [] } });
    }

    const events = await prisma.event.findMany({
      where: { isActive: true },
      orderBy: { eventDate: 'desc' },
    });

    const totalBhaktos = bhaktoIds.length;

    const eventStats = await Promise.all(
      events.map(async (event) => {
        const where = { eventId: event.id, bhaktoId: { in: bhaktoIds } };
        const [present, absent] = await Promise.all([
          prisma.attendance.count({ where: { ...where, isPresent: true } }),
          prisma.attendance.count({ where: { ...where, isPresent: false } }),
        ]);
        const notMarked = totalBhaktos - present - absent;
        const rate      = totalBhaktos > 0 ? Math.round((present / totalBhaktos) * 100) : 0;
        return {
          id:        event.id,
          name:      event.name,
          eventDate: event.eventDate,
          location:  event.location,
          total:     totalBhaktos,
          present,
          absent,
          notMarked,
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

// GET /api/reports/series
// Returns all EventCategory rows — for series report cards
const getSeriesTags = async (req, res) => {
  try {
    const categories = await prisma.eventCategory.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return res.json({ success: true, data: categories });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/reports/series/:categoryId
// Returns all events with that eventCategoryId, each with attendance stats.
// Same scoping rules as getEventReport:
//   SUPER_ADMIN: global
//   ADMIN + ?myTeam=true: pocket scoped
//   USER: pocket scoped
const getSeriesReport = async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isAdmin      = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
    const myTeam       = req.query.myTeam === 'true';

    let bhaktoIds = null;
    if (isSuperAdmin) {
      // no scoping
    } else if (!isAdmin || myTeam) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) return res.json({ success: true, data: [] });
      bhaktoIds = await getBhaktoIdsForLeader(leaderName);
    }

    const events = await prisma.event.findMany({
      where: { eventCategoryId: categoryId, isActive: true },
      orderBy: { eventDate: 'asc' },
    });

    const totalBhaktos = bhaktoIds !== null
      ? bhaktoIds.length
      : await prisma.bhakto.count({ where: { isActive: true } });

    const result = await Promise.all(
      events.map(async (event) => {
        const attendanceWhere = { eventId: event.id };
        if (bhaktoIds !== null) {
          attendanceWhere.bhaktoId = { in: bhaktoIds };
        }

        const [present, absent] = await Promise.all([
          prisma.attendance.count({ where: { ...attendanceWhere, isPresent: true } }),
          prisma.attendance.count({ where: { ...attendanceWhere, isPresent: false } }),
        ]);

        const notMarked     = totalBhaktos - present - absent;
        const attendanceRate = totalBhaktos > 0 ? Math.round((present / totalBhaktos) * 100) : 0;

        return {
          eventId:        event.id,
          name:           event.name,
          eventDate:      event.eventDate,
          totalBhakto:    totalBhaktos,
          totalPresent:   present,
          totalAbsent:    absent,
          notMarked,
          attendanceRate,
        };
      })
    );

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getEventReport, getEventReportDetail, getLeaderSummary, getLeaderDetail, getSeriesTags, getSeriesReport };
