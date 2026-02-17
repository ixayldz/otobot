# idea.md - OTOBOT

**OTOBOT: PRD'den Uretime, Capability-Aware Lead Engineer Harness**

## 0) TL;DR
Otobot, PRD tabanli yazilim gelistirme akisini "chat" seviyesinden "muhendislik sureci" seviyesine cikarir.

Ana vaat:
1. PRD'yi interview ile netlestirir.
2. PRD'yi lock eder ve hash gate ile scope korur.
3. Claude Code'u capability-aware bir kontrol duzleminden calistirir.
4. AI-ready kit'i rubric ile olculebilir kaliteye getirir.
5. Plan -> Implement -> Review -> Test dongusunu zorunlu state machine ile isletir.

Bu sistemin amaci "daha cok kod" degil, "daha guvenli, izlenebilir, tekrar edilebilir cikti" uretmektir.

---

## 1) Problem
LLM ile kod uretiminde tipik sorunlar:
- Belirsiz PRD -> yanlis varsayim
- Scope drift -> gereksiz genisleme
- Test/review atlama -> kalite dususu
- Tool-use riski -> yanlis dosya, secret sizintisi
- Uzun oturumlarda baglam kaymasi

Otobot bu sorunlari prompt kalitesiyle degil, sistem tasarimiyla cozer.

---

## 2) Cekirdek Fikir
Otobot iki ana katmandan olusur:

### Katman A - PRD Interview + Lock
- PRD parse edilir
- High/Med impact unknown'lar sorulur
- `docs/decisions.md` ve `docs/assumptions.md` yazilir
- `docs/prd.locked.md` + `docs/prd.lock.json` uretilir

Lock sonrasi her build adimi hash ile dogrulanir.

### Katman B - Execution Harness
- Claude Code capability detection yapilir
- AI-ready kit uretilir (`CLAUDE.md`, `.claude/*`)
- Rubric (`>=90`) saglanana kadar auto-revision calisir
- Milestone state machine gorevleri calistirir

---

## 3) Tasarim Ilkeleri
1. **SoT:** `prd.md` tek kaynak gercektir.
2. **Policy over Prompt:** Davranis kurallari izin/hook/state ile zorlanir.
3. **Capability-aware:** CLI flag ve ozellikler runtime tespit edilir.
4. **Model-agnostic contract:** Hardcoded marketing isimleri yerine `provider + model_id` kullanilir.
5. **Fail-safe defaults:** Bilinmeyen durumda deny/ask/degrade uygulanir.
6. **Auditability:** Her adim izlenebilir ve tekrar oynatilabilir olmalidir.

---

## 4) Canonical Akis
1. `/doctor` -> ortam + capability check
2. `/model set <provider> <model_id>`
3. `/read prd.md`
4. `/interview start`
5. `/lock`
6. `/bootstrap`
7. `/harden`
8. `/build`

Build dongusu:
- planning -> implementing -> reviewing -> testing
- test fail -> debugging -> testing
- hash mismatch -> change_request

---

## 5) Neden Farkli?
Otobot'u farkli yapan sey "bir model daha" degil, su kombinasyondur:
- PRD lock + hash gate
- capability-aware control plane
- dual enforcement (permissions + hooks)
- rubric-driven quality
- state machine zorunlulugu
- JSONL audit + resumable state

Bu kombinasyon, araci "kod yazan bot"tan "surec yurutebilen muhendislik sistemi"ne cevirir.

---

## 6) Sistem Bilesenleri (Conceptual)
- `cli`: REPL ve komut yonlendirme
- `core/intent`: dogal dil -> komut esleme
- `core/providers`: provider adapter katmani
- `core/prd`: parser, unknown detector, interview, lock
- `core/claude`: capability + control plane
- `core/kit`: generator + hardener
- `core/rubric`: skor + revizyon
- `core/state`: state machine + persistence
- `core/audit`: log + redaction

---

## 7) State Machine (Vizyon)
Ana state zinciri:
`IDLE -> PRD_LOADED -> INTERVIEWING -> LOCKED -> BOOTSTRAPPED -> HARDENED -> REFRESHED -> PLANNING -> IMPLEMENTING -> REVIEWING -> TESTING -> SHIPPED`

Destek state'leri:
- `DEBUGGING`
- `CHANGE_REQUEST`
- `PAUSED`
- `FAILED`
- `ABORTED`

Kural ozeti:
- LOCKED olmadan bootstrap yok
- HARDENED olmadan build yok
- review ve test atlanamaz
- hash mismatch olursa change request zorunlu

---

## 8) Release Cercevesi
### v0.1 (MVP)
- REPL core
- PRD interview + lock
- capability-aware bootstrap
- hardening + rubric
- build state machine
- audit logging

### v0.5
- watch mode
- richer task graph
- gelismis consistency checks

### v1.0
- policy packs
- sandbox execution
- plugin/template ecosystem

---

## 9) Basari Sinyalleri
- Scope disi degisiklik denemeleri bloklanir
- Kit rubric skoru hedefi gecilir
- Milestone test adimlari yuksek oranda calisir
- Build kesintilerinde resume basarili olur
- Operasyonlar audit kaydiyla aciklanabilir olur

---

## 10) Son Not
Bu dosya konsept ve niyet dokumanidir.
Uygulama kurallari, acceptance kriterleri ve public contract detaylari `prd.md` dosyasinda normatif olarak tanimlanir.
