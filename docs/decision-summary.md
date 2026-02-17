# Otobot Decision Summary

Guncelleme tarihi: 2026-02-17
Kaynaklar: `prd.md`, `idea.md`, `research.md`

## 1) Product North Star
Otobot'un amaci PRD'den uretime giden sureci olculebilir muhendislik kapilariyla yonetmektir.
Odak "daha cok kod" degil; guvenli, izlenebilir ve tekrar edilebilir cikti uretmektir.

## 2) Canonical Decisions
1. SoT karari: Normatif dokuman `prd.md` dosyasidir. `idea.md` ve `research.md` destekleyicidir.
2. Model contract karari: Hardcoded model pazarlama isimleri kullanilmaz. Normatif alanlar `provider + model_id`.
3. Execution karari: Claude Code entegrasyonu capability-aware calisir; ozellik yoksa degrade/fallback uygulanir.
4. Scope control karari: PRD lock + hash gate zorunlu; hash mismatch durumunda `CHANGE_REQUEST` state'i zorunludur.
5. Quality gate karari: AI-ready kit rubric ile olculur; gecis esigi `>=90`, auto-revision en fazla 3 iterasyon.
6. Delivery karari: Build dongusu state machine ile zorlanir: `plan -> implement -> review -> test`.
7. Security karari: Secret koruma iki katmanli calisir (permissions + hooks) ve audit redaction zorunludur.
8. Observability karari: Audit JSONL append-only, state resumable olacak sekilde tutulur.

## 3) State Model Snapshot
Ana zincir:
`IDLE -> PRD_LOADED -> INTERVIEWING -> LOCKED -> BOOTSTRAPPED -> HARDENED -> REFRESHED -> PLANNING -> IMPLEMENTING -> REVIEWING -> TESTING -> SHIPPED`

Destek state'leri:
- `DEBUGGING`
- `CHANGE_REQUEST`
- `PAUSED`
- `FAILED`
- `ABORTED`

## 4) MVP Boundaries (v0.1)
In-scope:
- REPL komut seti
- PRD interview + lock
- capability-aware bootstrap/headless control
- kit hardening + rubric
- milestone state machine + audit

Out-of-scope:
- otomatik production deploy
- kullanici onayi olmadan prod etkisi
- tum stack kombinasyonlari icin tam kapsama

## 5) Measurable Success (MVP)
- Scope disi implement bloklama: `%100`
- Kit rubric: `>=90/100`
- Milestone test adimi calisma orani: `>=95%`
- Ilk calistirma suresi: `<=10 dakika` (typical)

## 6) Why These Decisions
Arastirma bulgulari model isimlerinin ve CLI flag setlerinin volatil oldugunu gosteriyor.
Bu nedenle mimari sabit isimlere degil capability detection, lock gate ve stateful guardrail'lere dayanir.

## 7) Immediate Implementation Priorities
1. `state.json`, `prd.lock.json`, `task-graph.json` schema validator
2. Capability detection + fallback matrix
3. Lock hash verification ve change-request gecisleri
4. Rubric scorer + auto-revision loop
5. Security deny patterns + hook enforcement + redaction

## 8) Change Control
Bu ozet tek basina normatif degildir. Yeni kararlar su sirayla guncellenir:
1. `prd.md` (normatif degisim)
2. `docs/decision-summary.md` (yonetsel ozet)
3. `idea.md` ve `research.md` (destekleyici senkron)
