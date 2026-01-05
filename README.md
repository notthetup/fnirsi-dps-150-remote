# FNIRSI DPS-150 Remote Control

A web-based remote control interface for the [FNIRSI DPS-150](https://www.fnirsi.com/products/dps-150) programmable DC power supply. This
project provides a modern, real-time web UI to control and monitor your power supply over USB,
compiled into a standalone executable with no dependencies.

![screenshot](./screenshot.png)

## Features

### Control

- **Output Enable/Disable** - Toggle power output with visual feedback
- **Voltage Control** - Set output voltage with real-time actual voltage display
- **Current Control** - Set current limit with live current monitoring
- **Real-time Telemetry** - Live updates every 500ms for all parameters

### Monitoring

- **Input Voltage** - Monitor the power supply input voltage
- **Output Voltage & Current** - Real-time actual values
- **Output Power** - Calculated power consumption
- **Internal Temperature** - Device temperature monitoring with warning colors
- **Voltage Mode** - CC (Constant Current) or CV (Constant Voltage) indication
- **Protection Status** - Shows OVP, OCP, OPP, OTP, LVP protection states

### Technical

- Modern Vue.js 3 UI with dark theme
- Binary WebSocket protocol for efficient communication
- Full implementation of the DPS-150 USB protocol
- Standalone binary - no external dependencies needed
- Cross-platform (macOS, Linux, Windows)

## Requirements

- Deno (v1.42+ recommended)
- FNIRSI DPS-150 Power Supply connected via USB

## Quick Start

### Development Mode

```sh
deno task dev
```

Serves at `http://localhost:8000` by default. Override with `--port <number>`:

```sh
deno task dev -- --port 8080
```

### Build Standalone Binary

```sh
deno task build
```

The binary is written to `bin/server`. Run it with an optional port override:

```sh
./bin/server --port 8080
```

### Cross-Platform Builds

Build for specific platforms:

```sh
deno task build:macos-intel    # macOS (Intel x86_64)
deno task build:macos-arm      # macOS (Apple Silicon ARM64)
deno task build:linux          # Linux (x86_64)
deno task build:windows        # Windows (x86_64)
```

Build for all platforms at once:

```sh
deno task build:all
```

Binaries will be written to:

- `bin/server-macos-intel` - macOS Intel
- `bin/server-macos-arm` - macOS Apple Silicon
- `bin/server-linux` - Linux
- `bin/server-windows.exe` - Windows

The compiled binary includes:

- Complete web UI (HTML, CSS, JavaScript)
- WebSocket server
- DPS-150 protocol implementation
- Serial port communication

No external files or dependencies needed at runtime!

## Protocol Implementation

This project implements the complete FNIRSI DPS-150 USB CDC protocol:

- **Session Management** - Initialize and maintain device communication
- **Register Access** - Read/write voltage, current, and protection settings
- **Telemetry Streaming** - Real-time monitoring of all device parameters
- **Binary Protocol** - Efficient frame-based communication with checksums
- **Float32 Encoding** - IEEE-754 little-endian for voltage/current values

### Key Registers

- `0xC1` (193) - Voltage Setpoint
- `0xC2` (194) - Current Limit
- `0xC0` (192) - Input Voltage
- `0xC3` (195) - Output Telemetry (V, I, P)
- `0xC4` (196) - Temperature
- `0xDB` (219) - Output Enable/Disable
- `0xDD` (221) - Mode (CC/CV)
- `0xFF` (255) - Full State Dump

## Serial Communication

- **Device Detection**: Automatically finds DPS-150 by USB VID:PID `2e3c:5740`
- **Manual Path**: Set `SERIAL_PORT` environment variable to override auto-detection
- **Baud Rate**: 115200 (8N1)
- **Interface**: USB CDC (Virtual COM port)
- **Library**: `jsr:@paltaio/serialport` (pure FFI, no native dependencies)

### Manual Serial Port Configuration

If auto-detection fails or you need to specify a particular port:

```bash
# Linux/macOS
SERIAL_PORT=/dev/ttyUSB0 ./bin/server --port 8080

# Windows (PowerShell)
$env:SERIAL_PORT="COM3"; .\bin\server.exe --port 8080

# Windows (Command Prompt)
set SERIAL_PORT=COM3 && bin\server.exe --port 8080
```

## UI Customization

Edit the files under `public/`:

- `index.html` - Main page structure
- `style.css` - Styling and layout
- `script.js` - Vue.js application and protocol logic

Changes are live-reloaded in dev mode and bundled into the binary on build.

## Development Tasks

```sh
deno task dev       # Run development server
deno task build     # Compile standalone binary
deno task fmt       # Format code
deno task lint      # Lint code
deno task check     # Type-check TypeScript
```

## Credits

This project was inspired by and builds upon the excellent work of:

- **[@cho45/fnirsi-dps-150](https://github.com/cho45/fnirsi-dps-150)** - Original protocol
  reverse-engineering and reference implementation

The protocol documentation and reference JavaScript implementation provided the foundation for this
remote control interface.

A significant amount of the code was written using AI Agents.

## License

See LICENSE file for details.
