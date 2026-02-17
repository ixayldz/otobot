# prd.md - OTOBOT

**Urun:** Otobot (CLI + REPL)
**Vizyon:** PRD'den uretime giden sureci "lead engineer" disiplininde, olculebilir kalite kapilariyla yonetmek.
**Surum:** v0.1 (MVP) -> v1.0 (Production-grade)
**Platform:** Windows / macOS / Linux
**Teknoloji:** Node.js 20+ (TypeScript)
**Son Guncelleme:** 2026-02-17
**Dokuman Durumu:** Decision-complete (uygulama ve test ekipleri dogrudan kullanabilir)

---

## 0) Dokuman Amaci
Bu PRD, Otobot icin tek kaynak gercektir (SoT). `idea.md` ve `research.md` destekleyici dokumanlardir.

Normatif anahtar kelimeler:
- `MUST`: zorunlu
- `SHOULD`: guclu onerilen
- `MAY`: opsiyonel

---

## 1) Problem ve Hedef

### 1.1 Problem
LLM destekli kod uretim sureclerinde temel sorunlar:
1. PRD belirsizligi -> scope drift
2. Plansiz uygulama -> test/review atlanmasi
3. Tool-use riski -> yanlis dosya duzenleme, secret sizintisi
4. Uzun baglamda kalite dususu
5. Repo'nun AI-ready olmamasi

### 1.2 Urun Hedefleri
1. PRD'yi interview ile netlestirmek ve lock etmek
2. PRD lock sonrasi scope'u teknik olarak zorunlu kilmak
3. Claude Code'u capability-aware kontrol duzleminden guvenli calistirmak
4. AI-ready kit'i (`CLAUDE.md`, `.claude/*`) rubric ile olculebilir kaliteye getirmek
5. Plan -> Implement -> Review -> Test dongusunu state machine ile zorunlu kilmak
6. Tum adimlarin audit kaydini uretmek

### 1.3 Basari Metrikleri (MVP)
- Lock sonrasi scope disi implement denemelerinde bloklama orani: `%100`
- Kit rubric skoru: `>= 90/100`
- Milestone bazli gorevlerde test adiminin calisma orani: `>= %95`
- "ilk calistirma" suresi (otobot -> lock -> bootstrap): `<= 10 dakika` (typical)

---

## 2) Kapsam (Release Bazli)

### 2.1 MVP (v0.1) In-Scope
- REPL komutlari: `/help`, `/model`, `/roles`, `/key`, `/read`, `/interview`, `/lock`, `/bootstrap`, `/harden`, `/refresh`, `/build`, `/doctor`, `/exit`
- PRD parser + unknown detector + interview engine
- PRD lock artefactlari
- Claude Code capability detection ve headless kontrol
- AI-ready kit generator + rubric grader + max 3 auto-revision
- Milestone state machine (review ve test zorunlu)
- JSONL audit logging + resumable project state

### 2.2 v0.5 In-Scope
- Watch mode (PTY) ve daha zengin task-graph
- Cross-consistency checks (kit dosyalari arasi)
- Partial resume / paused execution

### 2.3 v1.0 In-Scope
- Policy packs (org-wide)
- Sandboxed execution (container)
- Plugin/template packaging
- Gelismis risk engine + static analysis entegrasyonlari

### 2.4 Out-of-Scope (MVP)
- Tam otomatik production deploy
- Kullanici onayi olmadan prod ortamina dokunma
- Tum framework/stack kombinasyonlarini tam destekleme

---

## 3) Persona ve Kullanim Amaci
1. Solo Builder: hizli ama kontrollu MVP ister
2. Tech Lead: lock, audit, risk yonetimi ister
3. Hackathon Team: hizli scaffold + gorunur ilerleme ister
4. Enterprise Pilot: policy, denylist, compliance ister

---

## 4) Kullanici Akislari (Canonical)

### 4.1 Baslatma ve Hazirlik
1. Kullanici `otobot` calistirir
2. `/doctor` ile ortam ve capability check alir
3. `/model` ile provider + `model_id` secer
4. `/roles` ile planner/reviewer/executor atamasini dogrular

### 4.2 PRD Intake ve Lock
1. `/read prd.md`
2. `/interview` (sadece High/Med unknown)
3. Otobot `docs/decisions.md` ve `docs/assumptions.md` gunceller
4. `/lock` ile lock artefactlari uretilir ve hash yazilir

### 4.3 Bootstrap ve Hardening
1. `/bootstrap` ile Claude Code init adimi (capability'ye gore)
2. `/harden` ile kit uretilir
3. Rubric skoru `< 90` ise max 3 kez auto-revision

### 4.4 Build ve Kapatma
1. `/build` milestone bazli calisir
2. Her milestone: plan -> implement -> review -> test
3. Test fail olursa debugging state'e gecilir ve retest edilir
4. Basari halinde SHIPPED; tum adimlar audit'e yazilir

### 4.5 Change Request Akisi
1. Lock sonrasinda PRD hash degismisse `/build` baslayamaz
2. Otobot `CHANGE_REQUEST` state'ine gecer
3. Kullanici diff'i onaylayip tekrar `/lock` calistirir

---

## 5) Fonksiyonel Gereksinimler

### 5.1 REPL Komut Sozlesmesi (MVP)
- `/model set <provider> <model_id>`
- `/roles set planner=<provider:model_id|claude_code> reviewer=<...> executor=<claude_code>`
- `/key set <provider>`
- `/read <path>`
- `/interview start`
- `/lock`
- `/bootstrap`
- `/harden`
- `/refresh`
- `/build [task-id|epic-id]`
- `/doctor`

Natural language intent MUST desteklenir:
- "prd.md dosyasini oku" -> `/read prd.md`
- "kilitle" -> `/lock`
- "build'e basla" -> `/build`

### 5.2 Model ve Provider Politikasi
Sabit marketing adlari normatif degildir. Normatif alanlar:
- `provider`: `openai | google | anthropic`
- `model_id`: provider API veya config ile dogrulanan string

Kurallar:
1. Otobot MUST hardcoded tek model listesine bagli kalmamalidir.
2. Otobot SHOULD provider tarafindan sunulan model listesini runtime senkronlamalidir.
3. Model listesi alinamazsa son basarili cache + kullanici override MAY kullanilir.

Default role policy:
- `planner`: kullanicinin sectigi provider/model
- `executor`: `claude_code`
- `reviewer`: kullanicinin secimi veya varsayilan policy modeli

### 5.3 API Key Yonetimi
Oncelik sirasi:
1. OS keychain
2. Encrypted local store (AES-GCM)
3. Environment override

Kurallar:
- Secretler loglanamaz
- Key degerleri audit'e yazilamaz
- `/doctor` key var/yok sinyalini deger vermeden gostermelidir

### 5.4 PRD Interview ve Lock
- Unknown detector kategorileri: auth, RBAC, retention/PII, billing, realtime, deploy target, test strategy
- Her unknown alaninda: `impact`, `assumption`, `question`
- `impact in {high, medium}` MUST sorulur
- `/lock` su dosyalari uretmelidir:
  - `docs/prd.locked.md`
  - `docs/decisions.md`
  - `docs/assumptions.md`
  - `docs/prd.lock.json`

### 5.5 Claude Code Capability-Aware Control Plane
Otobot MUST capability detection yapar ve sonucu saklar.

Algilanacak minimum capability set:
- headless print (`-p` / `--print`)
- output format secimi (`text/json/stream-json`)
- resume latest (`-c` / `--continue`)
- resume by id (`-r` / `--resume`)
- allowed/disallowed tools policy flag'leri
- init workflow destegi

Kurallar:
1. Capability yoksa ilgili ozellik disable edilir ve degrade path secilir.
2. `stream-json` yoksa `json`, o da yoksa `text` parse fallback kullanilir.
3. Watch mode sadece gozlem amaclidir; karar verici kanal headless execution'dir.

### 5.6 AI-Ready Kit Generator
Uretilen/guncellenen dosyalar:
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/agents/{architect,coder,reviewer,debugger}.md`
- `.claude/commands/{plan,implement,review,test}.md`
- `.claude/hooks/{protect-files,post-edit-check}.{ps1|sh}`

`CLAUDE.md` MUST icermelidir:
- north star
- scope in/out
- komut matrisi
- DoD
- mimari sinirlar + ownership
- security non-negotiables
- lock sonrasi degisiklik protokolu

### 5.7 Rubric ve Auto-Revision
- Her hedef dosya 100 puan uzerinden skorlanir
- Gecis esigi: `>= 90`
- Auto-revision limiti: `3`
- Gecis yoksa Otobot MUST "missing criteria" raporu verir

### 5.8 Build State Machine
Milestone task'leri `docs/task-graph.json` uzerinden surulur.
Her task su alanlari MUST icermelidir:
- `acceptanceCriteria`
- `expectedTouched`
- `tests`
- `rollbackPlan`
- `verificationSteps`
- `blastRadius`

---

## 6) State Machine ve Gecis Kurallari

### 6.1 State Listesi
`IDLE -> PRD_LOADED -> INTERVIEWING -> LOCKED -> BOOTSTRAPPED -> HARDENED -> REFRESHED -> PLANNING -> IMPLEMENTING -> REVIEWING -> TESTING -> SHIPPED`

Ek state'ler:
- `DEBUGGING`
- `CHANGE_REQUEST`
- `PAUSED`
- `FAILED`
- `ABORTED`

### 6.2 Gecis Kurallari (Normatif)
1. `LOCKED` olmadan `BOOTSTRAPPED` gecisi yasak
2. `HARDENED` olmadan `PLANNING/BUILD` yasak
3. `IMPLEMENTING` sonrasinda `REVIEWING` zorunlu
4. `REVIEWING` fail ise `IMPLEMENTING` veya `PLANNING`'e geri donus
5. `TESTING` fail ise `DEBUGGING` -> `TESTING` zorunlu
6. PRD hash mismatch olursa her yerden `CHANGE_REQUEST`
7. Kullanici durdurursa `PAUSED`, devamda son guvenli state'e resume

### 6.3 Entry/Exit Kriterleri
- `LOCKED` entry: lock artefactlari + hash var
- `HARDENED` exit: rubric >=90
- `REVIEWING` exit: kritik risk = 0 veya onayli istisna
- `TESTING` exit: required test command'lari green
- `SHIPPED` exit: milestone audit tamam

---

## 7) Veri, Saklama ve Sozlesmeler

### 7.1 `.otobot/state.json` (Public Contract)
```json
{
  "version": "1.2",
  "projectId": "uuid",
  "state": "LOCKED",
  "policyVersion": "2026-02-17",
  "lockVersion": "1.2",
  "activeProvider": { "provider": "openai", "modelId": "gpt-5.2" },
  "roles": {
    "planner": { "type": "provider", "provider": "openai", "modelId": "gpt-5.2" },
    "executor": { "type": "claude_code" },
    "reviewer": { "type": "provider", "provider": "anthropic", "modelId": "claude-opus-4-6" }
  },
  "capabilities": {
    "printMode": true,
    "outputFormats": ["text", "json", "stream-json"],
    "resumeLatest": true,
    "resumeById": true,
    "allowedToolsFlag": true,
    "initWorkflow": true
  },
  "paths": {
    "prdLocked": "docs/prd.locked.md",
    "prdLockJson": "docs/prd.lock.json",
    "taskGraph": "docs/task-graph.json"
  },
  "session": {
    "currentTaskId": null,
    "pausedAt": null,
    "resumeToken": null,
    "watchSessionId": null,
    "lastActiveState": null,
    "checkpointId": null,
    "lastFailureReason": null,
    "retryBudget": 2
  },
  "sandbox": {
    "enabled": false,
    "provider": "none",
    "profile": "off"
  },
  "policy": {
    "activePack": "default-balanced",
    "hash": "",
    "lastAppliedAt": null
  },
  "plugins": [],
  "telemetry": {
    "lastSloSnapshotAt": null,
    "counters": {
      "commands": 0,
      "errors": 0,
      "builds": 0
    },
    "latency": {
      "commandCount": 0,
      "totalMs": 0,
      "avgMs": 0,
      "lastCommandMs": 0,
      "lastBuildMs": 0
    },
    "failureBuckets": {
      "command": 0,
      "build": 0,
      "provider": 0
    },
    "providerHealth": {
      "openai": "unknown",
      "google": "unknown",
      "anthropic": "unknown"
    }
  }
}
```

### 7.2 `docs/prd.lock.json` (Public Contract)
```json
{
  "version": "1.2",
  "contractVersion": "1.2",
  "lockedAt": "2026-02-17T00:00:00Z",
  "hashAlgo": "sha256",
  "hashScope": ["prd.locked.md", "decisions.md", "assumptions.md"],
  "prdHash": "...",
  "scope": { "in": ["..."], "out": ["..."] },
  "changeRequestPolicy": {
    "required": true,
    "approvers": ["project-owner"],
    "approvalMode": "any_of",
    "requiredApprovals": 1,
    "auditRequired": true,
    "requiredEvidence": ["prd-diff", "review-note"],
    "approvalSlaHours": 24
  },
  "stackHints": { "language": "ts", "frameworks": ["..."], "db": "sqlite" }
}
```

### 7.3 `docs/task-graph.json` (Public Contract)
```json
{
  "version": "1.2",
  "epics": [
    {
      "id": "EPIC-001",
      "name": "Auth",
      "stories": [
        {
          "id": "STORY-001",
          "name": "Email login",
          "tasks": [
            {
              "id": "TASK-001",
              "name": "Add login endpoint",
              "acceptanceCriteria": ["returns 200 on valid credential"],
              "risk": "medium",
              "expectedTouched": ["src/api/auth.ts"],
              "tests": ["npm test -- auth"],
              "verificationSteps": ["manual smoke login"],
              "rollbackPlan": ["revert auth endpoint commit"],
              "blastRadius": "auth module",
              "dependsOn": [],
              "ownerRole": "executor",
              "estimate": 1,
              "retries": 1,
              "status": "planned",
              "sourcePrdSections": ["Auth"],
              "qualityGates": ["review", "tests"],
              "riskControls": ["limit blast radius"]
            }
          ]
        }
      ]
    }
  ]
}
```

### 7.4 Saklama Mimarisi
- Audit event kayitlari: JSONL (`.otobot/audit/*.jsonl`)
- Operasyonel metadata: SQLite
- Kural: audit full payload DB'ye yazilmaz, DB pointer tutar

---

## 8) Guvenlik ve Uyumluluk Gereksinimleri

### 8.1 Secret Koruma
Deny pattern MUST kapsar:
- `.env`, `.env.*`
- `secrets/**`
- `**/*.pem`, `**/*.key`, `**/id_rsa*`
- credential/token patternleri

Koruma katmanlari:
1. `.claude/settings.json` permission deny
2. `PreToolUse` hook block
3. audit redaction

### 8.2 Log Hijyeni
- Key/token/password degerleri redact edilir
- CLI argumanlari sanitize edilir
- PII alanlari (email, phone, national id) policy'ye gore maskelenir

### 8.3 Network ve Komut Riski
- Yuksek riskli komutlar (`curl`, `wget`, destructive shell) varsayilan `ask`
- Tool budget limiti: dosya/satir degisiklik tavanlari

### 8.4 Data Retention
- Varsayilan local retention: 30 gun
- `otobot audit prune` ile policy tabanli temizleme

---

## 9) Operasyonel Gereksinimler (NFR)

### 9.1 Guvenilirlik
- Resume MUST desteklenir (state + milestone pointer)
- Capability mismatch durumunda degrade mode MUST acik raporlanir

### 9.2 Performans
- Event stream parse line-by-line O(1) memory
- Buyuk PRD okuma streaming desteklemeli

### 9.3 Kullanilabilirlik
- Hata mesajlari eylem onerisi icermeli (`/doctor`, `/key set`, `/lock`)
- Uzun raporlar `docs/` altina yazilmali, terminalde kisa ozet verilmeli

### 9.4 SLO/SLA Ic Hedefleri (MVP)
- `/doctor` ortalama tamamlanma: <= 5 sn (lokal)
- `/lock` olusturma: <= 30 sn (orta boy PRD)
- Headless task baslatma gecikmesi: <= 3 sn (capability cache varken)

---

## 10) Test Stratejisi

### 10.1 Unit (Vitest)
- canonicalization + hashing
- unknown detection scoring
- lock engine
- rubric scoring
- capability parser
- state transition validator

### 10.2 Integration
- mock `claude` binary ile bootstrap/headless fallback
- kit generator + hooks script generation (OS bazli)
- state resume ve change-request dongusu

### 10.3 Contract Tests
- `state.json`, `prd.lock.json`, `task-graph.json` schema validation
- state listesi ve transition kurallari tutarlilik testi

### 10.4 E2E (Opt-in)
- gercek Claude Code ile `init` ve en az bir headless milestone
- CI'da zorunlu degil; nightly veya manuel pipeline

---

## 11) Acceptance Criteria (Given/When/Then)
1. Given model secimi yok, When `/build` calistirilir, Then eylem durur ve `/model set` onerilir.
2. Given PRD okunmus, When `/interview start` biter, Then decisions/assumptions dosyalari guncellenir.
3. Given lock yok, When `/bootstrap` denenir, Then gecis engellenir ve `/lock` istenir.
4. Given lock var, When `/build` oncesi hash mismatch bulunur, Then `CHANGE_REQUEST` state'ine gecilir.
5. Given capability'lerde `stream-json` yok, When headless run yapilir, Then `json/text` fallback ile calisma devam eder.
6. Given protected path write denemesi, When tool call tetiklenir, Then permission/hook en az bir katmanda bloklar.
7. Given `/harden` calisti, When rubric skoru < 90, Then en fazla 3 auto-revision yapilir.
8. Given implement tamamlandi, When review fail doner, Then state `IMPLEMENTING` veya `PLANNING`'e geri doner.
9. Given test fail, When debugger adimi biter, Then otomatik retest tetiklenir.
10. Given build tamam, When SHIPPED state'e gecilir, Then milestone audit kaydi mevcut olur.
11. Given pause alindi, When resume yapilir, Then son guvenli state'ten devam edilir.
12. Given key girildi, When audit yazilir, Then key degeri maskelenmis olur.

---

## 12) Mimari ve Modul Haritasi
- `cli/`: komut routing + REPL
- `core/intent`: NL intent resolver
- `core/providers`: provider adapter'lari
- `core/prd`: parser + interview + lock
- `core/repo`: stack/command inspector
- `core/claude`: capability + controller
- `core/kit`: generator + hardener
- `core/rubric`: scoring + revision
- `core/state`: state machine + persistence
- `core/audit`: JSONL logger + redaction
- `core/security`: deny pattern + policy evaluator

---

## 13) Roadmap

### v0.1 (MVP)
- REPL + provider/model/roles
- PRD intake/interview/lock
- capability-aware bootstrap + harden
- build state machine + audit

### v0.5
- watch mode + richer task graph
- consistency validator + advanced resume

### v1.0
- org policy packs
- sandbox execution
- plugin/template ecosystem

---

## 14) Riskler ve Azaltma
1. Claude CLI degiskenligi -> capability detection + fallback matrix
2. False positive deny -> whitelist + project-local overrides
3. Token/cost artisi -> kisa prompt, incremental build, caching
4. Scope creep -> hash gate + change request zorunlulugu
5. Hook bypass riski -> dual enforcement (permissions + hooks)

---

## 15) Harici Kaynaklar (Dogrulama Referansi)
Bu PRD'deki zamanla degisebilecek teknik noktalar asagidaki resmi kaynaklardan periyodik dogrulanir:
- Anthropic Claude Code overview: https://docs.anthropic.com/en/docs/claude-code/overview
- Anthropic Claude Code settings: https://docs.anthropic.com/en/docs/claude-code/settings
- Anthropic Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Anthropic CLI reference (claude): https://docs.anthropic.com/en/docs/claude-code/cli-reference
- OpenAI Models API reference: https://platform.openai.com/docs/api-reference/models/list
- OpenAI Models catalog: https://platform.openai.com/docs/models
- Gemini models guide: https://ai.google.dev/gemini-api/docs/models/gemini
- Gemini models list API: https://ai.google.dev/api/rest/generativelanguage/models/list

Guncelleme politikasi:
- Model adlari ve CLI bayraklari kesin sabit varsayilmaz.
- Runtime capability + provider sync sonuclari kanonik kabul edilir.

---

## 16) Sonuc
Otobot'un kalite iddiasi prompt'tan degil, asagidaki mekanizmalardan gelir:
- PRD lock + hash gate
- capability-aware execution
- permissions + hooks
- rubric >= 90
- zorunlu review/test state machine'i
- audit + resumable state

Bu sayede sistem, "tek seferde kod yazdirma" yaklasimindan cikarak olculebilir bir muhendislik surecine donusur.
