// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
}

let supabase = null;
let activePatient = null;
let currentTab = 'evolucion';
let speechRec = null;
let recordingState = false;

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function initConfig() {
  const url = localStorage.getItem('DOCASSIST_SUPABASE_URL') || '';
  const key = localStorage.getItem('DOCASSIST_SUPABASE_KEY') || '';
  const gemini = localStorage.getItem('DOCASSIST_GEMINI_KEY') || '';

  document.getElementById('cfgSupabaseUrl').value = url;
  document.getElementById('cfgSupabaseKey').value = key;
  document.getElementById('cfgGeminiKey').value = gemini;

  if (url && key) {
    supabase = window.supabase.createClient(url, key);
    loadPatientsFromDB();
  }
  refreshIcons();
}

function saveConfiguration() {
  const url = document.getElementById('cfgSupabaseUrl').value.trim();
  const key = document.getElementById('cfgSupabaseKey').value.trim();
  const gemini = document.getElementById('cfgGeminiKey').value.trim();

  localStorage.setItem('DOCASSIST_SUPABASE_URL', url);
  localStorage.setItem('DOCASSIST_SUPABASE_KEY', key);
  localStorage.setItem('DOCASSIST_GEMINI_KEY', gemini);

  if (url && key) {
    supabase = window.supabase.createClient(url, key);
    loadPatientsFromDB();
  }
  closeConfigModal();
  alert('Conexión con Supabase y Gemini guardada.');
}

function openConfigModal() { document.getElementById('configModal').classList.remove('hidden'); }
function closeConfigModal() { document.getElementById('configModal').classList.add('hidden'); }
function openPatientModal() { document.getElementById('patientModal').classList.remove('hidden'); }
function closePatientModal() { document.getElementById('patientModal').classList.add('hidden'); }

function switchNoteTab(type) {
  currentTab = type;
  ['evolucion', 'ingreso', 'egreso'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (t === type) {
      el.className = 'py-2 rounded-lg bg-white shadow-sm text-indigo-700 transition font-bold';
    } else {
      el.className = 'py-2 rounded-lg text-slate-600 hover:text-slate-900 transition font-medium';
    }
  });
}

// Cargar censo de pacientes desde Supabase
async function loadPatientsFromDB() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('status', 'Activo')
    .order('bed_number', { ascending: true });

  const container = document.getElementById('patientListContainer');
  container.innerHTML = '';

  if (error || !data || data.length === 0) {
    container.innerHTML = `<p class="text-center text-xs text-slate-400 py-6">No hay pacientes activos en el censo.</p>`;
    document.getElementById('patientCounter').innerText = '0 pacientes';
    return;
  }

  document.getElementById('patientCounter').innerText = `${data.length} pacientes activos`;

  data.forEach(p => {
    const card = document.createElement('div');
    const isSelected = activePatient && activePatient.id === p.id;
    card.className = `p-3 rounded-lg border text-xs cursor-pointer transition ${
      isSelected ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
    }`;
    card.onclick = () => selectPatient(p);
    card.innerHTML = `
      <div class="flex justify-between items-center font-bold">
        <span class="text-indigo-700">${p.bed_number}</span>
        <span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-[10px]">${p.initials} (${p.age || '--'}a)</span>
      </div>
      <p class="text-slate-600 mt-1 line-clamp-1">${p.admission_dx}</p>
    `;
    container.appendChild(card);
  });
}

function selectPatient(patient) {
  activePatient = patient;
  document.getElementById('bannerTitle').innerText = `${patient.initials} - ${patient.age ? patient.age + ' años' : ''}`;
  document.getElementById('bannerSub').innerText = `${patient.admission_dx} | ${patient.service}`;
  document.getElementById('bannerBed').innerText = patient.bed_number;
  loadPatientsFromDB();
}

// Registrar nuevo paciente en Supabase
async function submitNewPatient() {
  if (!supabase) {
    alert('Configura Supabase en Ajustes.');
    return;
  }

  const bed = document.getElementById('newBed').value.trim();
  const initials = document.getElementById('newInitials').value.trim();
  const age = parseInt(document.getElementById('newAge').value) || null;
  const service = document.getElementById('newService').value.trim();
  const dx = document.getElementById('newDx').value.trim();

  if (!bed || !dx) {
    alert('Cama y diagnóstico son obligatorios.');
    return;
  }

  const { data, error } = await supabase.from('patients').insert([
    { bed_number: bed, initials: initials || 'N.N.', age, service, admission_dx: dx }
  ]).select();

  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    closePatientModal();
    loadPatientsFromDB();
    if (data && data[0]) selectPatient(data[0]);
  }
}

// Dictado por voz
function toggleDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('El reconocimiento por voz no es compatible con este navegador.');
    return;
  }

  if (!speechRec) {
    speechRec = new SpeechRecognition();
    speechRec.lang = 'es-ES';
    speechRec.continuous = true;
    speechRec.interimResults = false;

    speechRec.onresult = (evt) => {
      const transcript = evt.results[evt.results.length - 1][0].transcript;
      const input = document.getElementById('rawNotesInput');
      input.value += (input.value ? ' ' : '') + transcript;
    };
    speechRec.onerror = () => stopDictation();
  }

  if (recordingState) {
    stopDictation();
  } else {
    speechRec.start();
    recordingState = true;
    document.getElementById('dictationLabel').innerText = 'Escuchando...';
    document.getElementById('dictationButton').classList.add('bg-rose-100', 'text-rose-700', 'border-rose-300');
  }
}

function stopDictation() {
  if (speechRec) speechRec.stop();
  recordingState = false;
  document.getElementById('dictationLabel').innerText = 'Dictar por voz';
  document.getElementById('dictationButton').classList.remove('bg-rose-100', 'text-rose-700', 'border-rose-300');
}

// Estructurar con Gemini Flash
async function processWithGemini() {
  const apiKey = localStorage.getItem('DOCASSIST_GEMINI_KEY');
  if (!apiKey) {
    alert('Ingresa tu API Key de Gemini en Ajustes.');
    openConfigModal();
    return;
  }

  const rawDraft = document.getElementById('rawNotesInput').value.trim();
  if (!rawDraft) {
    alert('Ingresa o dicta notas para procesar.');
    return;
  }

  const patientCtx = activePatient 
    ? `Paciente: ${activePatient.initials}, Cama: ${activePatient.bed_number}, Dx: ${activePatient.admission_dx}`
    : 'Paciente de sala hospitalaria general.';

  let typeTemplate = '';
  if (currentTab === 'evolucion') {
    typeTemplate = `Formato: EVOLUCIÓN CLÍNICA DIARIA (SOAP):
- [SUBJETIVO]: Síntomas referidos, noche previa, tolerancia oral.
- [OBJETIVO]: Signos vitales normalizados, exploración por aparatos/sistemas y paraclínicos.
- [ANÁLISIS]: Evolución del cuadro y estabilidad clínica.
- [PLAN]: Terapéutica, estudios pendientes y conducta médica.`;
  } else if (currentTab === 'ingreso') {
    typeTemplate = `Formato: NOTA DE INGRESO HOSPITALARIO:
- MOTIVO DE CONSULTA Y ENFERMEDAD ACTUAL.
- ANTECEDENTES DE RELEVANCIA.
- EXPLORACIÓN FÍSICA Y SIGNOS VITALES.
- IMPRESIÓN DIAGNÓSTICA (Sindromática / Etiológica).
- PLAN DE MANEJO INICIAL.`;
  } else if (currentTab === 'egreso') {
    typeTemplate = `Formato: RESUMEN DE EGRESO (EPICRISIS):
- DIAGNÓSTICO DEFINITIVO DE EGRESO.
- RESUMEN DE ESTANCIA HOSPITALARIA Y EVOLUCIÓN.
- TRATAMIENTO AMBULATORIO Y RECETA DE ALTA.
- SIGNOS DE ALARMA Y CONTROL POR CONSULTA EXTERNA.`;
  }

  const prompt = `Eres un asistente médico experto en redacción de expedientes clínicos formales.
Contexto: ${patientCtx}
Notas dictadas: "${rawDraft}"

Estructura el informe siguiendo estrictamente:
${typeTemplate}

Reglas estrictas:
1. Lenguaje médico conciso y formal en español.
2. NO inventes datos que no fueron aportados en el dictado. Si algo es mandatorio pero falta, escribe [No reportado] o [Pendiente].
3. Proporciona solo el texto médico formal final sin saludos ni introducciones.`;

  const btn = document.getElementById('processAiBtn');
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Redactando...</span>`;
  refreshIcons();

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const result = await res.json();
    if (result.candidates && result.candidates[0].content.parts[0].text) {
      document.getElementById('finalClinicalNote').value = result.candidates[0].content.parts[0].text;
    } else {
      alert('Error en la respuesta de Gemini. Revisa tu API key.');
    }
  } catch (e) {
    alert('Error al conectar con la IA: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i><span>Estructurar con IA</span>`;
    refreshIcons();
  }
}

function copyToClipboard() {
  const note = document.getElementById('finalClinicalNote').value;
  if (!note) return;
  navigator.clipboard.writeText(note);
  alert('¡Nota copiada al portapapeles!');
}

// Guardar nota en Supabase
async function saveNoteToDatabase() {
  if (!supabase) {
    alert('Configura Supabase en Ajustes.');
    return;
  }
  const note = document.getElementById('finalClinicalNote').value.trim();
  if (!note) {
    alert('No hay nota estructurada para guardar.');
    return;
  }

  const { error } = await supabase.from('clinical_notes').insert([{
    patient_id: activePatient ? activePatient.id : null,
    bed_number: activePatient ? activePatient.bed_number : 'General',
    note_type: currentTab,
    raw_draft: document.getElementById('rawNotesInput').value,
    structured_content: note
  }]);

  if (error) {
    alert('Error al almacenar en Supabase: ' + error.message);
  } else {
    alert('¡Nota guardada con éxito en el historial!');
  }
}

window.onload = initConfig;
