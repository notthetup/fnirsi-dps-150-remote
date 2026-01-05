const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

// ========== Protocol Implementation ==========

// Register constants (from reference DPS-150 implementation)
const REG_VOLTAGE_SET = 0xC1; // 193 - float32
const REG_CURRENT_SET = 0xC2; // 194 - float32
const REG_INPUT_VOLTAGE = 0xC0; // 192 - float32
const REG_OUTPUT_TELEMETRY = 0xC3; // 195 - 3x float32 (voltage, current, power)
const REG_TEMPERATURE = 0xC4; // 196 - float32
const REG_OUTPUT_ENABLE = 0xDB; // 219 - byte (0=off, 1=on)
const REG_PROTECTION_STATE = 0xDC; // 220 - byte
const REG_MODE = 0xDD; // 221 - byte (0=CC, 1=CV)
const REG_ALL = 0xFF; // 255 - full state dump (139 bytes)

// Command constants
const HEADER_OUTPUT = 0xF1;
const HEADER_INPUT = 0xF0;
const CMD_GET = 0xA1;
const CMD_SET = 0xB1;
const CMD_ENABLE = 0xC1;
const CMD_BAUD = 0xB0;

class DPS150Protocol {
  constructor(ws) {
    this.ws = ws;
    this.commandQueue = [];
    this.isProcessing = false;
  }

  // Frame structure: F1 [CMD] REG LEN DATA... CHK
  // CMD: B1 = set, A1 = get
  // CHK = (REG + LEN + sum(DATA)) & 0xFF

  buildFrame(cmd, reg, data = new Uint8Array(0)) {
    const len = data.length;
    const chk = (reg + len + Array.from(data).reduce((a, b) => a + b, 0)) & 0xFF;

    const frame = new Uint8Array(5 + data.length);
    frame[0] = HEADER_OUTPUT;
    frame[1] = cmd;
    frame[2] = reg;
    frame[3] = len;
    frame.set(data, 4);
    frame[4 + data.length] = chk;

    return frame;
  }

  encodeFloat32(value) {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setFloat32(0, value, true); // true = little endian
    return new Uint8Array(buf);
  }

  decodeFloat32(bytes, offset = 0) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    return view.getFloat32(0, true);
  }

  // Initialization sequence
  initSession() {
    return this.buildFrame(CMD_ENABLE, 0x00, new Uint8Array([0x01]));
  }

  // Output control
  setVoltage(volts) {
    return this.buildFrame(CMD_SET, REG_VOLTAGE_SET, this.encodeFloat32(volts));
  }

  setCurrent(amps) {
    return this.buildFrame(CMD_SET, REG_CURRENT_SET, this.encodeFloat32(amps));
  }

  setOutputState(enabled) {
    return this.buildFrame(CMD_SET, REG_OUTPUT_ENABLE, new Uint8Array([enabled ? 1 : 0]));
  }

  // Request telemetry
  requestInputVoltage() {
    return this.buildFrame(CMD_GET, REG_INPUT_VOLTAGE, new Uint8Array(0));
  }

  requestOutputTelemetry() {
    return this.buildFrame(CMD_GET, REG_OUTPUT_TELEMETRY, new Uint8Array(0));
  }

  requestTemperature() {
    return this.buildFrame(CMD_GET, REG_TEMPERATURE, new Uint8Array(0));
  }

  requestVoltageSetpoint() {
    return this.buildFrame(CMD_GET, REG_VOLTAGE_SET, new Uint8Array(0));
  }

  requestCurrentSetpoint() {
    return this.buildFrame(CMD_GET, REG_CURRENT_SET, new Uint8Array(0));
  }

  requestOutputState() {
    return this.buildFrame(CMD_GET, REG_OUTPUT_ENABLE, new Uint8Array(0));
  }

  requestAllState() {
    return this.buildFrame(CMD_GET, REG_ALL, new Uint8Array([0x00]));
  }

  // Send binary frame
  send(frame) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
    }
  }

  // Queue and send commands with delay
  async queueCommand(frame) {
    this.commandQueue.push(frame);
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  async processQueue() {
    this.isProcessing = true;
    while (this.commandQueue.length > 0) {
      const frame = this.commandQueue.shift();
      this.send(frame);
      await new Promise((r) => setTimeout(r, 50)); // 50ms delay between commands
    }
    this.isProcessing = false;
  }
}

// ========== Vue App ==========

createApp({
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-4xl font-bold mb-2">DPS-150 Control</h1>
          <p class="text-slate-400">Programmable DC Power Supply</p>
        </div>

        <!-- Connection Status -->
        <div class="mb-6 flex items-center gap-3">
          <div :class="['w-3 h-3 rounded-full', wsConnected ? 'bg-green-500' : 'bg-red-500']"></div>
          <span class="text-sm">{{ wsConnected ? 'Connected' : 'Disconnected' }}</span>
        </div>

        <!-- Main Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Control Panel -->
          <div class="lg:col-span-2 space-y-6">

            <!-- Output Enable -->
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h2 class="text-xl font-semibold mb-4">Output Control</h2>
              <button
                @click="toggleOutput"
                :class="[
                  'w-full py-3 px-6 rounded-lg font-semibold text-lg transition-all',
                  outputEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                ]"
              >
                {{ outputEnabled ? 'Stop Output' : 'Start Output' }}
              </button>
            </div>

            <!-- Voltage & Current Controls -->
            <div class="grid grid-cols-2 gap-6">
              <!-- Voltage Setpoint -->
              <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <label class="block text-sm font-medium text-slate-300 mb-2">
                  Voltage Setpoint (V)
                </label>
                <input
                  v-model.number="voltageSetpoint"
                  @change="updateVoltage"
                  type="number"
                  step="0.1"
                  class="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white mb-3"
                />
                <div class="text-sm text-slate-400">
                  Actual: <span class="text-green-400 font-semibold">{{ actualVoltage.toFixed(2) }}V</span>
                </div>
              </div>

              <!-- Current Limit -->
              <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <label class="block text-sm font-medium text-slate-300 mb-2">
                  Current Limit (A)
                </label>
                <input
                  v-model.number="currentLimit"
                  @change="updateCurrent"
                  type="number"
                  step="0.01"
                  class="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white mb-3"
                />
                <div class="text-sm text-slate-400">
                  Actual: <span class="text-green-400 font-semibold">{{ actualCurrent.toFixed(2) }}A</span>
                </div>
              </div>
            </div>

            <!-- Status Display -->
            <div class="grid grid-cols-2 gap-6">
              <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div class="text-sm text-slate-400 mb-1">Voltage Mode</div>
                <div class="text-2xl font-bold">{{ voltageMode }}</div>
              </div>
              <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
                <div class="text-sm text-slate-400 mb-1">Output Power</div>
                <div class="text-2xl font-bold">{{ outputPower.toFixed(2) }}W</div>
              </div>
            </div>
          </div>

          <!-- Info Panel -->
          <div class="space-y-6">
            <!-- General Status -->
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <h3 class="text-lg font-semibold mb-4">Status</h3>
              <div :class="['px-3 py-2 rounded text-center font-semibold', status === 'OK' ? 'bg-green-900 text-green-200' : 'bg-yellow-900 text-yellow-200']">
                {{ status }}
              </div>
            </div>

            <!-- Input Voltage -->
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div class="text-sm text-slate-400 mb-2">Input Voltage</div>
              <div class="text-3xl font-bold">{{ inputVoltage.toFixed(1) }}V</div>
            </div>

            <!-- Temperature -->
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700">
              <div class="text-sm text-slate-400 mb-2">Temperature</div>
              <div :class="['text-3xl font-bold', temperature > 60 ? 'text-red-400' : 'text-blue-400']">
                {{ temperature.toFixed(1) }}°C
              </div>
            </div>

            <!-- Last Update -->
            <div class="bg-slate-800 rounded-lg p-6 border border-slate-700 text-xs text-slate-400">
              <div v-if="lastUpdate">Last Update: {{ lastUpdate }}</div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `,

  setup() {
    const wsConnected = ref(false);
    const socket = ref(null);
    const protocol = ref(null);

    // Control state
    const outputEnabled = ref(false);
    const voltageSetpoint = ref(12.0);
    const currentLimit = ref(0.5);

    // Telemetry
    const actualVoltage = ref(0);
    const actualCurrent = ref(0);
    const outputPower = ref(0);
    const internalTemperature = ref(0);
    const inputVoltage = ref(0);
    const voltageMode = ref("CC");
    const status = ref("OK");

    // UI state
    const messageCount = ref(0);
    const lastUpdate = ref("");
    const telemetryInterval = ref(null);

    const connect = () => {
      const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
      socket.value = new WebSocket(wsUrl);
      socket.value.binaryType = "arraybuffer";

      socket.value.addEventListener("open", async () => {
        wsConnected.value = true;
        protocol.value = new DPS150Protocol(socket.value);
        // Initialize communication
        await protocol.value.queueCommand(protocol.value.initSession());

        // Request initial state (full dump includes all values)
        await new Promise((r) => setTimeout(r, 100));
        await protocol.value.queueCommand(protocol.value.requestAllState());

        // Request setpoints and state explicitly to ensure we get them
        await new Promise((r) => setTimeout(r, 200));
        await protocol.value.queueCommand(protocol.value.requestVoltageSetpoint());
        await protocol.value.queueCommand(protocol.value.requestCurrentSetpoint());
        await protocol.value.queueCommand(protocol.value.requestOutputState());

        // Request telemetry
        await protocol.value.queueCommand(protocol.value.requestInputVoltage());
        await protocol.value.queueCommand(protocol.value.requestOutputTelemetry());
        await protocol.value.queueCommand(protocol.value.requestTemperature());

        // Start polling telemetry every 500ms
        if (telemetryInterval.value) clearInterval(telemetryInterval.value);
        telemetryInterval.value = setInterval(async () => {
          if (wsConnected.value && protocol.value) {
            await protocol.value.queueCommand(protocol.value.requestInputVoltage());
            await protocol.value.queueCommand(protocol.value.requestOutputTelemetry());
            await protocol.value.queueCommand(protocol.value.requestTemperature());
          }
        }, 500);
      });

      socket.value.addEventListener("message", (event) => {
        messageCount.value++;
        lastUpdate.value = new Date().toLocaleTimeString();

        if (event.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(event.data);
          handleProtocolMessage(bytes);
        }
      });

      socket.value.addEventListener("close", () => {
        wsConnected.value = false;
        if (telemetryInterval.value) clearInterval(telemetryInterval.value);
        setTimeout(connect, 2000);
      });

      socket.value.addEventListener("error", (err) => {
        console.error(`WebSocket error: ${err}`);
      });
    };

    const handleProtocolMessage = (bytes) => {
      if (bytes.length < 5) return;

      const header = bytes[0];
      const cmd = bytes[1];
      const reg = bytes[2];
      const len = bytes[3];

      if (header !== HEADER_INPUT) return; // Only handle input messages (0xF0)
      if (len === 0) return; // Skip empty responses

      const data = bytes.slice(4, 4 + len);

      // Parse telemetry based on register
      switch (reg) {
        case REG_VOLTAGE_SET: // 0xC1 = 193
          if (len >= 4) {
            voltageSetpoint.value = protocol.value.decodeFloat32(data, 0);
          }
          break;

        case REG_CURRENT_SET: // 0xC2 = 194
          if (len >= 4) {
            currentLimit.value = protocol.value.decodeFloat32(data, 0);
          }
          break;

        case REG_INPUT_VOLTAGE: // 0xC0 = 192
          if (len >= 4) {
            inputVoltage.value = protocol.value.decodeFloat32(data, 0);
          }
          break;

        case REG_OUTPUT_TELEMETRY: // 0xC3 = 195 (voltage, current, power)
          if (len >= 12) {
            actualVoltage.value = protocol.value.decodeFloat32(data, 0);
            actualCurrent.value = protocol.value.decodeFloat32(data, 4);
            outputPower.value = protocol.value.decodeFloat32(data, 8);
          }
          break;

        case REG_TEMPERATURE: // 0xC4 = 196
          if (len >= 4) {
            internalTemperature.value = protocol.value.decodeFloat32(data, 0);
          }
          break;

        case REG_OUTPUT_ENABLE: // 0xDB = 219
          if (len >= 1) {
            outputEnabled.value = data[0] === 1;
          }
          break;

        case REG_PROTECTION_STATE: // 0xDC = 220
          if (len >= 1) {
            const states = ["", "OVP", "OCP", "OPP", "OTP", "LVP"];
            status.value = states[data[0]] || "OK";
          }
          break;

        case REG_MODE: // 0xDD = 221
          if (len >= 1) {
            voltageMode.value = data[0] === 0 ? "CC" : "CV";
          }
          break;

        case REG_ALL: // 0xFF = 255 (full state dump)
          parseFullState(data);
          break;

        default:
          // Ignore unknown registers silently
          break;
      }
    };

    const parseFullState = (data) => {
      if (data.length < 139) {
        console.warn(`Full state incomplete: ${data.length} bytes`);
        return;
      }

      // Parse full state according to reference implementation offsets
      const offset = 0;
      try {
        inputVoltage.value = protocol.value.decodeFloat32(data, offset + 0); // d1
        voltageSetpoint.value = protocol.value.decodeFloat32(data, offset + 4); // d2
        currentLimit.value = protocol.value.decodeFloat32(data, offset + 8); // d3
        actualVoltage.value = protocol.value.decodeFloat32(data, offset + 12); // d4
        actualCurrent.value = protocol.value.decodeFloat32(data, offset + 16); // d5
        outputPower.value = protocol.value.decodeFloat32(data, offset + 20); // d6
        internalTemperature.value = protocol.value.decodeFloat32(data, offset + 24); // d7

        // Skip presets (d8-d19)
        // Skip protections (d20-d24)
        // Skip brightness/volume (d25-d26)

        outputEnabled.value = data[offset + 107] === 1; // d30

        const protectionCode = data[offset + 108]; // d31
        const states = ["", "OVP", "OCP", "OPP", "OTP", "LVP"];
        status.value = states[protectionCode] || "OK";

        voltageMode.value = data[offset + 109] === 0 ? "CC" : "CV"; // d32
      } catch (e) {
        console.error("Error parsing full state:", e);
      }
    };

    const updateVoltage = async () => {
      if (protocol.value && wsConnected.value) {
        await protocol.value.queueCommand(protocol.value.setVoltage(voltageSetpoint.value));      }
    };

    const updateCurrent = async () => {
      if (protocol.value && wsConnected.value) {
        await protocol.value.queueCommand(protocol.value.setCurrent(currentLimit.value));
      }
    };

    const toggleOutput = async () => {
      if (protocol.value && wsConnected.value) {
        outputEnabled.value = !outputEnabled.value;
        await protocol.value.queueCommand(protocol.value.setOutputState(outputEnabled.value));
      }
    };

    onMounted(() => {
      connect();
    });

    onUnmounted(() => {
      if (telemetryInterval.value) clearInterval(telemetryInterval.value);
      if (socket.value) {
        socket.value.close();
      }
    });

    return {
      wsConnected,
      outputEnabled,
      voltageSetpoint,
      currentLimit,
      actualVoltage,
      actualCurrent,
      outputPower,
      inputVoltage,
      voltageMode,
      status,
      temperature: internalTemperature,
      messageCount,
      lastUpdate,
      toggleOutput,
      updateVoltage,
      updateCurrent,
    };
  },
}).mount("#app");
