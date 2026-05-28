const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/attendance/:eventId
// SUPER_ADMIN → all bhaktos
// ADMIN       → own pocket (flagged) + unassigned bhaktos
// USER        → self (top) + own pocket
const getAttendanceByEvent = async (req, res) => {
  try {
    const eventId      = parseInt(req.params.eventId);
    const userId       = parseInt(req.user.sub);
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isAdmin      = req.user.role === 'ADMIN';

    // ── Parallel fetch: event + attendance records + user (with linked bhakto) ──
    const [event, attendances, userRecord] = await Promise.all([
      prisma.event.findUnique({ where: { id: eventId } }),
      prisma.attendance.findMany({ where: { eventId } }),
      !isSuperAdmin
        ? prisma.user.findUnique({
            where:  { id: userId },
            select: {
              bhaktoId: true,
              bhakto:   { select: { id: true, fullName: true, mobileNo: true, photoUrl: true } },
            },
          })
        : Promise.resolve(null),
    ]);

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const attendanceMap = {};
    attendances.forEach((a) => { attendanceMap[a.bhaktoId] = a; });

    const mapBhakto = (b, extras = {}) => ({
      bhaktoId:   b.id,
      fullName:   b.fullName,
      mobileNo:   b.mobileNo,
      photoUrl:   b.photoUrl,
      isPresent:  attendanceMap[b.id] ? attendanceMap[b.id].isPresent : null,
      remarks:    attendanceMap[b.id]?.remarks   || null,
      isMyPocket: false,
      isSelf:     false,
      ...extras,
    });

    // ── SUPER_ADMIN: all bhaktos ──────────────────────────────────────────────
    if (isSuperAdmin) {
      const bhaktos = await prisma.bhakto.findMany({
        where:   { isActive: true },
        select:  { id: true, fullName: true, mobileNo: true, photoUrl: true },
        orderBy: { fullName: 'asc' },
      });
      return res.json({ success: true, data: { event, attendance: bhaktos.map((b) => mapBhakto(b)) } });
    }

    // selfBhakto and leaderName now come from the single parallel query above
    const selfBhakto = userRecord?.bhakto ?? null;
    const leaderName = selfBhakto?.fullName ?? null;

    // ── USER: self (top) + pocket members ────────────────────────────────────
    if (!isAdmin) {
      if (!selfBhakto) {
        return res.json({ success: true, data: { event, attendance: [] } });
      }

      const pocketBhaktos = leaderName
        ? await prisma.bhakto.findMany({
            where:   { isActive: true, referenceBy: leaderName },
            select:  { id: true, fullName: true, mobileNo: true, photoUrl: true },
            orderBy: { fullName: 'asc' },
          })
        : [];

      const pocketIdSet = new Set(pocketBhaktos.map((b) => b.id));
      const selfEntry   = !pocketIdSet.has(selfBhakto.id) ? selfBhakto : null;

      return res.json({
        success: true,
        data: {
          event,
          attendance: [
            ...(selfEntry ? [mapBhakto(selfEntry, { isSelf: true })] : []),
            ...pocketBhaktos.map((b) => mapBhakto(b)),
          ],
        },
      });
    }

    // ── ADMIN: own pocket (flagged) + unassigned bhaktos ─────────────────────
    let pocketIds   = new Set();
    let bhaktoWhere;

    if (leaderName) {
      // Fetch pocket ids + build where clause in parallel
      const [pocket] = await Promise.all([
        prisma.bhakto.findMany({
          where:  { isActive: true, referenceBy: leaderName },
          select: { id: true },
        }),
      ]);
      pocket.forEach((b) => pocketIds.add(b.id));
      bhaktoWhere = {
        isActive: true,
        OR: [{ referenceBy: null }, { referenceBy: leaderName }],
      };
    } else {
      bhaktoWhere = { isActive: true, referenceBy: null };
    }

    const bhaktos = await prisma.bhakto.findMany({
      where:   bhaktoWhere,
      select:  { id: true, fullName: true, mobileNo: true, photoUrl: true },
      orderBy: { fullName: 'asc' },
    });

    return res.json({
      success: true,
      data: { event, attendance: bhaktos.map((b) => mapBhakto(b, { isMyPocket: pocketIds.has(b.id) })) },
    });
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

    // ADMIN / USER scope validation (single user fetch covers both)
    if (req.user.role !== 'SUPER_ADMIN') {
      const userId     = parseInt(req.user.sub);
      const bhaktoIds  = attendance.map((a) => parseInt(a.bhaktoId));

      // One query: get user + linked bhakto (name) instead of two sequential queries
      const userRecord = await prisma.user.findUnique({
        where:  { id: userId },
        select: { bhaktoId: true, bhakto: { select: { fullName: true } } },
      });
      const selfBhaktoId = userRecord?.bhaktoId ?? null;
      const leaderName   = userRecord?.bhakto?.fullName ?? null;

      if (!leaderName && !selfBhaktoId) {
        return res.status(403).json({ success: false, error: 'Your account is not linked to a leader' });
      }

      const validIds = new Set();

      if (req.user.role === 'ADMIN') {
        // ADMIN: unassigned + own pocket — run both lookups in parallel
        const [unassigned, pocket] = await Promise.all([
          prisma.bhakto.findMany({
            where:  { id: { in: bhaktoIds }, referenceBy: null },
            select: { id: true },
          }),
          leaderName
            ? prisma.bhakto.findMany({
                where:  { id: { in: bhaktoIds }, referenceBy: leaderName },
                select: { id: true },
              })
            : Promise.resolve([]),
        ]);
        unassigned.forEach((b) => validIds.add(b.id));
        pocket.forEach((b) => validIds.add(b.id));
      } else {
        // USER: self + pocket — run pocket lookup only (self already known)
        if (selfBhaktoId) validIds.add(selfBhaktoId);
        if (leaderName) {
          const pocket = await prisma.bhakto.findMany({
            where:  { id: { in: bhaktoIds }, referenceBy: leaderName },
            select: { id: true },
          });
          pocket.forEach((b) => validIds.add(b.id));
        }
      }

      const invalid = bhaktoIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        return res.status(403).json({ success: false, error: 'Access denied: some bhaktos are outside your scope' });
      }
    }

    // null isPresent = not marked → delete record; true/false → upsert
    const toDelete = attendance.filter((item) => item.isPresent === null || item.isPresent === undefined);
    const toUpsert = attendance.filter((item) => item.isPresent === true || item.isPresent === false);

    const operations = [
      ...toDelete.map((item) =>
        prisma.attendance.deleteMany({
          where: { bhaktoId: parseInt(item.bhaktoId), eventId },
        })
      ),
      ...toUpsert.map((item) =>
        prisma.attendance.upsert({
          where: { bhaktoId_eventId: { bhaktoId: parseInt(item.bhaktoId), eventId } },
          update: { isPresent: item.isPresent, remarks: item.remarks || null },
          create: { bhaktoId: parseInt(item.bhaktoId), eventId, isPresent: item.isPresent, remarks: item.remarks || null },
        })
      ),
    ];

    await prisma.$transaction(operations);

    res.json({ success: true, data: `Attendance saved for ${attendance.length} bhakto` });

    // Fire-and-forget: auto isIrregular flag
    setImmediate(async () => {
      try {
        if (!event.eventCategoryId) return;

        // Reset isIrregular for anyone who just came present
        const presentIds = attendance
          .filter((a) => a.isPresent === true)
          .map((a) => parseInt(a.bhaktoId));
        if (presentIds.length > 0) {
          await prisma.bhakto.updateMany({
            where: { id: { in: presentIds }, isIrregular: true },
            data:  { isIrregular: false },
          });
        }

        // Set isIrregular for anyone with 4 consecutive absences in this category
        const absentIds = attendance
          .filter((a) => a.isPresent === false)
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

            if (last4.length === 4 && last4.every((a) => a.isPresent === false)) {
              await prisma.bhakto.update({
                where: { id: bhaktoId },
                data:  { isIrregular: true },
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
    const present = attendances.filter((a) => a.isPresent === true).length;
    const absent  = attendances.filter((a) => a.isPresent === false).length;

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
