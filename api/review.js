// POST /api/review
// Body: { pitch: string, audience: string, timeLimit: 60|90, inputMode: "text"|"voice" }
// Calls Gemini, stores the exchange in Supabase, returns the review + remaining tries.

import crypto from "node:crypto";
import { AUDIENCES, WEAKNESSES, buildSystemPrompt, buildUserMessage, RESPONSE_SCHEMA } from "../lib/prompt.js";
import { insertRow, countRows } from "../lib/supabase.js";

const TABLE = "pitch_reviews";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const MAX_OUTPUT_TOKENS = 500;
const PER_VISITOR_DAILY = Number(process.env.DAILY_CAP) || 5; // reviews per visitor per 24h
const GLOBAL_DAILY = 300;      // protects the free Gemini quota
const MIN_WORDS = 30;
const MAX_WORDS = 400;         // ~3 minutes of speech
const WPM = 140;

function visitorHash(req) {
  const fwd = req.headers["x-forwarded-for"] || "";
  const ip = String(fwd).split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const salt = process.env.VISITOR_SALT || "green-room";
  return crypto.createHash("sha256").update(ip + salt).digest("hex").slice(0, 32);
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const pitch = String(body.pitch || "").trim();
    const audience = AUDIENCES[body.audience] ? body.audience : null;
    const timeLimit = [60, 90].includes(Number(body.timeLimit)) ? Number(body.timeLimit) : 60;
    const inputMode = body.inputMode === "voice" ? "voice" : "text";

    // ---- input validation (cheap checks before spending tokens) ----
    if (!audience) return res.status(400).json({ error: "Pick who you are pitching to." });
    const wordCount = pitch ? pitch.split(/\s+/).length : 0;
    if (wordCount < MIN_WORDS) return res.status(400).json({ error: `Your pitch needs at least ${MIN_WORDS} words. It has ${wordCount}.` });
    if (wordCount > MAX_WORDS) return res.status(400).json({ error: `Keep it under ${MAX_WORDS} words (about 3 minutes spoken). It has ${wordCount}.` });

    // ---- abuse and cost caps, enforced from the Supabase table ----
    const vh = visitorHash(req);
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [mine, everyone] = await Promise.all([
      countRows(TABLE, `visitor_hash=eq.${vh}&created_at=gte.${since}`),
      countRows(TABLE, `created_at=gte.${since}`),
    ]);
    if (mine >= PER_VISITOR_DAILY) {
      return res.status(429).json({ error: `You have used all ${PER_VISITOR_DAILY} free reviews for today. Come back tomorrow and rehearse your rewrite.`, remaining: 0 });
    }
    if (everyone >= GLOBAL_DAILY) {
      return res.status(429).json({ error: "Green Room is at capacity for today. Please try again tomorrow." });
    }

    // ---- call Gemini (key lives only in Vercel env vars) ----
    const estSeconds = Math.round((wordCount / WPM) * 60);
    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: buildUserMessage({ pitch, audienceLabel: AUDIENCES[audience], timeLimit, wordCount, estSeconds }) }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const gem = await gemRes.json();
    if (!gemRes.ok) {
      console.error("Gemini error", gem);
      return res.status(502).json({ error: "The coach is unavailable right now. Try again in a minute." });
    }

    const text = gem?.candidates?.[0]?.content?.parts?.[0]?.text;
    let review;
    try { review = JSON.parse(text); } catch { review = null; }
    if (!review) return res.status(502).json({ error: "The coach returned an unreadable answer. Try again." });

    // ---- server-side guardrails on the model output ----
    const refused = review.is_pitch === false;
    if (!refused) {
      review.score = Math.min(10, Math.max(1, parseInt(review.score, 10) || 1));
      if (!WEAKNESSES.includes(review.weakness_category)) review.weakness_category = null;
      // "Never invent": keep only weak lines whose original text really appears in the pitch
      const p = norm(pitch);
      review.weak_lines = (review.weak_lines || []).filter((w) => w.original && p.includes(norm(w.original))).slice(0, 3);
    }

    const usage = gem.usageMetadata || {};
    await insertRow(TABLE, {
      visitor_hash: vh,
      audience,
      time_limit_sec: timeLimit,
      input_mode: inputMode,
      word_count: wordCount,
      input: pitch,
      output: review,
      refused,
      score: refused ? null : review.score,
      weakness_category: refused ? null : review.weakness_category,
      input_tokens: usage.promptTokenCount ?? null,
      output_tokens: usage.candidatesTokenCount ?? null,
      model: MODEL,
    });

    return res.status(200).json({
      review,
      refused,
      wordCount,
      estSeconds,
      timeLimit,
      remaining: PER_VISITOR_DAILY - mine - 1,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong on our side. Please try again." });
  }
}
