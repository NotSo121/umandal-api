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

// GET /api/attendance/:eventId
// ADMIN → all active bhaktos; USER → only their leader's bhaktos
const getAttendanceByEvent = async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Build bhakto filter based on role
    const isAdmin = req.user.role === 'ADMIN';
    let bhaktoWhere = { isActive: true };

    if (!isAdmin) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.json({ success: true, data: { event, attendance: [] } });
      }
      bhaktoWhere.referenceBy = leaderName;
    }

    const bhaktos = await prisma.bhakto.findMany({
      where: bhaktoWhere,
      select: { id: true, fullName: true, mobileNo: true, photoUrl: true },
      orderBy: { fullName: 'asc' },
    });

    // Get existing attendance records for this event
    const attendances = await prisma.attendance.findMany({ where: { eventId } });
    const attendanceMap = {};
    attendances.forEach((a) => { attendanceMap[a.bhaktoId] = a; });

    const result = bhaktos.map((b) => ({
      bhaktoId:  b.id,
      fullName:  b.fullName,
      mobileNo:  b.mobileNo,
      photoUrl:  b.photoUrl,
      isPresent: attendanceMap[b.id]?.isPresent || false,
      remarks:   attendanceMap[b.id]?.remarks   || null,
    }));

    return res.json({ success: true, data: { event, attendance: result } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/attendance/:eventId/save
// ADMIN → can save for anyone; USER → only their own bhaktos
const saveAttendance = async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const { attendance } = req.body;

    if (!Array.isArray(attendance) || attendance.length === 0) {
      return res.status(400).json({ success: false, error: 'Attendance array is required' });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Attendance locked check
    if (!event.isOpen) {
      return res.status(403).json({ success: false, error: 'Attendance is locked for this event. Contact admin to unlock.' });
    }

    // Non-admin: validate all bhaktoIds belong to their group
    if (req.user.role !== 'ADMIN') {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.status(403).json({ success: false, error: 'Your account is not linked to a leader' });
      }
      const bhaktoIds = attendance.map((a) => parseInt(a.bhaktoId));
      const valid = await prisma.bhakto.findMany({
        where: { id: { in: bhaktoIds }, referenceBy: leaderName },
        select: { id: true },
      });
      const validIds = new Set(valid.map((b) => b.id));
      const invalid = bhaktoIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return res.status(403).json({ success: false, error: 'Access denied: some bhaktos do not belong to you' });
      }
    }

    const upserts = attendance.map((item) =>
      prisma.attendance.upsert({
        where: {
          bhaktoId_eventId: {
            bhaktoId: parseInt(item.bhaktoId),
            eventId,
          },
        },
        update: {
          isPresent: Boolean(item.isPresent),
          remarks:   item.remarks || null,
        },
        create: {
          bhaktoId:  parseInt(item.bhaktoId),
          eventId,
          isPresent: Boolean(item.isPresent),
          remarks:   item.remarks || null,
        },
      })
    );

    await prisma.$transaction(upserts);

    return res.json({ success: true, data: `Attendance saved for ${attendance.length} bhakto` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/attendance/bhakto/:bhaktoId
const getAttendanceByBhakto = async (req, res) => {
  try {
    const bhaktoId = parseInt(req.params.bhaktoId);

    const bhakto = await prisma.bhakto.findUnique({ where: { id: bhaktoId } });
    if (!bhakto) {
      return res.status(404).json({ success: false, error: 'Bhakto not found' });
    }

    const attendances = await prisma.attendance.findMany({
      where: { bhaktoId },
      include: {
        event: {
          select: { id: true, name: true, eventDate: true, location: true },
        },
      },
      orderBy: { event: { eventDate: 'desc' } },
    });

    const total   = attendances.length;
    const present = attendances.filter((a) => a.isPresent).length;
    const absent  = total - present;

    return res.json({
      success: true,
      data: {
        bhakto:  { id: bhakto.id, fullName: bhakto.fullName },
        summary: { total, present, absent },
        history: attendances,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getAttendanceByEvent, saveAttendance, getAttendanceByBhakto };
