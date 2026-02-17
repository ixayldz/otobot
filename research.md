# research.md - OTOBOT

## 0) Amac
Bu dokuman, `prd.md` icindeki teknik kararlarin arkasindaki arastirma sonucunu toplar.

Odak:
- Hangi alanlar stabildir?
- Hangi alanlar zamanla degisir (volatile)?
- PRD'de hangi kararlar bu degiskenlige gore alinmalidir?

Dogrulama tarihi: **2026-02-17**

---

## 1) Arastirma Yontemi
1. Yerel dokuman analizi: `idea.md`, `prd.md`
2. Resmi dokuman taramasi: Anthropic, OpenAI, Google Gemini
3. Uygulama etkisi analizi: CLI capability, model katalogu, fallback gereksinimleri

---

## 2) Ana Bulgular

### 2.1 Stabil Bulgular
1. Agentic coding workflow icin lock + review + test kapilari gerekli.
2. Secret guvenligi tek katmanla birakilmamali; permission + hook birlikte kullanilmali.
3. Uzun surecli gorevlerde resumable state ve audit zorunludur.
4. PRD tabanli scope kontrolu olmadan kalite ve sure tahminleri hizla bozulur.

### 2.2 Volatile Bulgular
1. Model adlari/surumleri sik degisebilir.
2. CLI flag setleri zamanla evrilir.
3. Provider bazli output format destegi farkli olabilir.
4. Dokuman/portal erisimi (ozellikle auth gerektiren sayfalar) ortama gore degisebilir.

Sonuc:
- Hardcoded model listesi ve sabit CLI varsayimlari operasyonel risk uretir.
- Runtime capability detection + degrade matrix zorunludur.

---

## 3) PRD'ye Yansiyan Kararlar

### 3.1 Model Politikasi
- Marketing isimleri normatif degil.
- Normatif contract: `provider + model_id`.
- Runtime provider sync basarisizsa cache + explicit user override kullanilir.

### 3.2 Claude Code Entegrasyonu
- Ozellik kullanimi capability detection ile acilir/kapanir.
- `stream-json` yoksa `json`, o da yoksa `text` fallback uygulanir.
- Watch mode gozlemsel; karar verici kanal headless execution'dir.

### 3.3 State Machine
- `DEBUGGING`, `CHANGE_REQUEST`, `PAUSED` explicit state olarak tanimlanir.
- Hash mismatch durumunda `CHANGE_REQUEST` zorunlu olur.

### 3.4 Guvenlik
- Secret path deny pattern + PreToolUse block + audit redaction birlikte calisir.
- Yalnizca deny listesi degil, command risk policy de tanimlanir (`ask/deny`).

---

## 4) Kanit Matrisi (Bulgu -> Gereksinim)
1. Model katalogu degisken -> PRD: provider/model_id contract
2. CLI capability degisken -> PRD: capability-aware controller
3. Tool-use riski yuksek -> PRD: dual enforcement (permissions + hooks)
4. Scope drift riski yuksek -> PRD: lock hash + change request gate
5. Uzun akislarda kesinti riski -> PRD: resumable state + JSONL audit

---

## 5) Kaynak Dogrulama Notlari (2026-02-17)
Asagidaki URL'ler erisilebilirlik acisindan kontrol edildi:
- Anthropic Claude Code overview: `200`
- Anthropic Claude Code CLI reference: `200`
- Gemini models docs: `200`
- OpenAI docs/models: `403` (muhtemel auth/cdn policy etkisi)

Yorum:
- OpenAI dokumanlarinda 403 alinmasi, icerigin yoklugu anlamina gelmez.
- Bu nedenle PRD'de provider/model sozlesmesi hardcoded degil, runtime dogrulamaya baglanmistir.

---

## 6) Acik Riskler
1. CLI behavior degisikligi fallback matrix'i yetersiz yakalayabilir.
2. Provider API limitleri interview/build akisini etkileyebilir.
3. Yanlis deny pattern kritik dosyalari gereksiz bloklayabilir.

Azaltma:
- Capability regression tests
- Policy override mekanizmasi
- Pattern tuning + whitelist

---

## 7) Sonuc
Arastirma sonucu tek cizgiye iniyor:

**Otobot'un dayanikli olmasi icin "model adi" ve "flag ezberi" degil, capability-aware contract ve stateful guardrail mimarisi esas alinmalidir.**

Bu kararlar `prd.md` icinde normatif olarak islenmistir.

---

## 8) Referanslar
- https://docs.anthropic.com/en/docs/claude-code/overview
- https://docs.anthropic.com/en/docs/claude-code/settings
- https://docs.anthropic.com/en/docs/claude-code/hooks
- https://docs.anthropic.com/en/docs/claude-code/cli-reference
- https://platform.openai.com/docs/models
- https://platform.openai.com/docs/api-reference/models/list
- https://ai.google.dev/gemini-api/docs/models/gemini
- https://ai.google.dev/api/rest/generativelanguage/models/list
