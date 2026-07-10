import { Router } from 'express';
import { listAccounts, addAccount, setAccountActive, removeAccount } from '../db/accounts';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listAccounts());
});

router.post('/', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'thieu name' });
    return;
  }
  addAccount(name);
  res.status(201).json(listAccounts());
});

router.patch('/:id', (req, res) => {
  setAccountActive(Number(req.params.id), Boolean(req.body?.active));
  res.json(listAccounts());
});

router.delete('/:id', (req, res) => {
  removeAccount(Number(req.params.id));
  res.json(listAccounts());
});

export default router;
