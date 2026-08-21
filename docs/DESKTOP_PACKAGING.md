# Desktop package builds

HarnessHub Desktop is packaged on native GitHub Actions runners. This avoids
shipping installers made through unsupported macOS-to-Windows or
macOS-to-Linux cross-compilation.

## Targets

| Platform | Rust target | Bundles |
| --- | --- | --- |
| Windows x86 | `i686-pc-windows-msvc` | NSIS `.exe`, WiX `.msi` |
| Windows x64 | `x86_64-pc-windows-msvc` | NSIS `.exe`, WiX `.msi` |
| Windows ARM64 | `aarch64-pc-windows-msvc` | NSIS `.exe`, WiX `.msi` |
| Linux x64 | `x86_64-unknown-linux-gnu` | `.deb`, `.AppImage` |
| Linux ARM64 | `aarch64-unknown-linux-gnu` | `.deb`, `.AppImage` |

## Running a package build

In GitHub, open **Actions** → **Desktop packages** → **Run workflow**. The
five output groups are uploaded as workflow artifacts. A tag matching
`desktop-v*` starts the same build and, after all five native builds succeed,
publishes their installers to the GitHub Release for that tag.

The workflow uses the project version from
`apps/desktop/src-tauri/tauri.conf.json` in each generated bundle name.

## Release readiness

Artifacts are functional unsigned test installers. Before public distribution,
configure Windows code signing and validate each installer in a clean VM or
device of its target architecture. Linux bundles should likewise be tested on
the matching distribution and architecture.
