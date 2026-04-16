const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const { uploadPhoto } = require('../services/supabase.service');
const { generateExcel } = require('../services/excel.service');

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
    if (!['ADMIN','SUPER_ADMIN'].includes(req.user.role)) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName) {
        return res.status(403).json({
          success: false,
          error: 'Your account is not linked to a leader. Ask admin to link you, then log out and log back in.',
        });
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
        isLeader:    ['ADMIN','SUPER_ADMIN'].includes(req.user.role) ? (isLeader === 'true' || isLeader === true) : false,
        isActive:    isActive    !== 'false' && isActive !== false,
        remarks,
        photoUrl,
        createdBy: req.user.username,
        updatedBy: req.user.username,
      },
    });

    return res.status(201).json({ success: true, data: bhakto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// Helper: resolve logged-in user's linked leader name
const getLeaderName = async (userId) => {
  try {
    const uid = parseInt(userId);
    console.log('[getLeaderName] looking up userId:', uid);
    // Step 1: get the user's bhaktoId (scalar only)
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { bhaktoId: true },
    });
    console.log('[getLeaderName] user.bhaktoId:', user?.bhaktoId);
    if (!user?.bhaktoId) return null;
    // Step 2: get the bhakto's fullName
    const bhakto = await prisma.bhakto.findUnique({
      where: { id: user.bhaktoId },
      select: { fullName: true },
    });
    console.log('[getLeaderName] bhakto.fullName:', bhakto?.fullName);
    return bhakto?.fullName ?? null;
  } catch (e) {
    console.error('[getLeaderName] error:', e.message);
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
    if (!['ADMIN','SUPER_ADMIN'].includes(req.user.role)) {
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
    } else if (req.body.removePhoto === 'true') {
      photoUrl = null;
    }

    const bhakto = await prisma.bhakto.update({
      where: { id },
      data: {
        fullName:    fullName    !== undefined ? (fullName    || existing.fullName) : existing.fullName,
        houseNo:     houseNo     !== undefined ? houseNo     : existing.houseNo,
        societyId:   societyId   !== undefined ? (societyId   ? parseInt(societyId)  : null) : existing.societyId,
        mandalId:    mandalId    !== undefined ? (mandalId    ? parseInt(mandalId)   : null) : existing.mandalId,
        mobileNo:    mobileNo    !== undefined ? mobileNo    : existing.mobileNo,
        dateOfBirth: dateOfBirth !== undefined ? (dateOfBirth ? new Date(dateOfBirth) : null) : existing.dateOfBirth,
        gender:      gender      !== undefined ? (gender      || existing.gender)    : existing.gender,
        categoryId:  categoryId  !== undefined ? (categoryId  ? parseInt(categoryId) : null) : existing.categoryId,
        occupation:  occupation  !== undefined ? occupation  : existing.occupation,
        referenceBy: referenceBy !== undefined ? referenceBy : existing.referenceBy,
        isLeader:    isLeader    !== undefined ? (isLeader === 'true' || isLeader === true) : existing.isLeader,
        isActive:    isActive    !== undefined ? (isActive  === 'true' || isActive  === true) : existing.isActive,
        remarks:     remarks     !== undefined ? remarks     : existing.remarks,
        photoUrl,
        updatedBy: req.user.username,
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
    if (!['ADMIN','SUPER_ADMIN'].includes(req.user.role)) {
      const leaderName = await getLeaderName(req.user.sub);
      if (!leaderName || existing.referenceBy !== leaderName) {
        return res.status(403).json({ success: false, error: 'Access denied: not your bhakto' });
      }
    }

    // 1. Unlink any user whose bhaktoId points here (unique FK — must clear first)
    await prisma.user.updateMany({
      where: { bhaktoId: id },
      data:  { bhaktoId: null },
    });

    // 2. Delete all attendance records for this bhakto (FK constraint)
    await prisma.attendance.deleteMany({ where: { bhaktoId: id } });

    // 3. Now safe to delete
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

// Helper: parse date of birth from multiple formats
// Handles: JS Date (cellDates:true), Excel serial number, 'YYYY-MM-DD', 'DD/MM/YYYY'
const parseDOB = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;

  // Already a JS Date object (xlsx cellDates:true)
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }

  // Excel serial number → JS Date
  // Excel epoch is Dec 30, 1899 (accounts for the 1900 leap-year bug)
  if (typeof raw === 'number') {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // 'YYYY-MM-DD' — our own export format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(`${str}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // 'DD/MM/YYYY' — common user-entered format
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
};

// POST /api/bhakto/import
const importBhakto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Excel file is required' });
    }

    // Parse with cellDates:true so Excel date cells come back as JS Date objects
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rows     = XLSX.utils.sheet_to_json(sheet);

    const total  = rows.length;
    let imported = 0;
    let skipped  = 0;
    const errors = [];

    // Pre-load lookup tables once (avoids N+1 queries)
    const [allSocieties, allCategories, existingBhaktos] = await Promise.all([
      prisma.society.findMany({ select: { id: true, name: true } }),
      prisma.category.findMany({ select: { id: true, name: true } }),
      prisma.bhakto.findMany({ select: { fullName: true, mobileNo: true } }),
    ]);

    const societyMap  = new Map(allSocieties.map(s => [s.name.trim().toLowerCase(),  s.id]));
    const categoryMap = new Map(allCategories.map(c => [c.name.trim().toLowerCase(), c.id]));

    // Duplicate detection: fullName (case-insensitive) + mobileNo
    // Only checked when mobile is present in the row; intra-batch aware
    const byNameMobile = new Set(
      existingBhaktos
        .filter(b => b.mobileNo)
        .map(b => `${b.fullName.trim().toLowerCase()}|${b.mobileNo.trim()}`)
    );

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 2; // row 1 = header in Excel
      const name   = row['Full Name'] ? String(row['Full Name']).trim() : null;

      if (!name) {
        errors.push({ row: rowNum, name: '-', reason: 'Full Name is required' });
        skipped++;
        continue;
      }

      // Duplicate check: fullName + mobileNo (only when mobile is present in this row)
      const mobileRaw = row['Mobile'] ? String(row['Mobile']).trim() : null;
      if (mobileRaw) {
        const key = `${name.toLowerCase()}|${mobileRaw}`;
        if (byNameMobile.has(key)) {
          errors.push({ row: rowNum, name, reason: 'Duplicate: same name and mobile already exists' });
          skipped++;
          continue;
        }
      }

      // Society lookup — skip row if a society name is given but not found in DB
      let societyId = null;
      const societyName = row['Society'] ? String(row['Society']).trim() : null;
      if (societyName) {
        societyId = societyMap.get(societyName.toLowerCase()) ?? null;
        if (!societyId) {
          errors.push({ row: rowNum, name, reason: `Society '${societyName}' not found` });
          skipped++;
          continue;
        }
      }

      // Category lookup — skip row if a category name is given but not found in DB
      let categoryId = null;
      const categoryName = row['Category'] ? String(row['Category']).trim() : null;
      if (categoryName) {
        categoryId = categoryMap.get(categoryName.toLowerCase()) ?? null;
        if (!categoryId) {
          errors.push({ row: rowNum, name, reason: `Category '${categoryName}' not found` });
          skipped++;
          continue;
        }
      }

      // referenceBy — plain string field, store as-is (no FK); don't block row if absent
      const referenceBy = row['Reference By'] ? String(row['Reference By']).trim() : null;

      // DOB — multi-format parser
      const dateOfBirth = parseDOB(row['DOB']);

      // isActive — export writes 'Yes'/'No'; also accept 'Active'/'Inactive' for manual files
      let isActive = true;
      const isActiveRaw = row['Is Active'];
      if (isActiveRaw !== undefined && isActiveRaw !== null) {
        const val = String(isActiveRaw).trim().toLowerCase();
        isActive = val === 'yes' || val === 'active';
      }

      // isLeader — export writes 'Yes'/'No'
      let isLeader = false;
      const isLeaderRaw = row['Is Leader'];
      if (isLeaderRaw !== undefined && isLeaderRaw !== null) {
        const val = String(isLeaderRaw).trim().toLowerCase();
        isLeader = val === 'yes' || val === 'true';
      }

      // Gender — default MALE if missing or unrecognised
      let gender = 'MALE';
      const genderRaw = row['Gender'];
      if (genderRaw) {
        const g = String(genderRaw).trim().toUpperCase();
        if (['MALE', 'FEMALE', 'OTHER'].includes(g)) gender = g;
      }

      try {
        await prisma.bhakto.create({
          data: {
            fullName:    name,
            houseNo:     row['House No']   ? String(row['House No']).trim()   : null,
            mobileNo:    row['Mobile']     ? String(row['Mobile']).trim()     : null,
            occupation:  row['Occupation'] ? String(row['Occupation']).trim() : null,
            remarks:     row['Remarks']    ? String(row['Remarks']).trim()    : null,
            societyId,
            categoryId,
            referenceBy,
            dateOfBirth,
            gender,
            isLeader,
            isActive,
            createdBy: req.user.username,
            updatedBy: req.user.username,
          },
        });
        // Update set so duplicate rows within the same file are also caught
        if (mobileRaw) {
          byNameMobile.add(`${name.toLowerCase()}|${mobileRaw.trim()}`);
        }
        imported++;
      } catch (rowErr) {
        console.error(`[importBhakto] row ${rowNum} error:`, rowErr.message);
        errors.push({ row: rowNum, name, reason: rowErr.message });
        skipped++;
      }
    }

    return res.json({
      success: true,
      data: { total, imported, skipped, errors },
    });
  } catch (err) {
    console.error('[importBhakto] fatal:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/bhakto/import/sample — returns a sample .xlsx the user can fill in
const getBhaktoImportSample = (req, res) => {
  const sampleRows = [
    {
      'Full Name':    'Ramesh Patel',
      'Mobile':       '9876543210',
      'House No':     'B-12',
      'Society':      'Krishna Society',  // must match exact name in system
      'Gender':       'MALE',
      'DOB':          '1990-05-15',       // YYYY-MM-DD or DD/MM/YYYY
      'Occupation':   'Business',
      'Category':     'Yuva',             // must match exact name in system
      'Reference By': 'Leader Full Name', // optional — leader's full name
      'Is Leader':    'No',
      'Is Active':    'Yes',
      'Remarks':      '',
    },
  ];

  const buffer = generateExcel(sampleRows);
  res.setHeader('Content-Disposition', 'attachment; filename=bhakto-import-sample.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(buffer);
};

// GET /api/bhakto/export
const exportBhakto = async (req, res) => {
  try {
    const { name, societyId, categoryId, isActive, isLeader, referenceBy, columns, srNo } = req.query;

    // Build filters (same logic as getAllBhakto)
    const filters = {};
    if (name) {
      filters.OR = [
        { fullName: { contains: name, mode: 'insensitive' } },
        { mobileNo: { contains: name, mode: 'insensitive' } },
      ];
    }
    if (societyId)   filters.societyId   = parseInt(societyId);
    if (categoryId)  filters.categoryId  = parseInt(categoryId);
    if (referenceBy) filters.referenceBy = referenceBy;
    if (isActive  !== undefined && isActive  !== '') filters.isActive  = isActive  === 'true';
    if (isLeader  !== undefined && isLeader  !== '') filters.isLeader  = isLeader  === 'true';

    const bhaktos = await prisma.bhakto.findMany({
      where: filters,
      include: {
        mandal:   { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        society:  { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    // All available columns with extractor functions
    const allColumns = {
      'Full Name':    (b) => b.fullName,
      'Mobile':       (b) => b.mobileNo      || '',
      'House No':     (b) => b.houseNo        || '',
      'Society':      (b) => b.society?.name  || '',
      'Gender':       (b) => b.gender,
      'DOB':          (b) => b.dateOfBirth ? b.dateOfBirth.toISOString().split('T')[0] : '',
      'Occupation':   (b) => b.occupation     || '',
      'Category':     (b) => b.category?.name || '',
      'Reference By': (b) => b.referenceBy    || '',
      'Is Leader':    (b) => b.isLeader ? 'Yes' : 'No',
      'Is Active':    (b) => b.isActive  ? 'Yes' : 'No',
      'Remarks':      (b) => b.remarks        || '',
    };

    // Use requested columns in order, or all by default
    const selectedColumns = columns
      ? columns.split(',').map((c) => c.trim()).filter((c) => allColumns[c])
      : Object.keys(allColumns);

    const includeSrNo = srNo === 'true';
    const data = bhaktos.map((b, index) => {
      const row = {};
      if (includeSrNo) row['#'] = index + 1;
      for (const col of selectedColumns) {
        row[col] = allColumns[col](b);
      }
      return row;
    });

    const buffer = generateExcel(data);
    const timestamp = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Disposition', `attachment; filename=bhakto-export-${timestamp}.xlsx`);
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
  importBhakto, exportBhakto, getBhaktoImportSample,
};