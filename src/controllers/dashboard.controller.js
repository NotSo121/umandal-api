const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getLeaderName = async (userId) => {
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
};

const getBhaktoIdsForLeader = async (leaderName) => {
  const bhaktos = await prisma.bhakto.findMany({
    where: { referenceBy: leaderName },
    select: { id: true },
  });
  return bhaktos.map((b) => b.id);
};

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

    // ── Pocket count for anyone with a linked bhaktoId (SUPER_ADMIN always global) ──
    let pocketCount = null;
    if (req.user.role !== 'SUPER_ADMIN') {
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

// GET /api/dashboard/charts?tag=<seriesTag>
// tag is optional — auto-picks the tag with most events in last 90 days if omitted.
// trendLine: last 6 events for selectedTag sorted ASC, rate = present/total * 100.
// pocketBars: avg rate per leader across last 6 events; SUPER_ADMIN + ADMIN only.
// Scoping: SUPER_ADMIN = global; ADMIN+bhaktoId = pocket scoped; USER = pocket scoped.
const getCharts = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const isAdmin      = ['ADMIN', 'SUPER_ADMIN'].includes(req.user.role);

    // ── 1. Available tags from all active events ──
    const tagRows = await prisma.event.findMany({
      where:    { seriesTag: { not: null }, isActive: true },
      select:   { seriesTag: true },
      distinct: ['seriesTag'],
      orderBy:  { seriesTag: 'asc' },
    });
    const availableTags = tagRows.map((r) => r.seriesTag);

    if (availableTags.length === 0) {
      return res.json({ success: true, data: { selectedTag: null, availableTags: [], trendLine: [], pocketBars: [] } });
    }

    // ── 2. Determine selectedTag ──
    let selectedTag = req.query.tag || null;
    if (!selectedTag) {
      const ninety = new Date();
      ninety.setDate(ninety.getDate() - 90);
      const tagCounts = await prisma.event.groupBy({
        by:      ['seriesTag'],
        where:   { seriesTag: { not: null }, isActive: true, eventDate: { gte: ninety } },
        _count:  { id: true },
        orderBy: { _count: { id: 'desc' } },
        take:    1,
      });
      selectedTag = tagCounts.length > 0 ? tagCounts[0].seriesTag : availableTags[0];
    }

    // ── 3. Scoping for trendLine ──
    let bhaktoIds = null; // null = no filter (global)
    if (!isSuperAdmin) {
      const leaderName = await getLeaderName(req.user.sub);
      if (leaderName) {
        bhaktoIds = await getBhaktoIdsForLeader(leaderName);
      } else if (!isAdmin) {
        // USER with no linked bhakto — no pocket data
        bhaktoIds = [];
      }
      // ADMIN with no bhaktoId: bhaktoIds stays null (global)
    }

    // ── 4. Last 6 events for selectedTag (desc → take 6 → reverse to ASC) ──
    const last6Events = await prisma.event.findMany({
      where:   { seriesTag: selectedTag, isActive: true },
      orderBy: { eventDate: 'desc' },
      take:    6,
    });
    last6Events.reverse();

    // ── 5. TrendLine ──
    const trendLine = await Promise.all(
      last6Events.map(async (event) => {
        const where = { eventId: event.id };
        if (bhaktoIds !== null) where.bhaktoId = { in: bhaktoIds };

        const [total, present] = await Promise.all([
          prisma.attendance.count({ where }),
          prisma.attendance.count({ where: { ...where, isPresent: true } }),
        ]);
        return {
          eventId:   event.id,
          eventName: event.name,
          eventDate: event.eventDate.toISOString().split('T')[0],
          rate:      total > 0 ? Math.round((present / total) * 100) : 0,
        };
      })
    );

    // ── 6. PocketBars (SUPER_ADMIN and ADMIN only) ──
    let pocketBars = [];
    if (isAdmin && last6Events.length > 0) {
      const leaders = await prisma.bhakto.findMany({
        where:   { isLeader: true },
        select:  { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });

      const bars = await Promise.all(
        leaders.map(async (leader) => {
          const pocketIds = await getBhaktoIdsForLeader(leader.fullName);
          if (pocketIds.length === 0) return null;

          let rateSum = 0;
          let counted = 0;
          for (const event of last6Events) {
            const w = { eventId: event.id, bhaktoId: { in: pocketIds } };
            const [total, present] = await Promise.all([
              prisma.attendance.count({ where: w }),
              prisma.attendance.count({ where: { ...w, isPresent: true } }),
            ]);
            if (total > 0) {
              rateSum += (present / total) * 100;
              counted++;
            }
          }

          return {
            leaderName: leader.fullName,
            bhaktoId:   leader.id,
            rate:       counted > 0 ? Math.round(rateSum / counted) : 0,
          };
        })
      );

      pocketBars = bars.filter(Boolean).sort((a, b) => b.rate - a.rate);
    }

    return res.json({ success: true, data: { selectedTag, availableTags, trendLine, pocketBars } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getStats, getCharts };
