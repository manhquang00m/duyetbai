import { Router } from 'express';
import { getSetting, setSetting } from '../db/settings';
import { DEFAULT_REWRITE_PROMPT, getRewritePrompt } from '../services/rewrite';

const router = Router();

const MEDIA_SOURCE_KEY = 'media_source_default';
const MEDIA_SOURCES = ['savethreads', 'snapsave'] as const;
type MediaSourceName = (typeof MEDIA_SOURCES)[number];

function isMediaSourceName(v: unknown): v is MediaSourceName {
  return MEDIA_SOURCES.includes(v as MediaSourceName);
}

// GET /api/settings/media-source -> nen tang mac dinh de lay metadata/media bai Threads
// ('savethreads' | 'snapsave'). Chua cau hinh -> mac dinh 'savethreads'.
router.get('/media-source', (_req, res) => {
  const value = getSetting(MEDIA_SOURCE_KEY);
  res.json({ default: isMediaSourceName(value) ? value : 'savethreads' });
});

// PUT /api/settings/media-source { default: 'savethreads' | 'snapsave' } -> doi nen tang mac dinh
router.put('/media-source', (req, res) => {
  const value = req.body?.default;
  if (!isMediaSourceName(value)) {
    res.status(400).json({ error: `default phai la ${MEDIA_SOURCES.join(' hoac ')}` });
    return;
  }
  setSetting(MEDIA_SOURCE_KEY, value);
  res.json({ default: value });
});

// GET /api/settings/rewrite-prompt -> prompt dang dung cho tinh nang viet lai caption bang AI
router.get('/rewrite-prompt', (_req, res) => {
  res.json({ prompt: getRewritePrompt(), default: DEFAULT_REWRITE_PROMPT });
});

// PUT /api/settings/rewrite-prompt { prompt } -> doi giong van AI (de trong = ve mac dinh)
router.put('/rewrite-prompt', (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : null;
  if (prompt == null) {
    res.status(400).json({ error: 'thieu prompt' });
    return;
  }
  setSetting('rewrite_prompt', prompt || DEFAULT_REWRITE_PROMPT);
  res.json({ prompt: getRewritePrompt() });
});

export default router;
