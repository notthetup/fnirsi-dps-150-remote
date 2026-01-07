# FNIRSI DPS-150 Remote Control

A web-based remote control interface for the [FNIRSI DPS-150](https://www.fnirsi.com/products/dps-150) programmable DC power supply. This project provides a modern, real-time web UI to control and monitor your power supply over USB, compiled into a standalone executable with no dependencies.

Inspired by [@cho45/fnirsi-dps-150](https://github.com/cho45/fnirsi-dps-150) which connects to the DPS-150 directly over [WebSerial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API). Unfortunately, that architecture means it can't be controlled over the internet. So I built this so that you can run this on a RaspberryPi on your bench and monitor/control it remotely.

![screenshot](./screenshot.png)

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

The binary is written to `bin/fnirsi-dps-150-remote`. Run it with an optional port override:

```sh
./bin/fnirsi-dps-150-remote --port 8080
```

### Cross-Platform Builds

Build for specific platforms:

```sh
deno task build:macos-intel    # macOS (Intel x86_64)
deno task build:macos-arm      # macOS (Apple Silicon ARM64)
deno task build:linux-intel    # Linux (x86_64)
deno task build:linux-arm      # Linux (ARM64)
deno task build:windows        # Windows (x86_64)
```

Binaries will be written to:

- `bin/fnirsi-dps-150-remote-macos-intel` - macOS Intel
- `bin/fnirsi-dps-150-remote-macos-arm` - macOS Apple Silicon
- `bin/fnirsi-dps-150-remote-linux-intel` - Linux (x86_64)
- `bin/fnirsi-dps-150-remote-linux-arm` - Linux (ARM64)
- `bin/fnirsi-dps-150-remote-windows.exe` - Windows

The compiled binary includes:

- Complete web UI (HTML, CSS, JavaScript)
- WebSocket server
- DPS-150 protocol implementation
- Serial port communication

No external files or dependencies needed at runtime!

### Manual Serial Port Configuration

If auto-detection fails or you need to specify a particular port:

```bash
# Linux/macOS
SERIAL_PORT=/dev/ttyUSB0 ./bin/fnirsi-dps-150-remote --port 8080

# Windows (PowerShell)
$env:SERIAL_PORT="COM3"; .\bin\fnirsi-dps-150-remote-windows.exe --port 8080

# Windows (Command Prompt)
set SERIAL_PORT=COM3 && bin\fnirsi-dps-150-remote-windows.exe --port 8080
```

### Run as a systemd Service (Linux)

1. Build and install the binary (for example: `sudo install -m 755 bin/fnirsi-dps-150-remote /usr/local/bin/`).
2. Copy the service unit: `sudo cp etc/dps150@.service /etc/systemd/system/`.
3. Copy the udev rule so the service starts when the device is plugged in: `sudo cp etc/99-dsp150-systemd.rules /etc/udev/rules.d/`.
4. Reload udev and systemd:
  - `sudo udevadm control --reload-rules && sudo udevadm trigger`
  - `sudo systemctl daemon-reload`
5. Enable and start for your serial device (replace `ttyACM0` with the actual path): `sudo systemctl enable --now dps150@ttyACM0.service`.

The provided udev rule (vendor/product `2e3c:5740`) automatically starts `dps150@<device>.service` when the power supply is connected and stops it on removal.

## Credits

This project was inspired by and builds upon the excellent work of:

- **[@cho45/fnirsi-dps-150](https://github.com/cho45/fnirsi-dps-150)** - Original protocol
  reverse-engineering and reference implementation

The protocol documentation and reference JavaScript implementation provided the foundation for this
remote control interface.

A significant amount of the code was written using AI Agents.

## License

MIT License. See [LICENSE](LICENSE) for details.
