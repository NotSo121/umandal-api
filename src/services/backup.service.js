const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BUCKET        = process.env.BACKUP_BUCKET || 'backups';
const MAX_MANUAL    = 5;
const MAX_AUTO      = 10;
const SIZE_CAP_BYTE = 500 * 1024 * 1024; // 500 MB

// ── Data gather ───────────────────────────────────────────────────────────
const gatherData = async () => {
  const [
    users, bhaktos, mandals, societies, categories, events, attendances,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, username: true, role: true, isActive: true, bhaktoId: true,
        createdAt: true, updatedAt: true, createdBy: true, updatedBy: true,
      },
    }),
    prisma.bhakto.findMany({
      include: {
        mandal:   { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        society:  { select: { id: true, name: true } },
      },
    }),
    prisma.mandal.findMany(),
    prisma.society.findMany(),
    prisma.category.findMany(),
    prisma.event.findMany(),
    prisma.attendance.findMany(),
  ]);

  return { users, bhaktos, mandals, societies, categories, events, attendances };
};

// ── Build JSON dump ───────────────────────────────────────────────────────
const buildJson = (data) => {
  const payload = {
    exportedAt: new Date().toISOString(),
    version:    1,
    counts: {
      users:       data.users.length,
      bhaktos:     data.bhaktos.length,
      mandals:     data.mandals.length,
      societies:   data.societies.length,
      categories:  data.categories.length,
      events:      data.events.length,
      attendances: data.attendances.length,
    },
    data,
  };
  return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
};

// ── Build Excel (Bhakto only, same style as /api/bhakto/export) ───────────
const buildExcel = (data) => {
  const rows = data.bhaktos.map((b, i) => ({
    '#':            i + 1,
    'Full Name':    b.fullName,
    'Mobile':       b.mobileNo      || '',
    'House No':     b.houseNo       || '',
    'Society':      b.society?.name || '',
    'Gender':       b.gender,
    'DOB':          b.dateOfBirth ? new Date(b.dateOfBirth).toISOString().split('T')[0] : '',
    'Occupation':   b.occupation     || '',
    'Category':     b.category?.name || '',
    'Reference By': b.referenceBy    || '',
    'Is Leader':    b.isLeader ? 'Yes' : 'No',
    'Is Active':    b.isActive ? 'Yes' : 'No',
    'Remarks':      b.remarks        || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Bhakto');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

// ── Path helpers ──────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

const buildBaseName = (type) => {
  const d = new Date();
  const stamp =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const label = type === 'AUTO' ? 'auto' : 'manual';
  return `umandal-backup-${stamp}-${label}`;
};

const buildStoragePath = (base, ext) => {
  const d = new Date();
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${base}.${ext}`;
};

// ── Storage ops ───────────────────────────────────────────────────────────
const uploadBuffer = async (path, buffer, contentType) => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed for ${path}: ${error.message}`);
  return path;
};

const createSignedUrl = async (path, ttlSeconds = 3600) => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error) throw new Error(`Signed URL failed for ${path}: ${error.message}`);
  return data.signedUrl;
};

const deleteFromStorage = async (paths) => {
  if (!paths || paths.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch (err) {
    console.error('Storage delete failed:', err.message);
  }
};

// ── Retention ─────────────────────────────────────────────────────────────
const pruneByType = async (type, cap) => {
  const rows = await prisma.backupHistory.findMany({
    where:   { type },
    orderBy: { createdAt: 'desc' },
  });
  if (rows.length <= cap) return;
  const excess = rows.slice(cap);
  for (const row of excess) {
    await deleteFromStorage([row.jsonPath, row.excelPath]);
    await prisma.backupHistory.delete({ where: { id: row.id } }).catch(() => {});
  }
};

const pruneOldBackups = async () => {
  await pruneByType('MANUAL', MAX_MANUAL);
  await pruneByType('AUTO',   MAX_AUTO);
};

// ── Pre-flight size check ─────────────────────────────────────────────────
const totalUsedBytes = async () => {
  const agg = await prisma.backupHistory.aggregate({
    _sum: { jsonSize: true, excelSize: true },
  });
  return (agg._sum.jsonSize || 0) + (agg._sum.excelSize || 0);
};

const ensureSizeHeadroom = async (type, incomingBytes) => {
  const used = await totalUsedBytes();
  if (used + incomingBytes <= SIZE_CAP_BYTE) return;

  // Prune one extra oldest slot from the matching type
  const oldest = await prisma.backupHistory.findFirst({
    where:   { type },
    orderBy: { createdAt: 'asc' },
  });
  if (oldest) {
    await deleteFromStorage([oldest.jsonPath, oldest.excelPath]);
    await prisma.backupHistory.delete({ where: { id: oldest.id } }).catch(() => {});
  }
};

// ── Main runner ───────────────────────────────────────────────────────────
const runBackup = async ({ type, createdBy }) => {
  const normalizedType = type === 'AUTO' ? 'AUTO' : 'MANUAL';

  const data        = await gatherData();
  const jsonBuffer  = buildJson(data);
  const excelBuffer = buildExcel(data);

  await ensureSizeHeadroom(normalizedType, jsonBuffer.length + excelBuffer.length);

  const base      = buildBaseName(normalizedType);
  const jsonPath  = buildStoragePath(base, 'json');
  const excelPath = buildStoragePath(base, 'xlsx');

  // Upload JSON first
  await uploadBuffer(jsonPath, jsonBuffer, 'application/json');

  // Upload Excel — if this fails, remove the orphan JSON
  try {
    await uploadBuffer(
      excelPath,
      excelBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  } catch (err) {
    await deleteFromStorage([jsonPath]);
    throw err;
  }

  const recordCounts = {
    users:       data.users.length,
    bhaktos:     data.bhaktos.length,
    mandals:     data.mandals.length,
    societies:   data.societies.length,
    categories:  data.categories.length,
    events:      data.events.length,
    attendances: data.attendances.length,
  };

  const row = await prisma.backupHistory.create({
    data: {
      fileName:  base,
      jsonPath,
      excelPath,
      jsonSize:  jsonBuffer.length,
      excelSize: excelBuffer.length,
      type:      normalizedType,
      recordCounts,
      createdBy: createdBy || null,
    },
  });

  // Retention prune
  try { await pruneOldBackups(); } catch (err) { console.error('Prune failed:', err.message); }

  return row;
};

module.exports = {
  supabase,
  BUCKET,
  MAX_MANUAL,
  MAX_AUTO,
  SIZE_CAP_BYTE,
  gatherData,
  buildJson,
  buildExcel,
  buildBaseName,
  buildStoragePath,
  uploadBuffer,
  createSignedUrl,
  deleteFromStorage,
  pruneOldBackups,
  runBackup,
};
