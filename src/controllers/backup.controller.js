const { PrismaClient } = require('@prisma/client');
const {
  runBackup, createSignedUrl, deleteFromStorage,
  MAX_MANUAL, MAX_AUTO, SIZE_CAP_BYTE,
} = require('../services/backup.service');

const prisma = new PrismaClient();
const QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB displayed quota

// POST /api/backup/create  — SUPER_ADMIN
const createManualBackup = async (req, res) => {
  try {
    const row = await runBackup({ type: 'MANUAL', createdBy: req.user?.username || null });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('Manual backup error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Backup failed' });
  }
};

// POST /api/backup/auto  — secret-gated, no JWT
const createAutoBackup = async (req, res) => {
  try {
    const secret = req.header('x-backup-secret');
    if (!process.env.BACKUP_SECRET || secret !== process.env.BACKUP_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const row = await runBackup({ type: 'AUTO', createdBy: null });
    return res.json({ success: true, data: row });
  } catch (err) {
    console.error('Auto backup error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Backup failed' });
  }
};

// GET /api/backup
const listBackups = async (req, res) => {
  try {
    const rows = await prisma.backupHistory.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List backups error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/backup/stats
const getStats = async (req, res) => {
  try {
    const [total, manualCount, autoCount, agg] = await Promise.all([
      prisma.backupHistory.count(),
      prisma.backupHistory.count({ where: { type: 'MANUAL' } }),
      prisma.backupHistory.count({ where: { type: 'AUTO' } }),
      prisma.backupHistory.aggregate({ _sum: { jsonSize: true, excelSize: true } }),
    ]);

    const totalBytes = (agg._sum.jsonSize || 0) + (agg._sum.excelSize || 0);
    const usagePercent = Math.min(100, (totalBytes / QUOTA_BYTES) * 100);

    return res.json({
      success: true,
      data: {
        totalCount:    total,
        manualCount,
        autoCount,
        totalBytes,
        quotaBytes:    QUOTA_BYTES,
        usagePercent:  Math.round(usagePercent * 10) / 10,
        maxManual:     MAX_MANUAL,
        maxAuto:       MAX_AUTO,
        sizeCapBytes:  SIZE_CAP_BYTE,
      },
    });
  } catch (err) {
    console.error('Backup stats error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/backup/:id/download/:kind
const downloadBackup = async (req, res) => {
  try {
    const id   = parseInt(req.params.id, 10);
    const kind = (req.params.kind || '').toLowerCase();
    if (!['json', 'excel'].includes(kind)) {
      return res.status(400).json({ success: false, error: 'Invalid kind (use json|excel)' });
    }

    const row = await prisma.backupHistory.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ success: false, error: 'Backup not found' });

    const path = kind === 'json' ? row.jsonPath : row.excelPath;
    const url  = await createSignedUrl(path, 3600);

    return res.json({
      success: true,
      data: { url, path, expiresInSeconds: 3600 },
    });
  } catch (err) {
    console.error('Download backup error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Download failed' });
  }
};

// DELETE /api/backup/:id
const deleteBackup = async (req, res) => {
  try {
    const id  = parseInt(req.params.id, 10);
    const row = await prisma.backupHistory.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ success: false, error: 'Backup not found' });

    await deleteFromStorage([row.jsonPath, row.excelPath]);
    await prisma.backupHistory.delete({ where: { id } });

    return res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('Delete backup error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = {
  createManualBackup,
  createAutoBackup,
  listBackups,
  getStats,
  downloadBackup,
  deleteBackup,
};
