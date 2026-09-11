# Installing the extension, and the keyboard shortcuts

For installing a `ply-visualizer-*.vsix` you have been given, and a reference
for every shortcut the viewer listens for.

## Install

```bash
code --install-extension /path/to/ply-visualizer.vsix --force
```

Then Command Palette → **Developer: Reload Window**. Nothing loads until you do.

`--force` is only needed when replacing a copy you already have. The GUI
equivalent is Extensions → `···` → **Install from VSIX…**.

Check it took:

```bash
code --list-extensions --show-versions | grep ply
```

### Notes that actually bite

- **Requires VS Code 1.104 or newer.** Older editors refuse the install.
- **Working over SSH, WSL or a dev container?** The extension runs next to your
  files, so it has to be installed on the **remote**, not locally, or it cannot
  open anything there. The GUI installer targets the local side by default;
  running `code --install-extension` from a terminal on the remote is the
  reliable route.
- **Cursor** uses the same `code` CLI, and on a remote it lives at
  `~/.cursor-server/bin/*/bin/remote-cli/code`.
- **Going back to the marketplace build:**
  `code --install-extension kleinicke.ply-visualizer --force`, or uninstall from
  the Extensions panel. Note that if the VSIX has a higher version number than
  the published extension, the marketplace will not update over it until you do
  this deliberately.

## Keyboard shortcuts

Every shortcut is a **bare letter**, with two deliberate exclusions:

- Anything held with **Cmd / Ctrl / Alt** is passed through to the editor, so
  Cmd+C, Cmd+A, Cmd+S and Cmd+F keep working.
- Shortcuts are ignored while focus is in a text input, textarea or select.

`C` carries no shortcut on purpose — it belongs to copying.

Press **H** to print the list to the console at any time.

### View

| Key | Action                                                   |
| --- | -------------------------------------------------------- |
| `F` | Fit camera to all objects (disabled in sequence mode)    |
| `R` | Reset camera and up vector                               |
| `P` | Toggle orthographic projection (approximate — see below) |
| `A` | Toggle coordinate axes                                   |
| `W` | Move rotation centre to the world origin (0, 0, 0)       |
| `H` | Print this shortcut list to the console                  |

### Control schemes

| Key | Scheme                                                              |
| --- | ------------------------------------------------------------------- |
| `I` | Legacy Trackball — delta-based three.js TrackballControls (default) |
| `T` | Trackball — CloudCompare-style virtual ball                         |
| `O` | OrbitControls                                                       |
| `K` | Arcball                                                             |
| `L` | Invert Arcball handedness                                           |

### Orientation

| Key | Action                            |
| --- | --------------------------------- |
| `X` | Set up vector to +X               |
| `Y` | Set up vector to +Y               |
| `Z` | Set up vector to +Z (CAD style)   |
| `B` | OpenGL camera convention (Y-up)   |
| `V` | OpenCV camera convention (Y-down) |

### Appearance

| Key | Action                                                   |
| --- | -------------------------------------------------------- |
| `E` | Cycle Eye-Dome Lighting: Auto → All → Off                |
| `G` | Toggle gamma correction                                  |
| `S` | Toggle screen-space scaling (distance-based point sizes) |
| `U` | Toggle transparency                                      |

## About `P` — orthographic projection

It is _pseudo_-orthographic: a 2° field of view with a compensating dolly, not a
real orthographic camera. Framing, point pixel size and pan speed are all
preserved across the toggle, so the only visible change is that parallel edges
stay parallel.

The residual convergence across the object is about 2° — invisible when
comparing scans, findable if you are doing true orthographic measurement.

Moving the **Field of View** slider returns to perspective, since changing fov
by hand is a perspective gesture. The toggle also lives in the Camera panel next
to that slider.
