// ===================================================================
// CÍM-FORDÍTÁS VÉDELEM TESZT — futtatás: node core/translation-guard.test.js
//
// A teszt-esetek NEM kitaláltak: mind a 611 élő fordítás átméréséből valók
// (2026-08-04). A három "angolul maradt" eset az, amit a napi ellenőrzés
// talált; a két "csak úgy néz ki" eset az, amit a mérés HAMISAN jelzett,
// amíg a küszöb 0.7 volt. A teszt tehát egyszerre méri, mit KELL megfogni
// és mit NEM SZABAD.
// ===================================================================
import { strict as assert } from 'assert';
import { titleLooksUntranslated } from './translation-guard.js';

// ── 1) ANGOLUL MARADT — ezeket MEG KELL fognia (élő esetek) ──────────
const UNTRANSLATED = [
  ['What Is a Voice Agent Builder, and Could It Help Your Small Business?',
   'What Is a Voice Agent Builder, and Could It Help Your Small Business?'],
  ['Interactive AI Avatars: What They Are and How You Might Use Them',
   'Interactive AI Avatars: What They Are and How You Might Use Them'],
  // Ez a legalattomosabb: NEM betű szerint azonos (más kisbetűzés, hiányzó
  // "A"), csak ANGOL. Az egyszerű string-egyezés ezt átengedte volna.
  ['Plan a Family Weekend Getaway with DeepSeek: A Step-by-Step Guide',
   'Plan a family weekend getaway with DeepSeek: step-by-step guide']
];
for (const [en, tr] of UNTRANSLATED) {
  assert.equal(titleLooksUntranslated(en, tr), true,
    'angolul maradt címet meg kell fognia: ' + tr.slice(0, 50));
}

// ── 2) VALÓDI FORDÍTÁS — ezeket NEM szabad megfognia ─────────────────
// A két első a mérés HAMIS RIASZTÁSA volt 0.7-es küszöbnél (71% és 75%):
// spanyol mondat, sok terméknévvel.
const TRANSLATED = [
  ['Get started with Microsoft Copilot in Word, Excel and Outlook',
   'Empieza a usar Microsoft Copilot en Word, Excel y Outlook'],
  ['Introduction to Alibaba\'s Qwen chatbot',
   'Introducción al chatbot Qwen de Alibaba'],
  ['How to spot AI-generated scam messages before you click or reply',
   'Cómo detectar mensajes de estafa generados con IA antes de hacer clic o responder'],
  ['Write a polite complaint email to a company with DeepSeek',
   'Escribe un correo de reclamación educado a una empresa con DeepSeek'],
  ['Plan a Family Weekend Getaway with DeepSeek: A Step-by-Step Guide',
   'Planifica una escapada familiar de fin de semana con DeepSeek: guía paso a paso'],
  ['How to practise a job interview out loud with ChatGPT voice mode',
   'Cómo practicar una entrevista de trabajo en voz alta con el modo de voz de ChatGPT']
];
for (const [en, tr] of TRANSLATED) {
  assert.equal(titleLooksUntranslated(en, tr), false,
    'valódi fordítást NEM szabad megfognia: ' + tr.slice(0, 50));
}

// ── 3) RÖVID CÍM — nem ítélünk (a terméknév jogosan azonos) ──────────
{
  assert.equal(titleLooksUntranslated('Gemini 3 Pro', 'Gemini 3 Pro'), false,
    'rövid, terméknév-címnél nem ítélünk');
  assert.equal(titleLooksUntranslated('', 'bármi'), false, 'üres angol címnél nem ítélünk');
  assert.equal(titleLooksUntranslated('valami', ''), false, 'üres fordításnál nem ítélünk');
}

// ── 4) MAGYAR is átmegy (a mérés szerint hu-ban 0 hiba volt) ─────────
{
  assert.equal(titleLooksUntranslated(
    'Turn on two-factor authentication on your phone',
    'Kapcsold be a kétlépcsős azonosítást a telefonodon'), false);
}

console.log('✅ translation-guard.test: minden átment');
