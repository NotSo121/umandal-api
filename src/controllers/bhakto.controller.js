const { PrismaClient } = require('@prisma/client');
const { uploadPhoto } = require('../services/supabase.service');
const { parseExcel, generateExcel } = require('../services/excel.service');

const prisma = new PrismaClient();

// GET /api/bhakto
const getAllBhakto = async (req, res) => {
  try {
    const { name, mandalId, societyId, categoryId, isActive, isLeader, referenceBy } = req.query;

    const filters = {};

    // Search by name OR mobile number
    if (name) {
      filters.OR = [
        { fullName: { contains: name, mode: 'insensitive' } },
        { mobileNo: { contains: name, mode: 'insensitive' } },
      ];
    }

    if (mandalId)    filters.mandalId    = parseInt(mandalId);
    if (societyId)   filters.societyId   = parseInt(societyId);
    if (categoryId)  filters.categoryId  = parseInt(categoryId);
    if (referenceBy) filters.referenceBy = referenceBy;
    if (isActive  !== undefined) filters.isActive  = isActive  === 'true';
    if (isLeader  !== undefined) filters.isLeader  = isLeader  === 'true';

    const bhaktos = await prisma.bhakto.findMany({
      where: filters,
      include: {
        mandal:   { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        society:  { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    return res.json({ success: true, data: bhaktos });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/bhakto/:id
const getBhaktoById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const bhakto = await prisma.bhakto.findUnique({
      where: { id },
      include: {
        mandal:   { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        society:  { select: { id: true, name: true } },
      },
    });

    if (!bhakto) {
      return res.status(404).json({ success: false, error: 'Bhakto not found' });
    }

    return res.json({ success: true, data: bhakto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/bhakto
const createBhakto = async (req, res) => {
  try {
    const {
      fullName, houseNo, societyId, mandalId, mobileNo,
      dateOfBirth, gender, categoryId, occupation,
      referenceBy, isLeader, isActive, remarks,
    } = req.body;

    if (!fullName) {
      return res.status(400).json({ success: false, error: 'Full name is required' });
    }

    // For non-admin, force referenceBy to their own leader name
    let finalReferenceBy = referenceBy;
    if (req.user.role !== 'ADMIN') {
      console.log('[createBhakto] userId:', req.user.sub, 'role:', req.user.role);
      const leaderName = await getLeaderName(req.user.sub);
      console.log('[createBhakto] leaderName resolved:', leaderName);
      if (!leaderName) {
        return res.status(403).json({ success: false, error: 'Your account is not linked to a leader. Please log out and log back in, then try again.' });
      }
      finalReferenceBy = leaderName;
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = await uploadPhoto(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    const bhakto = await prisma.bhakto.create({
      data: {
        fullName,
        houseNo,
        societyId:   societyId   ? parseInt(societyId)   : null,
        mandalId:    mandalId    ? parseInt(mandalId)    : null,
        mobileNo,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender:      gender      || 'MALE',
        categoryId:  categoryId  ? parseInt(categoryId)  : null,
        occupation,
        referenceBy: finalReferenceBy,
        isLeader:    req.user.role === 'ADMIN' ? (isLeader === 'true' || isLeader === true) : false,
        isActive:    isActive    !== 'false' && isActive !== false,
        remarks,
        photoUrl,
      },
    });

    return res.status(201).json({ success: true, data: bhakto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Helper: resolve logged-in user's linked leader name
// Uses raw SQL so it works regardless of which Prisma client version is deployed
const getLeaderName = async (userId) => {
  try {
    // Raw SQL join: User.bhaktoId → Bhakto.fullName
    const rows = await prisma.$queryRaw`
      SELECT b."fullName"
      FROM "User" u
      LEFT JOIN "Bhakto" b ON b.id = u."bhaktoId"
      WHERE u.id = ${userId}
      LIMIT 1
    `;
    return rows[0]?.fullName ?? null;
  } catch (e) {
    console.error('getLeaderName error:', e);
    return null;
  }
};

// PUT /api/bhakto/:id
const updateBhakto = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.bhakto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bhakto not found' });
    }

    // Ownership check for non-admin
    if (req.user.role !== 'ADMIN') {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName || existing.referenceBy !== leaderName) {
        return res.status(403).json({ success: false, error: 'Access denied: not your bhakto' });
      }
    }

    const {
      fullName, houseNo, societyId, mandalId, mobileNo,
      dateOfBirth, gender, categoryId, occupation,
      referenceBy, isLeader, isActive, remarks,
    } = req.body;

    let photoUrl = existing.photoUrl;
    if (req.file) {
      photoUrl = await uploadPhoto(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    const bhakto = await prisma.bhakto.update({
      where: { id },
      data: {
        fullName:    fullName    || existing.fullName,
        houseNo,
        societyId:   societyId   ? parseInt(societyId)   : null,
        mandalId:    mandalId    ? parseInt(mandalId)    : null,
        mobileNo,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender:      gender      || existing.gender,
        categoryId:  categoryId  ? parseInt(categoryId)  : null,
        occupation,
        referenceBy,
        isLeader:    isLeader !== undefined ? (isLeader === 'true' || isLeader === true) : existing.isLeader,
        isActive:    isActive  !== undefined ? (isActive  === 'true' || isActive  === true) : existing.isActive,
        remarks,
        photoUrl,
      },
    });

    return res.json({ success: true, data: bhakto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// DELETE /api/bhakto/:id
const deleteBhakto = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.bhakto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bhakto not found' });
    }

    // Ownership check for non-admin
    if (req.user.role !== 'ADMIN') {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName || existing.referenceBy !== leaderName) {
        return res.status(403).json({ success: false, error: 'Access denied: not your bhakto' });
      }
    }

    await prisma.bhakto.delete({ where: { id } });

    return res.json({ success: true, data: 'Bhakto deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PATCH /api/bhakto/:id/toggle
const toggleBhakto = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.bhakto.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Bhakto not found' });
    }

    const bhakto = await prisma.bhakto.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: { id: true, fullName: true, isActive: true },
    });

    return res.json({ success: true, data: bhakto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/bhakto/import
const importBhakto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Excel file is required' });
    }

    const rows = parseExcel(req.file.buffer);
    let created = 0;

    for (const row of rows) {
      if (!row.fullName) continue;
      await prisma.bhakto.create({
        data: {
          fullName:    String(row.fullName),
          houseNo:     row.houseNo     ? String(row.houseNo)     : null,
          society:     row.society     ? String(row.society)     : null,
          mobileNo:    row.mobileNo    ? String(row.mobileNo)    : null,
          occupation:  row.occupation  ? String(row.occupation)  : null,
          referenceBy: row.referenceBy ? String(row.referenceBy) : null,
          gender:      row.gender      ? String(row.gender).toUpperCase() : 'MALE',
          remarks:     row.remarks     ? String(row.remarks)     : null,
          isLeader:    row.isLeader    === true || row.isLeader  === 'true',
          dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
        },
      });
      created++;
    }

    return res.json({ success: true, data: `${created} bhakto imported successfully` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/bhakto/export
const exportBhakto = async (req, res) => {
  try {
    const bhaktos = await prisma.bhakto.findMany({
      include: {
        mandal:   { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    const data = bhaktos.map((b) => ({
      ID:          b.id,
      'Full Name': b.fullName,
      'House No':  b.houseNo   || '',
      Society:     b.society   || '',
      Mandal:      b.mandal?.name   || '',
      Category:    b.category?.name || '',
      Mobile:      b.mobileNo  || '',
      DOB:         b.dateOfBirth ? b.dateOfBirth.toISOString().split('T')[0] : '',
      Gender:      b.gender,
      Occupation:  b.occupation  || '',
      'Reference By': b.referenceBy || '',
      'Is Leader': b.isLeader ? 'Yes' : 'No',
      'Is Active': b.isActive ? 'Yes' : 'No',
      Remarks:     b.remarks  || '',
    }));

    const buffer = generateExcel(data);

    res.setHeader('Content-Disposition', 'attachment; filename=bhakto-export.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = {
  getAllBhakto, getBhaktoById, createBhakto,
  updateBhakto, deleteBhakto, toggleBhakto,
  importBhakto, exportBhakto,
};