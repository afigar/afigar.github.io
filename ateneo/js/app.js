// WebApp Ateneo - Asistencia
// Configuración de endpoints n8n (REEMPLAZAR con tus URLs reales)
const CONFIG = {
  SERVICE_UUID: "12345678-1234-1234-1234-1234567890ab",
  CHARACTERISTIC_UUID: "abcd1234-5678-1234-5678-abcdef123456",
  DEVICE_NAME_PREFIX: "AteneoBeacon-C3",
  N8N_LOGIN_URL: "https://TU_N8N_URL/webhook/login",
  N8N_CREATE_ATENEO_URL: "https://TU_N8N_URL/webhook/create-ateneo",
  N8N_CHECKIN_URL: "https://TU_N8N_URL/webhook/ateneo-checkin"
};

const state = {
  user: null,          // {id, nombre, matricula, role}
  ateneoId: null       // string
};

function qs(sel) {
  return document.querySelector(sel);
}

function createLayout() {
  const app = qs("#app");
  app.innerHTML = `
    <div id="loginView" class="card">
      <h2>Ingreso</h2>
      <label>Usuario
        <input id="loginUser" autocomplete="username" />
      </label>
      <label>Contraseña
        <input id="loginPass" type="password" autocomplete="current-password" />
      </label>
      <button id="btnLogin">Ingresar</button>
      <div id="loginStatus" class="status"></div>
    </div>

    <div id="panelView" class="hidden">
      <div class="header">
        <h2>Panel de Ateneo</h2>
        <div class="user-info">
          <span id="userName"></span> (<span id="userRole"></span>)
        </div>
      </div>

      <div id="adminPanel" class="hidden card">
        <h3>Coordinador - Crear Ateneo</h3>
        <button id="btnCrearAteneo">Crear nuevo ateneo</button>
        <p class="hint">Mostrá este QR en pantalla para que los asistentes lo escaneen.</p>
        <div id="qrContainer" class="qr-container"></div>
        <div id="adminStatus" class="status"></div>
      </div>

      <div id="userPanel" class="hidden card">
        <h3>Registro de asistencia</h3>
        <p id="infoAteneo"></p>
        <button id="btnCheckin">Registrar asistencia (Bluetooth)</button>
        <div id="status" class="status"></div>
        <p class="hint small">
          Usá Chrome en Android, con Bluetooth activado, y acercate a la puerta del ateneo.
        </p>
      </div>
    </div>
  `;

  // Listeners
  qs("#btnLogin").addEventListener("click", onLogin);
  qs("#btnCrearAteneo").addEventListener("click", onCrearAteneo);
  qs("#btnCheckin").addEventListener("click", onCheckin);

  const form = qs("#loginView");
  form.addEventListener("keypress", (ev) => {
    if (ev.key === "Enter") {
      onLogin();
    }
  });
}

async function onLogin() {
  const username = qs("#loginUser").value.trim();
  const password = qs("#loginPass").value.trim();
  const statusEl = qs("#loginStatus");

  if (!username || !password) {
    statusEl.textContent = "Completa usuario y contraseña.";
    return;
  }

  statusEl.textContent = "Validando usuario...";
  try {
    const resp = await fetch(CONFIG.N8N_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data.ok) {
      statusEl.textContent = "Usuario o contraseña incorrectos.";
      return;
    }

    state.user = {
      id: data.user_id,
      nombre: data.nombre,
      matricula: data.matricula,
      role: data.role || "USER"
    };

    // Guardar en localStorage para próxima vez (opcional)
    try {
      localStorage.setItem("ateneo_user", JSON.stringify(state.user));
    } catch (e) {}

    // Cambiar a vista panel
    qs("#loginView").classList.add("hidden");
    qs("#panelView").classList.remove("hidden");

    qs("#userName").textContent = state.user.nombre;
    qs("#userRole").textContent = state.user.role;

    // Si es admin, mostrar panel admin
    if (state.user.role.toUpperCase() === "ADMIN") {
      qs("#adminPanel").classList.remove("hidden");
    } else {
      // Usuario: necesita un ateneo en la URL
      const params = new URLSearchParams(location.search);
      const ateneo = params.get("ateneo");
      if (!ateneo) {
        qs("#userPanel").classList.remove("hidden");
        qs("#infoAteneo").textContent =
          "Ateneo no especificado en la URL. Consultá el QR al coordinador.";
      } else {
        state.ateneoId = ateneo;
        qs("#userPanel").classList.remove("hidden");
        qs("#infoAteneo").textContent = "Ateneo: " + ateneo;
      }
    }

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error de conexión con el servidor.";
  }
}

async function onCrearAteneo() {
  const adminStatus = qs("#adminStatus");
  adminStatus.textContent = "Creando ateneo en servidor...";

  try {
    const resp = await fetch(CONFIG.N8N_CREATE_ATENEO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: state.user.id })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ateneo_id || !data.checkin_url) {
      adminStatus.textContent = "Error creando ateneo.";
      return;
    }

    state.ateneoId = data.ateneo_id;

    // Generar QR
    const cont = qs("#qrContainer");
    cont.innerHTML = "";
    new QRCode(cont, {
      text: data.checkin_url,
      width: 256,
      height: 256
    });

    adminStatus.textContent = "Ateneo creado: " + data.ateneo_id;

  } catch (err) {
    console.error(err);
    adminStatus.textContent = "Error de conexión con el servidor.";
  }
}

async function onCheckin() {
  const statusEl = qs("#status");
  statusEl.textContent = "";

  if (!state.ateneoId) {
    statusEl.textContent =
      "No se encontró el ID del ateneo. Escaneá el QR del coordinador.";
    return;
  }

  if (!navigator.bluetooth) {
    statusEl.textContent =
      "Este navegador no soporta Bluetooth. Usá Chrome en Android.";
    return;
  }

  try {
    statusEl.textContent = "Buscando beacon BLE...";
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: CONFIG.DEVICE_NAME_PREFIX }],
      optionalServices: [CONFIG.SERVICE_UUID]
    });

    statusEl.textContent = "Conectando al beacon...";
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(CONFIG.SERVICE_UUID);
    const charac = await service.getCharacteristic(CONFIG.CHARACTERISTIC_UUID);
    const value = await charac.readValue();
    const decoder = new TextDecoder("utf-8");
    const secret = decoder.decode(value);

    statusEl.textContent = "Enviando asistencia al servidor...";

    const payload = {
      ateneo_id: state.ateneoId,
      user_id: state.user.id,
      nombre: state.user.nombre,
      matricula: state.user.matricula,
      secret,
      ts_client: new Date().toISOString(),
      user_agent: navigator.userAgent
    };

    const resp = await fetch(CONFIG.N8N_CHECKIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({}));
    if (resp.ok) {
      statusEl.textContent = "Asistencia registrada ✔️";
    } else {
      statusEl.textContent =
        "Error desde servidor: " + (data.message || resp.status);
    }

  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error: " + err.message;
  }
}

function tryAutoLoginFromStorage() {
  try {
    const saved = localStorage.getItem("ateneo_user");
    if (!saved) return;
    const user = JSON.parse(saved);
    if (!user || !user.id) return;
    // Prellenar usuario
    qs("#loginUser").value = user.id;
  } catch (e) {}
}

document.addEventListener("DOMContentLoaded", () => {
  createLayout();
  tryAutoLoginFromStorage();
});
