import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  listAccounts,
  createAccount,
  updateAccount,
  removeAccount,
  getAccountByName,
  ProxyConflictError,
} from '../db/accounts';
import { importAccountsExcel } from '../services/accountImporter';
import { EXPORT_DIR } from '../config';

const router = Router();

const uploadDir = path.join(EXPORT_DIR, '_uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } });

const nullableString = z.string().trim().min(1).nullable().optional();

const AccountCreateSchema = z.object({
  name: z.string().trim().min(1),
  active: z.boolean().optional(),
  banned: z.boolean().optional(),
  device: nullableString,
  pass_threads: nullableString,
  gmail: nullableString,
  gmail_password: nullableString,
  proxy: nullableString,
});

const AccountPatchSchema = AccountCreateSchema.partial();

router.get('/', (_req, res) => {
  res.json(listAccounts());
});

// POST /api/accounts { name, device?, banned?, pass_threads?, gmail?, gmail_password?, proxy? }
router.post('/', (req, res) => {
  const parsed = AccountCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (getAccountByName(parsed.data.name)) {
    res.status(409).json({ error: `Profile "${parsed.data.name}" đã tồn tại` });
    return;
  }
  try {
    createAccount(parsed.data);
    res.status(201).json(listAccounts());
  } catch (err) {
    if (err instanceof ProxyConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// PATCH /api/accounts/:id -> cap nhat tung phan (active/banned/device/pass_threads/gmail/...)
router.patch('/:id', (req, res) => {
  const parsed = AccountPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    updateAccount(Number(req.params.id), parsed.data);
    res.json(listAccounts());
  } catch (err) {
    if (err instanceof ProxyConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// POST /api/accounts/import (multipart: file .xlsx, cot A-H: Profile/Thiet bi/Banned/Ngay tao/Pass_Threads/Gmail/Password/Proxy)
router.post('/import', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({ error: 'thieu file' });
    return;
  }
  try {
    const result = await importAccountsExcel(req.file.path);
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
});

// POST /api/accounts/delete { ids: number[] } -> xoa nhieu account cung luc
router.post('/delete', (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map((n: unknown) => Number(n))
    .filter((n: number) => Number.isFinite(n));
  for (const id of ids) removeAccount(id);
  res.json({ deleted: ids.length });
});

router.delete('/:id', (req, res) => {
  removeAccount(Number(req.params.id));
  res.json(listAccounts());
});

export default router;
