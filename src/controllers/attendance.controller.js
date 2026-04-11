const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/attendance/:eventId
// Returns all bhakto with their attendance status for this event
const getAttendanceByEvent = async (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Get all active bhakto
    const bhaktos = await prisma.bhakto.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, mobileNo: true, photoUrl: true },
      orderBy: { fullName: 'asc' },
    });

    // Get existing attendance records for this event
    const attendances = await prisma.attendance.findMany({
      where: { eventId },
    });

    const attendanceMap = {};
    attendances.forEach((a) => {
      attendanceMap[a.bhaktoId] = a;
    });

    // Merge bhakto list with attendance status
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
// Bulk upsert attendance for an event
// Body: { attendance: [{ bhaktoId, isPresent, remarks }] }
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

    // Bulk upsert using Prisma
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
// Attendance history of a single bhakto
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

    const total    = attendances.length;
    const present  = attendances.filter((a) => a.isPresent).length;
    const absent   = total - present;

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