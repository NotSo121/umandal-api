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
// SUPER_ADMIN → all bhaktos, no pocket marking
// ADMIN → all bhaktos; pocket bhaktos flagged with isMyPocket=true if bhaktoId linked
// USER → only their leader's bhaktos (scoped list, isMyPocket always false)
const getAttendanceByEvent = async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const isAdmin      = ['ADMIN','SUPER_ADMIN'].includes(req.user.role);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';

    // Get existing attendance records for this event (needed by all branches)
    const attendances = await prisma.attendance.findMany({ where: { eventId } });
    const attendanceMap = {};
    attendances.forEach((a) => { attendanceMap[a.bhaktoId] = a; });

    const mapBhakto = (b, extras = {}) => ({
      bhaktoId:   b.id,
      fullName:   b.fullName,
      mobileNo:   b.mobileNo,
      photoUrl:   b.photoUrl,
      isPresent:  attendanceMap[b.id]?.isPresent || false,
      remarks:    attendanceMap[b.id]?.remarks   || null,
      isMyPocket: false,
      isSelf:     false,
      ...extras,
    });

    if (!isAdmin) {
      // USER: own bhakto (self) at top + pocket members below
      const userId     = parseInt(req.user.sub);
      const userRecord = await prisma.user.findUnique({
        where:  { id: userId },
        select: { bhaktoId: true },
      });
      const selfBhaktoId = userRecord?.bhaktoId ?? null;
      const leaderName   = await getLeaderName(userId);

      if (!leaderName && !selfBhaktoId) {
        return res.json({ success: true, data: { event, attendance: [] } });
      }

      // Pocket members (referenceBy = leader's fullName)
      const pocketBhaktos = leaderName
        ? await prisma.bhakto.findMany({
            where:   { isActive: true, referenceBy: leaderName },
            select:  { id: true, fullName: true, mobileNo: true, photoUrl: true },
            orderBy: { fullName: 'asc' },
          })
        : [];

      // Self bhakto (only if not already in pocket)
      const pocketIdSet = new Set(pocketBhaktos.map((b) => b.id));
      let selfBhakto = null;
      if (selfBhaktoId && !pocketIdSet.has(selfBhaktoId)) {
        selfBhakto = await prisma.bhakto.findUnique({
          where:  { id: selfBhaktoId },
          select: { id: true, fullName: true, mobileNo: true, photoUrl: true },
        });
      }

      const result = [
        ...(selfBhakto ? [mapBhakto(selfBhakto, { isSelf: true })] : []),
        ...pocketBhaktos.map((b) => mapBhakto(b)),
      ];

      return res.json({ success: true, data: { event, attendance: result } });
    }

    // SUPER_ADMIN → all bhaktos, no pocket marking
    if (isSuperAdmin) {
      const bhaktos = await prisma.bhakto.findMany({
        where:   { isActive: true },
        select:  { id: true, fullName: true, mobileNo: true, photoUrl: true },
        orderBy: { fullName: 'asc' },
      });
      const result = bhaktos.map((b) => mapBhakto(b));
      return res.json({ success: true, data: { event, attendance: result } });
    }

    // ADMIN → own pocket (flagged) + unassigned bhaktos only
    const leaderName = await getLeaderName(req.user.sub);
    let pocketIds    = new Set();
    let bhaktoWhere;

    if (leaderName) {
      const pocket = await prisma.bhakto.findMany({
        where:  { isActive: true, referenceBy: leaderName },
        select: { id: true },
      });
      pocketIds   = new Set(pocket.map((b) => b.id));
      bhaktoWhere = {
        isActive: true,
        OR: [{ referenceBy: null }, { referenceBy: leaderName }],
      };
    } else {
      // ADMIN without linked bhakto: only unassigned
      bhaktoWhere = { isActive: true, referenceBy: null };
    }

    const bhaktos = await prisma.bhakto.findMany({
      where:   bhaktoWhere,
      select:  { id: true, fullName: true, mobileNo: true, photoUrl: true },
      orderBy: { fullName: 'asc' },
    });

    const result = bhaktos.map((b) => mapBhakto(b, { isMyPocket: pocketIds.has(b.id) }));

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

    // ADMIN (not SUPER_ADMIN): can only save unassigned + own pocket
    if (req.user.role === 'ADMIN') {
      const userId     = parseInt(req.user.sub);
      const leaderName = await getLeaderName(userId);
      const bhaktoIds  = attendance.map((a) => parseInt(a.bhaktoId));
      const validIds   = new Set();

      // Allow unassigned bhaktos
      const unassigned = await prisma.bhakto.findMany({
        where:  { id: { in: bhaktoIds }, referenceBy: null },
        select: { id: true },
      });
      unassigned.forEach((b) => validIds.add(b.id));

      // Allow own pocket
      if (leaderName) {
        const pocket = await prisma.bhakto.findMany({
          where:  { id: { in: bhaktoIds }, referenceBy: leaderName },
          select: { id: true },
        });
        pocket.forEach((b) => validIds.add(b.id));
      }

      const invalid = bhaktoIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return res.status(403).json({ success: false, error: 'Access denied: you can only save attendance for unassigned bhaktos or your own pocket' });
      }
    }

    // USER: validate all bhaktoIds belong to their group (pocket + self)
    if (!['ADMIN','SUPER_ADMIN'].includes(req.user.role)) {
      const userId     = parseInt(req.user.sub);
      const userRecord = await prisma.user.findUnique({
        where:  { id: userId },
        select: { bhaktoId: true },
      });
      const selfBhaktoId = userRecord?.bhaktoId ?? null;
      const leaderName   = await getLeaderName(userId);

      if (!leaderName && !selfBhaktoId) {
        return res.status(403).json({ success: false, error: 'Your account is not linked to a leader' });
      }

      const bhaktoIds = attendance.map((a) => parseInt(a.bhaktoId));
      const validIds  = new Set();

      // Allow own bhakto
      if (selfBhaktoId) validIds.add(selfBhaktoId);

      // Allow pocket members
      if (leaderName) {
        const pocket = await prisma.bhakto.findMany({
          where:  { id: { in: bhaktoIds }, referenceBy: leaderName },
          select: { id: true },
        });
        pocket.forEach((b) => validIds.add(b.id));
      }

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

    res.json({ success: true, data: `Attendance saved for ${attendance.length} bhakto` });

    // Fire-and-forget: auto-assign "Irregular" category for 4-streak absences
    setImmediate(async () => {
      try {
        if (!event.eventCategoryId) return;

        const irregularCategory = await prisma.category.findFirst({
          where:  { name: 'Irregular' },
          select: { id: true },
        });
        if (!irregularCategory) return;

        const absentIds = attendance
          .filter((a) => !a.isPresent)
          .map((a) => parseInt(a.bhaktoId));
        if (absentIds.length === 0) return;

        await Promise.all(
          absentIds.map(async (bhaktoId) => {
            const last4 = await prisma.attendance.findMany({
              where:   { bhaktoId, event: { eventCategoryId: event.eventCategoryId } },
              orderBy: { event: { eventDate: 'desc' } },
              take:    4,
              select:  { isPresent: true },
            });

            if (last4.length === 4 && last4.every((a) => !a.isPresent)) {
              await prisma.bhakto.update({
                where: { id: bhaktoId },
                data:  { categoryId: irregularCategory.id },
              });
            }
          })
        );
      } catch (err) {
        console.error('[irregular-check] error:', err.message);
      }
    });

    return;
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
