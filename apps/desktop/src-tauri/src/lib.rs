use serde::Serialize;
use std::{
    io::Read,
    process::{Command, Stdio},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use wait_timeout::ChildExt;

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const MAX_PROBE_OUTPUT_BYTES: usize = 8 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolProbe {
    name: &'static str,
    status: &'static str,
    version_output: Option<String>,
    probe: &'static str,
    read_only: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEnvironmentSnapshot {
    id: String,
    platform: &'static str,
    architecture: &'static str,
    node: ToolProbe,
    git: ToolProbe,
    dsh: ToolProbe,
    captured_at_unix_ms: u64,
    read_only: bool,
    system_mutation_allowed: bool,
}

fn normalized_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        _ => "Unknown",
    }
}

fn read_capped(mut reader: impl Read) -> String {
    let mut kept = Vec::with_capacity(MAX_PROBE_OUTPUT_BYTES);
    let mut buffer = [0_u8; 1024];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                let remaining = MAX_PROBE_OUTPUT_BYTES.saturating_sub(kept.len());
                kept.extend_from_slice(&buffer[..count.min(remaining)]);
            }
        }
    }
    String::from_utf8_lossy(&kept).trim().to_string()
}

fn fixed_version_probe(name: &'static str, program: &'static str) -> ToolProbe {
    let mut child = match Command::new(program)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return ToolProbe {
                name,
                status: "MISSING",
                version_output: None,
                probe: "FIXED_VERSION_ARGUMENT",
                read_only: true,
            };
        }
        Err(_) => {
            return ToolProbe {
                name,
                status: "ERROR",
                version_output: None,
                probe: "FIXED_VERSION_ARGUMENT",
                read_only: true,
            };
        }
    };

    let stdout = child
        .stdout
        .take()
        .map(|stream| thread::spawn(|| read_capped(stream)));
    let stderr = child
        .stderr
        .take()
        .map(|stream| thread::spawn(|| read_capped(stream)));
    let wait_result = child.wait_timeout(PROBE_TIMEOUT);
    let exit_status = match wait_result {
        Ok(Some(status)) => Some(status),
        Ok(None) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    };
    let stdout = stdout
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let stderr = stderr
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let version_output = if stdout.is_empty() { stderr } else { stdout };
    let succeeded = exit_status.is_some_and(|status| status.success());

    ToolProbe {
        name,
        status: if succeeded { "AVAILABLE" } else { "ERROR" },
        version_output: (!version_output.is_empty()).then_some(version_output),
        probe: "FIXED_VERSION_ARGUMENT",
        read_only: true,
    }
}

fn build_runtime_environment_snapshot() -> RuntimeEnvironmentSnapshot {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    RuntimeEnvironmentSnapshot {
        id: format!("runtime-{}-{}", now.as_secs(), now.subsec_nanos()),
        platform: normalized_platform(),
        architecture: std::env::consts::ARCH,
        node: fixed_version_probe("Node.js", "node"),
        git: fixed_version_probe("Git", "git"),
        dsh: fixed_version_probe("DSH", "dsh"),
        captured_at_unix_ms: now.as_millis() as u64,
        read_only: true,
        system_mutation_allowed: false,
    }
}

#[tauri::command]
fn detect_runtime_environment() -> RuntimeEnvironmentSnapshot {
    build_runtime_environment_snapshot()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![detect_runtime_environment])
        .run(tauri::generate_context!())
        .expect("error while running HarnessHub Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_program_is_reported_without_mutation() {
        let result = fixed_version_probe("Missing", "harnesshub-runtime-probe-missing");
        assert_eq!(result.status, "MISSING");
        assert!(result.read_only);
        assert!(result.version_output.is_none());
    }

    #[test]
    fn snapshot_never_allows_system_mutation() {
        let snapshot = build_runtime_environment_snapshot();
        assert!(snapshot.read_only);
        assert!(!snapshot.system_mutation_allowed);
        assert!(snapshot.node.read_only && snapshot.git.read_only && snapshot.dsh.read_only);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn detects_macos_platform_and_architecture() {
        let snapshot = build_runtime_environment_snapshot();
        assert_eq!(snapshot.platform, "macOS");
        assert!(!snapshot.architecture.is_empty());
    }
}
