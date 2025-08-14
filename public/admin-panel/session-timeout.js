<script>
// ===== Config =====
const SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 horas
const KEY_LOGIN     = 'etnya_login';
const KEY_LAST_ACT  = 'etnya_lastActivity';
const LOGIN_PAGE    = 'login.html';

// ===== Helpers =====
function now() { return Date.now(); }
function setLastActivity(ts = now()) {
  localStorage.setItem(KEY_LAST_ACT, String(ts));
}
function getLastActivity() {
  const v = Number(localStorage.getItem(KEY_LAST_ACT));
  return Number.isFinite(v) ? v : 0;
}
function isLoggedIn() {
  return localStorage.getItem(KEY_LOGIN) === 'ok';
}
function onExpire() {
  // Evitar doble ejecución entre pestañas
  if (!isLoggedIn()) return;
  alert('Sesión expirada por inactividad. Volvé a iniciar sesión.');
  localStorage.removeItem(KEY_LOGIN);
  // Podés limpiar otros datos si usás más claves
  // localStorage.removeItem('token'); etc.

  // Redirigir si no estamos ya en el login
  if (!location.pathname.endsWith('/' + LOGIN_PAGE)) {
    location.href = LOGIN_PAGE;
  }
}

// ===== Registrar actividad =====
const ACTIVITY_EVENTS = ['mousemove','mousedown','keydown','scroll','click','touchstart','visibilitychange'];
let throttled = false;
function markActivity() {
  // Si la pestaña está oculta, no marcamos como actividad real
  if (document.visibilityState === 'hidden') return;
  if (throttled) return;
  throttled = true;
  setLastActivity();
  setTimeout(() => throttled = false, 500); // evitar spam
}
ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, markActivity, { passive: true }));

// Sincronizar entre pestañas
window.addEventListener('storage', (e) => {
  if (e.key === KEY_LAST_ACT) {
    // otra pestaña marcó actividad: no hacemos nada más
  }
  if (e.key === KEY_LOGIN && e.newValue !== 'ok') {
    // si otra pestaña cerró sesión, seguimos su estado
    onExpire();
  }
});

// ===== Chequeo periódico =====
function checkTimeout() {
  if (!isLoggedIn()) return; // si no está logueado, no hace nada
  const last = getLastActivity();
  if (!last) {
    // primera carga de la jornada
    setLastActivity();
    return;
  }
  if (now() - last > SESSION_TIMEOUT_MS) {
    onExpire();
  }
}
setInterval(checkTimeout, 60 * 1000); // chequear cada 1 minuto

// Marcar actividad al cargar si estamos logueados
if (isLoggedIn()) setLastActivity();
</script>
