use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    env,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use wait_timeout::ChildExt;

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const OPERATION_TIMEOUT: Duration = Duration::from_secs(300);
const PROFILE_MUTATION_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_OUTPUT_BYTES: usize = 32 * 1024;
const DSH_PACKAGE: &str = "@deepseek-ai/dsh";
const DSH_VERSION: &str = "0.1.0-rc.8";
const DSH_INTEGRITY: &str =
    "sha512-VQU5NlomrKLRgcXuOf+sxWFvqxPA8q9vMhrKPlPPXiOJEhGlGlAdiyxZvZxkCVI+v0zbhe21cY3/luLyxpSzzA==";
const NODE_VERSION: &str = "22.19.0";
const PNPM_VERSION: &str = "11.19.0";
const PNPM_INTEGRITY: &str =
    "sha512-eIHz7VkNRyxKlV4riLISF5ERYGbcyIy8o4SeybYPG7qm0syyIfqR2k4cZb7yvL43k2Wup6xTnHv4be3DobItzg==";
const OFFICIAL_NPM_REGISTRY: &str = "https://registry.npmjs.org";
const MAX_TOOLCHAIN_DOWNLOAD_BYTES: u64 = 110 * 1024 * 1024;
const MANAGED_PROFILE: &str = "web";
#[cfg(test)]
const REGISTRY_SOURCES: &str = include_str!("../../../../config/registry-sources.json");
const SESSION_KEYRING_SERVICE: &str = "com.harnesshub.desktop";
const SESSION_KEYRING_ACCOUNT: &str = "oauth-session";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolProbe {
    name: String,
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
    pnpm: ToolProbe,
    git: ToolProbe,
    dsh: ToolProbe,
    managed_toolchain_ready: bool,
    captured_at_unix_ms: u64,
    read_only: bool,
    system_mutation_allowed: bool,
}

#[derive(Clone, Copy, Debug)]
enum ArchiveKind {
    TarGz,
    Zip,
}

#[derive(Clone, Copy, Debug)]
struct NodeArtifact {
    file_name: &'static str,
    sha256: &'static str,
    archive_kind: ArchiveKind,
}

#[derive(Clone, Debug)]
struct ManagedToolchain {
    node: PathBuf,
    npm_cli: PathBuf,
    pnpm_cli: PathBuf,
    node_bin: PathBuf,
    pnpm_bin: PathBuf,
}

#[cfg(test)]
#[derive(Clone, Debug, Deserialize)]
struct RegistryNpmSource {
    package_name: String,
}

#[cfg(test)]
#[derive(Clone, Debug, Deserialize)]
struct RegistrySource {
    id: String,
    npm: RegistryNpmSource,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginOperationRequest {
    plugin_id: String,
    package_name: String,
    version: String,
    integrity: String,
    source_kind: Option<String>,
    registry_status: Option<String>,
    risk_level: Option<String>,
    #[serde(default)]
    confirmation_count: u8,
    source_url: Option<String>,
    source_commit: Option<String>,
    snapshot_sha256: Option<String>,
    confirmed: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginRemoveRequest {
    package_name: String,
    confirmed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedPluginRecord {
    plugin_id: String,
    package_name: String,
    version: String,
    integrity: String,
    #[serde(default)]
    source_kind: Option<String>,
    #[serde(default)]
    registry_status: Option<String>,
    #[serde(default)]
    risk_level: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    source_commit: Option<String>,
    #[serde(default)]
    snapshot_sha256: Option<String>,
    #[serde(default = "default_true")]
    enabled: bool,
    #[serde(default)]
    issue: Option<String>,
    installed_at_unix_ms: u64,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallationAuditRecord {
    id: String,
    action: String,
    plugin_id: Option<String>,
    package_name: Option<String>,
    version: Option<String>,
    result: String,
    message: String,
    timestamp_unix_ms: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStateFile {
    prepared: bool,
    dsh_version: Option<String>,
    prepared_at_unix_ms: Option<u64>,
    #[serde(default)]
    runtime_process: Option<ManagedRuntimeLease>,
    plugins: Vec<ManagedPluginRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedRuntimeLease {
    pid: u32,
    port: u16,
    started_at_unix_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedRuntimeStatus {
    prepared: bool,
    dsh_version: String,
    profile: &'static str,
    running: bool,
    port: Option<u16>,
    url: Option<String>,
    pid: Option<u32>,
    plugins: Vec<ManagedPluginRecord>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedOperationResult {
    success: bool,
    action: String,
    message: String,
    runtime: ManagedRuntimeStatus,
}

struct ManagedRuntimeProcess {
    child: Option<Child>,
    pid: u32,
    port: u16,
}

#[derive(Default)]
struct NativeState {
    operation_lock: Mutex<()>,
    runtime: Mutex<Option<ManagedRuntimeProcess>>,
}

struct CommandResult {
    status: Option<ExitStatus>,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

impl CommandResult {
    fn success(&self) -> bool {
        self.status.is_some_and(|status| status.success()) && !self.timed_out
    }

    fn user_message(&self) -> String {
        if self.timed_out {
            return "操作超时。未确认完成，请检查任务记录后重试。".to_string();
        }
        let message = if self.stderr.trim().is_empty() {
            self.stdout.trim()
        } else {
            self.stderr.trim()
        };
        if message.is_empty() {
            "命令未成功完成。".to_string()
        } else {
            message.chars().take(500).collect()
        }
    }
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn unique_id(prefix: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{prefix}-{}-{}", now.as_secs(), now.subsec_nanos())
}

fn normalized_platform() -> &'static str {
    match env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        _ => "Unknown",
    }
}

fn managed_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("managed-runtime"))
        .map_err(|_| "无法定位 HarnessHub 本地数据目录。".to_string())
}

fn dsh_home(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(managed_root(app)?.join("dsh-home"))
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(managed_root(app)?.join("runtime-state.json"))
}

fn audit_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(managed_root(app)?.join("installation-audit.jsonl"))
}

fn toolchain_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(managed_root(app)?.join("toolchain"))
}

fn node_install_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(toolchain_root(app)?.join(format!("node-{NODE_VERSION}")))
}

fn pnpm_install_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(toolchain_root(app)?.join(format!("pnpm-{PNPM_VERSION}")))
}

fn node_artifact() -> Result<NodeArtifact, String> {
    match (env::consts::OS, env::consts::ARCH) {
        ("macos", "aarch64") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-darwin-arm64.tar.gz",
            sha256: "c59006db713c770d6ec63ae16cb3edc11f49ee093b5c415d667bb4f436c6526d",
            archive_kind: ArchiveKind::TarGz,
        }),
        ("macos", "x86_64") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-darwin-x64.tar.gz",
            sha256: "3cfed4795cd97277559763c5f56e711852d2cc2420bda1cea30c8aa9ac77ce0c",
            archive_kind: ArchiveKind::TarGz,
        }),
        ("linux", "aarch64") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-linux-arm64.tar.gz",
            sha256: "d32817b937219b8f131a28546035183d79e7fd17a86e38ccb8772901a7cd9009",
            archive_kind: ArchiveKind::TarGz,
        }),
        ("linux", "x86_64") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-linux-x64.tar.gz",
            sha256: "d36e56998220085782c0ca965f9d51b7726335aed2f5fc7321c6c0ad233aa96d",
            archive_kind: ArchiveKind::TarGz,
        }),
        ("windows", "aarch64") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-win-arm64.zip",
            sha256: "e4a7336010d58ff35b53d9dd5869095c56089c70913cf22508cf8183593e56b2",
            archive_kind: ArchiveKind::Zip,
        }),
        ("windows", "x86_64") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-win-x64.zip",
            sha256: "ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86",
            archive_kind: ArchiveKind::Zip,
        }),
        ("windows", "x86") => Ok(NodeArtifact {
            file_name: "node-v22.19.0-win-x86.zip",
            sha256: "708b8a297a19e9ac433e32ac0fc496755757c5e00bd5a0683917e73cae5fe8ea",
            archive_kind: ArchiveKind::Zip,
        }),
        _ => Err("当前系统或 CPU 架构尚未提供受控 Runtime 工具链。".to_string()),
    }
}

fn node_binary(root: &Path) -> PathBuf {
    if cfg!(windows) {
        root.join("node.exe")
    } else {
        root.join("bin/node")
    }
}

fn npm_cli(root: &Path) -> PathBuf {
    if cfg!(windows) {
        root.join("node_modules/npm/bin/npm-cli.js")
    } else {
        root.join("lib/node_modules/npm/bin/npm-cli.js")
    }
}

fn pnpm_cli(root: &Path) -> PathBuf {
    root.join("node_modules/pnpm/bin/pnpm.cjs")
}

fn pnpm_bin(root: &Path) -> PathBuf {
    root.join("node_modules/.bin")
}

fn managed_toolchain_paths(app: &AppHandle) -> Result<ManagedToolchain, String> {
    let node_root = node_install_root(app)?;
    let pnpm_root = pnpm_install_root(app)?;
    Ok(ManagedToolchain {
        node: node_binary(&node_root),
        npm_cli: npm_cli(&node_root),
        pnpm_cli: pnpm_cli(&pnpm_root),
        node_bin: if cfg!(windows) {
            node_root
        } else {
            node_root.join("bin")
        },
        pnpm_bin: pnpm_bin(&pnpm_root),
    })
}

fn safe_archive_relative(path: &Path) -> Option<PathBuf> {
    let mut components = path.components();
    if !matches!(components.next()?, Component::Normal(_)) {
        return None;
    }
    let mut relative = PathBuf::new();
    for component in components {
        match component {
            Component::Normal(value) => relative.push(value),
            _ => return None,
        }
    }
    (!relative.as_os_str().is_empty()).then_some(relative)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|_| "无法读取下载文件。".to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "无法校验下载文件。".to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn download_verified(url: &str, expected_sha256: &str, target: &Path) -> Result<(), String> {
    if !url.starts_with("https://nodejs.org/dist/") {
        return Err("工具链下载地址不在内置官方白名单中。".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建工具链下载目录。".to_string())?;
    }
    if target.is_file() && sha256_file(target).is_ok_and(|value| value == expected_sha256) {
        return Ok(());
    }
    let _ = fs::remove_file(target);
    let temporary = target.with_extension("download");
    let _ = fs::remove_file(&temporary);
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(3))
        .build()
        .map_err(|_| "无法初始化受控下载器。".to_string())?;
    let mut response = client
        .get(url)
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|_| "无法从 Node.js 官方站点下载固定版本工具链。".to_string())?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_TOOLCHAIN_DOWNLOAD_BYTES)
    {
        return Err("工具链下载大小超过安全上限。".to_string());
    }
    let mut file =
        fs::File::create(&temporary).map_err(|_| "无法创建工具链临时下载文件。".to_string())?;
    let mut digest = Sha256::new();
    let mut total = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = response
            .read(&mut buffer)
            .map_err(|_| "工具链下载中断。".to_string())?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > MAX_TOOLCHAIN_DOWNLOAD_BYTES {
            let _ = fs::remove_file(&temporary);
            return Err("工具链下载大小超过安全上限。".to_string());
        }
        digest.update(&buffer[..count]);
        file.write_all(&buffer[..count])
            .map_err(|_| "无法保存工具链下载内容。".to_string())?;
    }
    file.flush()
        .map_err(|_| "无法完成工具链下载写入。".to_string())?;
    let observed = format!("{:x}", digest.finalize());
    if observed != expected_sha256 {
        let _ = fs::remove_file(&temporary);
        return Err("Node.js 工具链 SHA-256 校验失败，安装已停止。".to_string());
    }
    fs::rename(&temporary, target).map_err(|_| "无法提交已校验的工具链下载。".to_string())
}

fn extract_tar_gz_safely(archive_path: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|_| "无法读取工具链压缩包。".to_string())?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive
        .entries()
        .map_err(|_| "无法读取工具链压缩包目录。".to_string())?;
    for entry in entries {
        let mut entry = entry.map_err(|_| "工具链压缩包内容无效。".to_string())?;
        let path = entry
            .path()
            .map_err(|_| "工具链压缩包路径无效。".to_string())?;
        let Some(relative) = safe_archive_relative(&path) else {
            continue;
        };
        let output = target.join(relative);
        let entry_type = entry.header().entry_type();
        if entry_type.is_dir() {
            fs::create_dir_all(&output).map_err(|_| "无法创建工具链目录。".to_string())?;
        } else if entry_type.is_file() {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(|_| "无法创建工具链目录。".to_string())?;
            }
            entry
                .unpack(&output)
                .map_err(|_| "无法解压工具链文件。".to_string())?;
        }
    }
    Ok(())
}

fn extract_zip_safely(archive_path: &Path, target: &Path) -> Result<(), String> {
    let file = fs::File::open(archive_path).map_err(|_| "无法读取工具链压缩包。".to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "工具链 ZIP 无效。".to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|_| "工具链 ZIP 内容无效。".to_string())?;
        let Some(enclosed) = entry.enclosed_name() else {
            return Err("工具链 ZIP 包含不安全路径。".to_string());
        };
        let Some(relative) = safe_archive_relative(&enclosed) else {
            continue;
        };
        let output = target.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&output).map_err(|_| "无法创建工具链目录。".to_string())?;
        } else {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent).map_err(|_| "无法创建工具链目录。".to_string())?;
            }
            let mut output_file =
                fs::File::create(&output).map_err(|_| "无法创建工具链文件。".to_string())?;
            std::io::copy(&mut entry, &mut output_file)
                .map_err(|_| "无法解压工具链文件。".to_string())?;
        }
    }
    Ok(())
}

fn read_runtime_state(app: &AppHandle) -> RuntimeStateFile {
    state_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn write_runtime_state(app: &AppHandle, state: &RuntimeStateFile) -> Result<(), String> {
    let root = managed_root(app)?;
    fs::create_dir_all(&root).map_err(|_| "无法创建 HarnessHub Runtime 数据目录。".to_string())?;
    let target = state_path(app)?;
    let temporary = target.with_extension("json.tmp");
    let bytes =
        serde_json::to_vec_pretty(state).map_err(|_| "无法保存 Runtime 状态。".to_string())?;
    fs::write(&temporary, bytes).map_err(|_| "无法保存 Runtime 状态。".to_string())?;
    fs::rename(&temporary, &target).map_err(|_| "无法提交 Runtime 状态。".to_string())
}

fn append_audit(app: &AppHandle, record: &InstallationAuditRecord) -> Result<(), String> {
    let path = audit_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建审计目录。".to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|_| "无法写入安装审计。".to_string())?;
    serde_json::to_writer(&mut file, record).map_err(|_| "无法写入安装审计。".to_string())?;
    file.write_all(b"\n")
        .map_err(|_| "无法写入安装审计。".to_string())
}

fn audit(
    app: &AppHandle,
    action: &str,
    plugin_id: Option<&str>,
    package_name: Option<&str>,
    version: Option<&str>,
    result: &str,
    message: &str,
) {
    let _ = append_audit(
        app,
        &InstallationAuditRecord {
            id: unique_id("audit"),
            action: action.to_string(),
            plugin_id: plugin_id.map(ToOwned::to_owned),
            package_name: package_name.map(ToOwned::to_owned),
            version: version.map(ToOwned::to_owned),
            result: result.to_string(),
            message: message.to_string(),
            timestamp_unix_ms: unix_ms(),
        },
    );
}

fn read_capped(mut reader: impl Read) -> String {
    let mut kept = Vec::with_capacity(MAX_OUTPUT_BYTES);
    let mut buffer = [0_u8; 2048];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                let remaining = MAX_OUTPUT_BYTES.saturating_sub(kept.len());
                kept.extend_from_slice(&buffer[..count.min(remaining)]);
            }
        }
    }
    String::from_utf8_lossy(&kept).trim().to_string()
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}

fn add_version_bin_dirs(result: &mut Vec<PathBuf>, root: &Path) {
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                result.push(path.join("bin"));
                result.push(path.join("installation").join("bin"));
            }
        }
    }
}

fn executable_search_dirs() -> Vec<PathBuf> {
    let mut directories = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    directories.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ]);
    if let Some(home) = home_dir() {
        directories.extend([
            home.join(".volta/bin"),
            home.join(".asdf/shims"),
            home.join(".local/share/mise/shims"),
            home.join("Library/pnpm"),
        ]);
        add_version_bin_dirs(&mut directories, &home.join(".nvm/versions/node"));
        add_version_bin_dirs(
            &mut directories,
            &home.join(".local/share/fnm/node-versions"),
        );
    }
    directories.sort();
    directories.dedup();
    directories
}

fn executable_name(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.cmd")
    } else {
        name.to_string()
    }
}

fn resolve_program(name: &str) -> Option<PathBuf> {
    let executable = executable_name(name);
    executable_search_dirs()
        .into_iter()
        .map(|directory| directory.join(&executable))
        .find(|path| path.is_file())
}

fn execution_path() -> String {
    env::join_paths(executable_search_dirs())
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

fn isolate_process_tree(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(not(unix))]
    let _ = command;
}

#[cfg(unix)]
fn process_exists(pid: u32) -> bool {
    // SAFETY: signal 0 does not alter the target process; it only checks that
    // the exact PID still exists and is signalable by this user.
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(not(unix))]
fn process_exists(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()
        .is_ok_and(|output| String::from_utf8_lossy(&output.stdout).contains(&pid.to_string()))
}

#[cfg(unix)]
fn descendant_pids(root: u32) -> Vec<u32> {
    let Ok(output) = Command::new("/bin/ps")
        .args(["-axo", "pid=,ppid="])
        .output()
    else {
        return Vec::new();
    };
    let pairs = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            Some((
                fields.next()?.parse::<u32>().ok()?,
                fields.next()?.parse::<u32>().ok()?,
            ))
        })
        .collect::<Vec<_>>();
    let mut descendants = Vec::new();
    let mut parents = vec![root];
    while let Some(parent) = parents.pop() {
        for (pid, ppid) in &pairs {
            if *ppid == parent && !descendants.contains(pid) {
                descendants.push(*pid);
                parents.push(*pid);
            }
        }
    }
    descendants
}

fn terminate_process_tree(pid: u32, grace: Duration) {
    #[cfg(unix)]
    {
        let descendants = descendant_pids(pid);
        // New HarnessHub children have their own process group. The explicit
        // descendant pass also cleans up processes left by pre-0.7.3 builds.
        // SAFETY: all PIDs originate from an exact HarnessHub-managed command.
        unsafe {
            let _ = libc::kill(-(pid as i32), libc::SIGTERM);
            for child_pid in descendants.iter().rev() {
                let _ = libc::kill(*child_pid as i32, libc::SIGTERM);
            }
            let _ = libc::kill(pid as i32, libc::SIGTERM);
        }
        let deadline = Instant::now() + grace;
        while process_exists(pid) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
        }
        if process_exists(pid) {
            // SAFETY: same verified process tree as above, after a bounded
            // graceful shutdown window.
            unsafe {
                let _ = libc::kill(-(pid as i32), libc::SIGKILL);
                for child_pid in descendants.iter().rev() {
                    let _ = libc::kill(*child_pid as i32, libc::SIGKILL);
                }
                let _ = libc::kill(pid as i32, libc::SIGKILL);
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = grace;
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}

fn run_fixed_command(
    program: &Path,
    args: &[String],
    environment: &[(String, String)],
    current_dir: Option<&Path>,
    timeout: Duration,
) -> Result<CommandResult, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .env("PATH", execution_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in environment {
        command.env(key, value);
    }
    if let Some(directory) = current_dir {
        command.current_dir(directory);
    }
    isolate_process_tree(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "无法启动 HarnessHub 受控 Runtime 操作，请重新准备所需环境。".to_string())?;
    let stdout = child
        .stdout
        .take()
        .map(|stream| thread::spawn(|| read_capped(stream)));
    let stderr = child
        .stderr
        .take()
        .map(|stream| thread::spawn(|| read_capped(stream)));
    let wait = child
        .wait_timeout(timeout)
        .map_err(|_| "无法等待本地操作完成。".to_string())?;
    let (status, timed_out) = match wait {
        Some(status) => (Some(status), false),
        None => {
            terminate_process_tree(child.id(), Duration::from_secs(2));
            let _ = child.wait();
            (None, true)
        }
    };
    Ok(CommandResult {
        status,
        stdout: stdout
            .and_then(|reader| reader.join().ok())
            .unwrap_or_default(),
        stderr: stderr
            .and_then(|reader| reader.join().ok())
            .unwrap_or_default(),
        timed_out,
    })
}

fn exact_version_available(program: &Path, args: &[String], expected: &str) -> bool {
    if !program.is_file() {
        return false;
    }
    run_fixed_command(program, args, &[], None, PROBE_TIMEOUT).is_ok_and(|result| {
        result.success() && result.stdout.trim().trim_start_matches('v') == expected
    })
}

fn managed_execution_path(toolchain: &ManagedToolchain) -> String {
    let mut directories = vec![toolchain.node_bin.clone(), toolchain.pnpm_bin.clone()];
    directories.extend(executable_search_dirs());
    env::join_paths(directories)
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

fn managed_package_environment(
    app: &AppHandle,
    toolchain: &ManagedToolchain,
) -> Result<Vec<(String, String)>, String> {
    let root = toolchain_root(app)?;
    let cache = root.join("cache/npm");
    let store = root.join("cache/pnpm-store");
    let pnpm_home = root.join("pnpm-home");
    fs::create_dir_all(&cache).map_err(|_| "无法创建受控 npm 缓存。".to_string())?;
    fs::create_dir_all(&store).map_err(|_| "无法创建受控 pnpm Store。".to_string())?;
    fs::create_dir_all(&pnpm_home).map_err(|_| "无法创建受控 pnpm 目录。".to_string())?;
    let user_config = root.join("managed.npmrc");
    if !user_config.exists() {
        fs::write(
            &user_config,
            b"ignore-scripts=true\naudit=false\nfund=false\n",
        )
        .map_err(|_| "无法创建受控 npm 配置。".to_string())?;
    }
    Ok(vec![
        ("PATH".to_string(), managed_execution_path(toolchain)),
        (
            "NPM_CONFIG_USERCONFIG".to_string(),
            user_config.to_string_lossy().into_owned(),
        ),
        (
            "npm_config_cache".to_string(),
            cache.to_string_lossy().into_owned(),
        ),
        (
            "npm_config_registry".to_string(),
            OFFICIAL_NPM_REGISTRY.to_string(),
        ),
        ("npm_config_ignore_scripts".to_string(), "true".to_string()),
        (
            "npm_config_store_dir".to_string(),
            store.to_string_lossy().into_owned(),
        ),
        (
            "PNPM_HOME".to_string(),
            pnpm_home.to_string_lossy().into_owned(),
        ),
        ("PNPM_CONFIG_IGNORE_SCRIPTS".to_string(), "true".to_string()),
        (
            "PNPM_DISABLE_SELF_UPDATE_CHECK".to_string(),
            "1".to_string(),
        ),
        ("NO_UPDATE_NOTIFIER".to_string(), "1".to_string()),
        (
            "COREPACK_ENABLE_DOWNLOAD_PROMPT".to_string(),
            "0".to_string(),
        ),
    ])
}

fn ensure_managed_node(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let root = node_install_root(app)?;
    let node = node_binary(&root);
    let npm = npm_cli(&root);
    if npm.is_file() && exact_version_available(&node, &["--version".to_string()], NODE_VERSION) {
        return Ok((node, npm));
    }
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|_| "无法替换不完整的受控 Node.js。".to_string())?;
    }
    let artifact = node_artifact()?;
    let downloads = toolchain_root(app)?.join("downloads");
    let archive = downloads.join(artifact.file_name);
    let url = format!(
        "https://nodejs.org/dist/v{NODE_VERSION}/{}",
        artifact.file_name
    );
    download_verified(&url, artifact.sha256, &archive)?;
    let staging = toolchain_root(app)?.join(unique_id("node-staging"));
    fs::create_dir_all(&staging).map_err(|_| "无法创建 Node.js 解压目录。".to_string())?;
    let extracted = match artifact.archive_kind {
        ArchiveKind::TarGz => extract_tar_gz_safely(&archive, &staging),
        ArchiveKind::Zip => extract_zip_safely(&archive, &staging),
    };
    if let Err(message) = extracted {
        let _ = fs::remove_dir_all(&staging);
        return Err(message);
    }
    let staged_node = node_binary(&staging);
    let staged_npm = npm_cli(&staging);
    if !staged_npm.is_file()
        || !exact_version_available(&staged_node, &["--version".to_string()], NODE_VERSION)
    {
        let _ = fs::remove_dir_all(&staging);
        return Err("受控 Node.js 解压后验证失败。".to_string());
    }
    fs::rename(&staging, &root).map_err(|_| "无法提交受控 Node.js 工具链。".to_string())?;
    Ok((node_binary(&root), npm_cli(&root)))
}

fn observed_package_integrity(
    node: &Path,
    package_cli: &Path,
    package_spec: &str,
    environment: &[(String, String)],
    root: &Path,
) -> Result<String, String> {
    let result = run_fixed_command(
        node,
        &[
            package_cli.to_string_lossy().into_owned(),
            "view".to_string(),
            package_spec.to_string(),
            "dist.integrity".to_string(),
            "--json".to_string(),
            format!("--registry={OFFICIAL_NPM_REGISTRY}"),
        ],
        environment,
        Some(root),
        Duration::from_secs(60),
    )?;
    if !result.success() {
        return Err("无法从官方 npm Registry 获取固定包完整性。".to_string());
    }
    Ok(serde_json::from_str::<String>(&result.stdout)
        .unwrap_or_else(|_| result.stdout.trim().trim_matches('"').to_string()))
}

fn ensure_managed_toolchain(app: &AppHandle) -> Result<ManagedToolchain, String> {
    let (node, npm) = ensure_managed_node(app)?;
    let pnpm_root = pnpm_install_root(app)?;
    let mut toolchain = managed_toolchain_paths(app)?;
    toolchain.node = node;
    toolchain.npm_cli = npm;
    if exact_version_available(
        &toolchain.node,
        &[
            toolchain.pnpm_cli.to_string_lossy().into_owned(),
            "--version".to_string(),
        ],
        PNPM_VERSION,
    ) {
        return Ok(toolchain);
    }
    if pnpm_root.exists() {
        fs::remove_dir_all(&pnpm_root).map_err(|_| "无法替换不完整的受控 pnpm。".to_string())?;
    }
    let environment = managed_package_environment(app, &toolchain)?;
    let root = managed_root(app)?;
    fs::create_dir_all(&root).map_err(|_| "无法创建 Runtime 工作目录。".to_string())?;
    let observed = observed_package_integrity(
        &toolchain.node,
        &toolchain.npm_cli,
        &format!("pnpm@{PNPM_VERSION}"),
        &environment,
        &root,
    )?;
    if observed != PNPM_INTEGRITY {
        return Err("pnpm 完整性与 HarnessHub 内置证据不一致，准备已停止。".to_string());
    }
    let staging = toolchain_root(app)?.join(unique_id("pnpm-staging"));
    let result = run_fixed_command(
        &toolchain.node,
        &[
            toolchain.npm_cli.to_string_lossy().into_owned(),
            "install".to_string(),
            format!("--prefix={}", staging.to_string_lossy()),
            "--ignore-scripts".to_string(),
            "--no-audit".to_string(),
            "--no-fund".to_string(),
            "--package-lock=false".to_string(),
            "--save=false".to_string(),
            format!("--registry={OFFICIAL_NPM_REGISTRY}"),
            format!("pnpm@{PNPM_VERSION}"),
        ],
        &environment,
        Some(&root),
        OPERATION_TIMEOUT,
    )?;
    if !result.success() {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("受控 pnpm 准备失败。{}", result.user_message()));
    }
    let staged_cli = pnpm_cli(&staging);
    if !exact_version_available(
        &toolchain.node,
        &[
            staged_cli.to_string_lossy().into_owned(),
            "--version".to_string(),
        ],
        PNPM_VERSION,
    ) {
        let _ = fs::remove_dir_all(&staging);
        return Err("受控 pnpm 安装后验证失败。".to_string());
    }
    fs::rename(&staging, &pnpm_root).map_err(|_| "无法提交受控 pnpm 工具链。".to_string())?;
    managed_toolchain_paths(app)
}

fn fixed_version_probe(name: &str, program: &str) -> ToolProbe {
    let Some(program_path) = resolve_program(program) else {
        return ToolProbe {
            name: name.to_string(),
            status: "MISSING",
            version_output: None,
            probe: "FIXED_VERSION_ARGUMENT",
            read_only: true,
        };
    };
    match run_fixed_command(
        &program_path,
        &["--version".to_string()],
        &[],
        None,
        PROBE_TIMEOUT,
    ) {
        Ok(result) => {
            let succeeded = result.success();
            let output = if result.stdout.is_empty() {
                result.stderr
            } else {
                result.stdout
            };
            ToolProbe {
                name: name.to_string(),
                status: if succeeded { "AVAILABLE" } else { "ERROR" },
                version_output: (!output.is_empty()).then_some(output),
                probe: "FIXED_VERSION_ARGUMENT",
                read_only: true,
            }
        }
        Err(_) => ToolProbe {
            name: name.to_string(),
            status: "ERROR",
            version_output: None,
            probe: "FIXED_VERSION_ARGUMENT",
            read_only: true,
        },
    }
}

fn managed_tool_probe(app: &AppHandle, tool: &str) -> ToolProbe {
    let paths = managed_toolchain_paths(app).ok();
    let available = match (tool, paths.as_ref()) {
        ("node", Some(paths)) => {
            exact_version_available(&paths.node, &["--version".to_string()], NODE_VERSION)
        }
        ("pnpm", Some(paths)) => exact_version_available(
            &paths.node,
            &[
                paths.pnpm_cli.to_string_lossy().into_owned(),
                "--version".to_string(),
            ],
            PNPM_VERSION,
        ),
        _ => false,
    };
    if available {
        let (name, version) = if tool == "node" {
            ("Node.js (HarnessHub managed)", format!("v{NODE_VERSION}"))
        } else {
            ("pnpm (HarnessHub managed)", PNPM_VERSION.to_string())
        };
        ToolProbe {
            name: name.to_string(),
            status: "AVAILABLE",
            version_output: Some(version),
            probe: "FIXED_VERSION_ARGUMENT",
            read_only: true,
        }
    } else {
        fixed_version_probe(if tool == "node" { "Node.js" } else { "pnpm" }, tool)
    }
}

fn managed_toolchain_ready(app: &AppHandle) -> bool {
    let Ok(paths) = managed_toolchain_paths(app) else {
        return false;
    };
    exact_version_available(&paths.node, &["--version".to_string()], NODE_VERSION)
        && exact_version_available(
            &paths.node,
            &[
                paths.pnpm_cli.to_string_lossy().into_owned(),
                "--version".to_string(),
            ],
            PNPM_VERSION,
        )
}

fn dsh_probe(app: &AppHandle) -> ToolProbe {
    let system = fixed_version_probe("DSH", "dsh");
    if system.status == "AVAILABLE" {
        return system;
    }
    let state = read_runtime_state(app);
    if state.prepared {
        ToolProbe {
            name: "DSH (HarnessHub managed)".to_string(),
            status: "AVAILABLE",
            version_output: state.dsh_version,
            probe: "FIXED_VERSION_ARGUMENT",
            read_only: true,
        }
    } else {
        system
    }
}

fn build_runtime_environment_snapshot(app: &AppHandle) -> RuntimeEnvironmentSnapshot {
    RuntimeEnvironmentSnapshot {
        id: unique_id("runtime"),
        platform: normalized_platform(),
        architecture: env::consts::ARCH,
        node: managed_tool_probe(app, "node"),
        pnpm: managed_tool_probe(app, "pnpm"),
        git: fixed_version_probe("Git", "git"),
        dsh: dsh_probe(app),
        managed_toolchain_ready: managed_toolchain_ready(app),
        captured_at_unix_ms: unix_ms(),
        read_only: true,
        system_mutation_allowed: false,
    }
}

#[cfg(test)]
fn allowlisted_sources() -> Result<Vec<RegistrySource>, String> {
    serde_json::from_str(REGISTRY_SOURCES).map_err(|_| "内置插件来源清单无效。".to_string())
}

fn validate_plugin_request(request: &PluginOperationRequest) -> Result<(), String> {
    if !request.confirmed {
        return Err("需要明确确认后才能安装。".to_string());
    }
    if request.version.is_empty()
        || request.version.len() > 64
        || request.version.starts_with('-')
        || !request
            .version
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-+_".contains(character))
    {
        return Err("插件版本不是受支持的固定版本。".to_string());
    }
    if request.package_name.is_empty()
        || request.package_name.len() > 180
        || !request
            .package_name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "@._-/".contains(character))
        || request
            .package_name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("插件包名无效。".to_string());
    }
    let github_source = request.source_kind.as_deref() == Some("GITHUB");
    if github_source {
        let commit = request
            .source_commit
            .as_deref()
            .filter(|value| {
                value.len() == 40 && value.chars().all(|character| character.is_ascii_hexdigit())
            })
            .ok_or_else(|| "GitHub 插件缺少固定 commit。".to_string())?;
        if request.integrity != format!("git-commit:{commit}") {
            return Err("GitHub 插件的 commit 证据不一致。".to_string());
        }
        github_package_spec(request)?;
    } else if !request.integrity.starts_with("sha512-") || request.integrity.len() > 256 {
        return Err("插件缺少可验证的 npm 完整性证据。".to_string());
    }

    let required_confirmations = if request.registry_status.as_deref()
        == Some("COLLECTED_UNVERIFIED")
        || matches!(
            request.risk_level.as_deref(),
            Some("HIGH") | Some("CRITICAL")
        ) {
        2
    } else {
        1
    };
    if request.confirmation_count < required_confirmations {
        return Err("风险确认次数不足，安装没有开始。".to_string());
    }
    Ok(())
}

fn github_package_spec(request: &PluginOperationRequest) -> Result<String, String> {
    let source = request
        .source_url
        .as_deref()
        .and_then(|value| Url::parse(value).ok())
        .filter(|url| url.scheme() == "https" && url.host_str() == Some("github.com"))
        .ok_or_else(|| "插件缺少有效的 GitHub 来源。".to_string())?;
    let parts = source
        .path_segments()
        .map(|segments| {
            segments
                .filter(|part| !part.is_empty())
                .map(|part| part.trim_end_matches(".git"))
                .collect::<Vec<_>>()
        })
        .filter(|parts| parts.len() == 2 && parts.iter().all(|part| !part.is_empty()))
        .ok_or_else(|| "插件 GitHub 来源格式无效。".to_string())?;
    let commit = request
        .source_commit
        .as_deref()
        .filter(|value| {
            value.len() == 40 && value.chars().all(|character| character.is_ascii_hexdigit())
        })
        .ok_or_else(|| "GitHub 插件缺少固定 commit。".to_string())?;
    Ok(format!(
        "git+https://github.com/{}/{}.git#{commit}",
        parts[0], parts[1]
    ))
}

fn plugin_package_spec(request: &PluginOperationRequest) -> Result<String, String> {
    if request.source_kind.as_deref() == Some("GITHUB") {
        github_package_spec(request)
    } else {
        Ok(format!("{}@{}", request.package_name, request.version))
    }
}

fn validate_remove_request(
    request: &PluginRemoveRequest,
    state: &RuntimeStateFile,
) -> Result<ManagedPluginRecord, String> {
    if !request.confirmed {
        return Err("需要明确确认后才能卸载。".to_string());
    }
    state
        .plugins
        .iter()
        .find(|plugin| plugin.package_name == request.package_name)
        .cloned()
        .ok_or_else(|| "未找到对应的已安装插件。".to_string())
}

fn require_runtime_tools(app: &AppHandle) -> Result<ManagedToolchain, String> {
    let toolchain = managed_toolchain_paths(app)?;
    if !exact_version_available(&toolchain.node, &["--version".to_string()], NODE_VERSION)
        || !exact_version_available(
            &toolchain.node,
            &[
                toolchain.pnpm_cli.to_string_lossy().into_owned(),
                "--version".to_string(),
            ],
            PNPM_VERSION,
        )
    {
        return Err(
            "HarnessHub 受控 Runtime 工具链尚未准备完成，请重新运行 Runtime 准备。".to_string(),
        );
    }
    Ok(toolchain)
}

fn dsh_environment(
    app: &AppHandle,
    toolchain: &ManagedToolchain,
) -> Result<Vec<(String, String)>, String> {
    let home = dsh_home(app)?;
    fs::create_dir_all(&home).map_err(|_| "无法创建隔离的 DSH 目录。".to_string())?;
    let mut environment = managed_package_environment(app, toolchain)?;
    environment.extend([
        ("DSH_HOME".to_string(), home.to_string_lossy().into_owned()),
        ("DSH_TELEMETRY_DISABLED".to_string(), "1".to_string()),
        ("npm_config_ignore_scripts".to_string(), "true".to_string()),
        ("PNPM_CONFIG_IGNORE_SCRIPTS".to_string(), "true".to_string()),
    ]);
    Ok(environment)
}

fn pnpm_dsh_args() -> Vec<String> {
    vec!["dlx".to_string(), format!("{DSH_PACKAGE}@{DSH_VERSION}")]
}

fn run_dsh(
    app: &AppHandle,
    additional: &[String],
    timeout: Duration,
) -> Result<CommandResult, String> {
    let toolchain = require_runtime_tools(app)?;
    let mut args = vec![toolchain.pnpm_cli.to_string_lossy().into_owned()];
    args.extend(pnpm_dsh_args());
    args.extend_from_slice(additional);
    let root = managed_root(app)?;
    fs::create_dir_all(&root).map_err(|_| "无法创建 Runtime 工作目录。".to_string())?;
    run_fixed_command(
        &toolchain.node,
        &args,
        &dsh_environment(app, &toolchain)?,
        Some(&root),
        timeout,
    )
}

/// Run a fixed pnpm operation inside HarnessHub's isolated DSH profile.
///
/// DSH's `plugin` subcommand is intentionally a thin pnpm forwarder. Running
/// pnpm directly here keeps the executable path under HarnessHub's control and
/// avoids depending on a globally-installed pnpm (which is especially
/// important in Finder-launched desktop apps).
fn run_profile_pnpm(
    app: &AppHandle,
    additional: &[String],
    timeout: Duration,
) -> Result<CommandResult, String> {
    let toolchain = require_runtime_tools(app)?;
    let profile = dsh_home(app)?.join("profiles").join(MANAGED_PROFILE);
    fs::create_dir_all(&profile).map_err(|_| "无法创建隔离的 DSH Profile。".to_string())?;
    let mut args = vec![toolchain.pnpm_cli.to_string_lossy().into_owned()];
    args.extend(["--dir".to_string(), profile.to_string_lossy().into_owned()]);
    args.extend_from_slice(additional);
    run_fixed_command(
        &toolchain.node,
        &args,
        &dsh_environment(app, &toolchain)?,
        Some(&profile),
        timeout,
    )
}

#[derive(Clone, Debug)]
struct ProcessRow {
    pid: u32,
    ppid: u32,
    command: String,
}

#[cfg(unix)]
fn process_rows() -> Vec<ProcessRow> {
    let Ok(output) = Command::new("/bin/ps")
        .args(["-axo", "pid=,ppid=,command="])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let pid = fields.next()?.parse::<u32>().ok()?;
            let ppid = fields.next()?.parse::<u32>().ok()?;
            let command = fields.collect::<Vec<_>>().join(" ");
            Some(ProcessRow { pid, ppid, command })
        })
        .collect()
}

#[cfg(not(unix))]
fn process_rows() -> Vec<ProcessRow> {
    Vec::new()
}

fn loopback_port_ready(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}")
            .parse()
            .expect("fixed loopback address"),
        Duration::from_millis(250),
    )
    .is_ok()
}

fn runtime_command_matches(app: &AppHandle, pid: u32, port: u16) -> bool {
    #[cfg(unix)]
    {
        let Ok(root) = managed_root(app) else {
            return false;
        };
        let root = root.to_string_lossy();
        return process_rows().into_iter().any(|row| {
            row.pid == pid
                && row.command.contains(root.as_ref())
                && row
                    .command
                    .contains(&format!("{DSH_PACKAGE}@{DSH_VERSION}"))
                && row.command.contains(" web ")
                && row.command.contains(" --no-open ")
                && row.command.contains(&format!(" --port {port}"))
        });
    }
    #[cfg(not(unix))]
    {
        let _ = app;
        process_exists(pid)
    }
}

fn valid_runtime_lease(app: &AppHandle, lease: &ManagedRuntimeLease) -> bool {
    process_exists(lease.pid)
        && loopback_port_ready(lease.port)
        && runtime_command_matches(app, lease.pid, lease.port)
}

fn parse_runtime_port(command: &str) -> Option<u16> {
    let fields = command.split_whitespace().collect::<Vec<_>>();
    fields
        .windows(2)
        .find(|pair| pair[0] == "--port")
        .and_then(|pair| pair[1].parse::<u16>().ok())
}

fn discover_legacy_runtime(app: &AppHandle) -> Option<ManagedRuntimeLease> {
    let root = managed_root(app).ok()?.to_string_lossy().into_owned();
    process_rows().into_iter().find_map(|row| {
        let port = parse_runtime_port(&row.command)?;
        (row.ppid == 1
            && row.command.contains(&root)
            && row
                .command
                .contains(&format!("{DSH_PACKAGE}@{DSH_VERSION}"))
            && row.command.contains(" web ")
            && row.command.contains(" --no-open ")
            && loopback_port_ready(port))
        .then_some(ManagedRuntimeLease {
            pid: row.pid,
            port,
            started_at_unix_ms: unix_ms(),
        })
    })
}

fn cleanup_orphaned_mutations(app: &AppHandle) -> usize {
    let Ok(root) = managed_root(app) else {
        return 0;
    };
    let root = root.to_string_lossy();
    let orphaned = process_rows()
        .into_iter()
        .filter(|row| {
            if row.ppid != 1 || !row.command.contains(root.as_ref()) {
                return false;
            }
            let legacy_dsh_mutation = row
                .command
                .contains(&format!("{DSH_PACKAGE}@{DSH_VERSION}"))
                && row.command.contains(" plugin ")
                && (row.command.contains(" remove ") || row.command.contains(" install "));
            let direct_profile_mutation = row.command.contains("pnpm")
                && row.command.contains("profiles/web")
                && (row.command.contains(" remove ")
                    || row.command.contains(" add ")
                    || row.command.contains(" install "));
            legacy_dsh_mutation || direct_profile_mutation
        })
        .collect::<Vec<_>>();
    for row in &orphaned {
        terminate_process_tree(row.pid, Duration::from_secs(2));
    }
    if !orphaned.is_empty() {
        audit(
            app,
            "RECOVER_ORPHANED_OPERATION",
            None,
            None,
            None,
            "SUCCESS",
            &format!("已终止 {} 个由旧版应用遗留的插件操作进程。", orphaned.len()),
        );
    }
    orphaned.len()
}

fn profile_manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(dsh_home(app)?
        .join("profiles")
        .join(MANAGED_PROFILE)
        .join("package.json"))
}

fn profile_package_dir(app: &AppHandle, package_name: &str) -> Result<PathBuf, String> {
    if package_name.is_empty()
        || package_name.len() > 180
        || !package_name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "@._-/".contains(character))
        || package_name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("插件包名无效。".to_string());
    }
    Ok(dsh_home(app)?
        .join("profiles")
        .join(MANAGED_PROFILE)
        .join("node_modules")
        .join(package_name))
}

fn profile_package_is_bundle(
    app: &AppHandle,
    package_name: &str,
    version: &str,
) -> Result<bool, String> {
    let manifest = profile_package_dir(app, package_name)?.join("package.json");
    let content = fs::read_to_string(&manifest)
        .map_err(|_| "插件依赖没有正确写入隔离 Profile。".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&content).map_err(|_| "插件包清单无效，安装已停止。".to_string())?;
    if value.get("name").and_then(serde_json::Value::as_str) != Some(package_name)
        || value.get("version").and_then(serde_json::Value::as_str) != Some(version)
    {
        return Err("插件实际包信息与已核验版本不一致，安装已停止。".to_string());
    }
    Ok(value
        .get("dsh")
        .and_then(|dsh| dsh.get("bundle"))
        .and_then(|bundle| bundle.get("patch"))
        .and_then(serde_json::Value::as_str)
        .is_some_and(|patch| !patch.trim().is_empty()))
}

fn update_profile_manifest_value(
    value: &mut serde_json::Value,
    package_name: &str,
    add_bundle: bool,
    remove_dependency: bool,
) -> Result<(), String> {
    let bundles = value
        .get_mut("dsh")
        .and_then(serde_json::Value::as_object_mut)
        .and_then(|dsh| dsh.get_mut("profile"))
        .and_then(serde_json::Value::as_object_mut)
        .and_then(|profile| profile.get_mut("bundles"))
        .and_then(serde_json::Value::as_array_mut)
        .ok_or_else(|| "DSH Profile 缺少受控 bundle 配置。".to_string())?;
    bundles.retain(|bundle| bundle.as_str() != Some(package_name));
    if add_bundle {
        bundles.push(serde_json::Value::String(package_name.to_string()));
    }
    if remove_dependency {
        value
            .get_mut("dependencies")
            .and_then(serde_json::Value::as_object_mut)
            .map(|dependencies| dependencies.remove(package_name));
    }
    Ok(())
}

fn update_profile_manifest(
    app: &AppHandle,
    package_name: &str,
    add_bundle: bool,
    remove_dependency: bool,
) -> Result<(), String> {
    let path = profile_manifest_path(app)?;
    let content =
        fs::read_to_string(&path).map_err(|_| "无法读取 DSH Profile 配置。".to_string())?;
    let mut value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|_| "DSH Profile 配置无效，操作已停止。".to_string())?;
    update_profile_manifest_value(&mut value, package_name, add_bundle, remove_dependency)?;
    let rendered = serde_json::to_string_pretty(&value)
        .map_err(|_| "无法写入 DSH Profile 配置。".to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, format!("{rendered}\n"))
        .map_err(|_| "无法写入 DSH Profile 配置。".to_string())?;
    fs::rename(temporary, path).map_err(|_| "无法提交 DSH Profile 配置。".to_string())
}

fn update_profile_bundle(app: &AppHandle, package_name: &str, add: bool) -> Result<(), String> {
    update_profile_manifest(app, package_name, add, false)
}

fn remove_profile_package_entry(app: &AppHandle, package_name: &str) -> Result<(), String> {
    update_profile_manifest(app, package_name, false, true)
}

/// Checks only Profile metadata and installed package manifests. This is safe to
/// run during install, uninstall, and recovery because it never loads plugin
/// code. Starting DSH remains the single point that activates installed code.
fn verify_profile_manifest_consistency(app: &AppHandle) -> Result<(), String> {
    let path = profile_manifest_path(app)?;
    let content =
        fs::read_to_string(&path).map_err(|_| "无法读取 DSH Profile 配置。".to_string())?;
    let value: serde_json::Value = serde_json::from_str(&content)
        .map_err(|_| "DSH Profile 配置无效，操作已停止。".to_string())?;
    let bundles = value
        .get("dsh")
        .and_then(serde_json::Value::as_object)
        .and_then(|dsh| dsh.get("profile"))
        .and_then(serde_json::Value::as_object)
        .and_then(|profile| profile.get("bundles"))
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "DSH Profile 缺少受控 bundle 配置。".to_string())?;
    let dependencies = value
        .get("dependencies")
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| "DSH Profile 缺少插件依赖配置。".to_string())?;

    for bundle in bundles {
        let package_name = bundle
            .as_str()
            .filter(|name| !name.trim().is_empty())
            .ok_or_else(|| "DSH Profile 包含无效的 bundle 标识。".to_string())?;
        // DSH supplies these built-in bundles itself. Every other bundle must
        // have an exact Profile dependency and a matching package manifest.
        if package_name.starts_with("@deepseek-ai/dsh-") {
            continue;
        }
        let version = dependencies
            .get(package_name)
            .and_then(serde_json::Value::as_str)
            .filter(|version| !version.trim().is_empty())
            .ok_or_else(|| format!("DSH Profile 中的插件 {package_name} 缺少依赖记录。"))?;
        if !profile_package_is_bundle(app, package_name, version)? {
            return Err(format!(
                "DSH Profile 中的插件 {package_name} 未正确安装，已阻止启动。"
            ));
        }
    }
    Ok(())
}

fn remove_profile_package_link(app: &AppHandle, package_name: &str) -> Result<(), String> {
    let path = profile_package_dir(app, package_name)?;
    let Ok(metadata) = fs::symlink_metadata(&path) else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::remove_file(path).map_err(|_| "插件已停用，但残留文件暂时无法清理。".to_string())
    } else {
        fs::remove_dir_all(path).map_err(|_| "插件已停用，但残留文件暂时无法清理。".to_string())
    }
}

fn restore_profile_and_dependencies(
    app: &AppHandle,
    backups: &BTreeMap<PathBuf, Option<Vec<u8>>>,
) -> Result<(), String> {
    restore_profile_files(backups)?;
    let result = run_profile_pnpm(
        app,
        &[
            "install".to_string(),
            "--ignore-scripts".to_string(),
            "--no-frozen-lockfile".to_string(),
        ],
        PROFILE_MUTATION_TIMEOUT,
    )?;
    if result.success() {
        Ok(())
    } else {
        Err("已恢复配置，但无法恢复插件依赖。".to_string())
    }
}

/// Repair the one inconsistency that can occur after an interrupted profile
/// mutation: a user-confirmed bundle is recorded in runtime-state but missing
/// from the profile's own node_modules. npm sources are integrity-checked again;
/// GitHub sources are restored from their exact recorded commit.
fn reconcile_managed_profile(app: &AppHandle, state: &mut RuntimeStateFile) -> Result<(), String> {
    cleanup_orphaned_mutations(app);
    for plugin in &mut state.plugins {
        if !plugin.enabled {
            update_profile_bundle(app, &plugin.package_name, false)?;
            continue;
        }
        let present =
            profile_package_is_bundle(app, &plugin.package_name, &plugin.version).unwrap_or(false);
        if present {
            update_profile_bundle(app, &plugin.package_name, true)?;
            plugin.issue = None;
            continue;
        }
        let request = PluginOperationRequest {
            plugin_id: plugin.plugin_id.clone(),
            package_name: plugin.package_name.clone(),
            version: plugin.version.clone(),
            integrity: plugin.integrity.clone(),
            source_kind: plugin.source_kind.clone(),
            registry_status: plugin.registry_status.clone(),
            risk_level: plugin.risk_level.clone(),
            confirmation_count: 2,
            source_url: plugin.source_url.clone(),
            source_commit: plugin.source_commit.clone(),
            snapshot_sha256: plugin.snapshot_sha256.clone(),
            confirmed: true,
        };
        let source_verification = validate_plugin_request(&request).and_then(|_| {
            if request.source_kind.as_deref() == Some("GITHUB") {
                Ok(())
            } else {
                verify_npm_integrity(app, &request)
            }
        });
        if let Err(reason) = source_verification {
            plugin.enabled = false;
            plugin.issue = Some(reason.clone());
            update_profile_bundle(app, &plugin.package_name, false)?;
            audit(
                app,
                "REPAIR_PLUGIN",
                Some(&plugin.plugin_id),
                Some(&plugin.package_name),
                Some(&plugin.version),
                "DISABLED",
                "插件来源已变化或依赖缺失，已安全停用；Runtime 将继续启动。",
            );
            continue;
        }
        audit(
            app,
            "REPAIR_PLUGIN",
            Some(&plugin.plugin_id),
            Some(&plugin.package_name),
            Some(&plugin.version),
            "RUNNING",
            "正在恢复已确认插件的受控 Profile 依赖。",
        );
        let result = run_profile_pnpm(
            app,
            &[
                "add".to_string(),
                "--save-exact".to_string(),
                "--ignore-scripts".to_string(),
                plugin_package_spec(&request)?,
            ],
            PROFILE_MUTATION_TIMEOUT,
        )?;
        if !result.success()
            || !profile_package_is_bundle(app, &plugin.package_name, &plugin.version)?
        {
            plugin.enabled = false;
            plugin.issue = Some(result.user_message());
            update_profile_bundle(app, &plugin.package_name, false)?;
            audit(
                app,
                "REPAIR_PLUGIN",
                Some(&plugin.plugin_id),
                Some(&plugin.package_name),
                Some(&plugin.version),
                "DISABLED",
                "受控插件依赖恢复失败，已安全停用；Runtime 将继续启动。",
            );
            continue;
        }
        update_profile_bundle(app, &plugin.package_name, true)?;
        plugin.issue = None;
        audit(
            app,
            "REPAIR_PLUGIN",
            Some(&plugin.plugin_id),
            Some(&plugin.package_name),
            Some(&plugin.version),
            "SUCCESS",
            "已恢复插件依赖并重新验证 DSH Profile。",
        );
    }
    write_runtime_state(app, state)?;
    verify_profile_manifest_consistency(app)
}

fn verify_dsh_integrity(app: &AppHandle) -> Result<(), String> {
    let toolchain = require_runtime_tools(app)?;
    let root = managed_root(app)?;
    let environment = dsh_environment(app, &toolchain)?;
    let observed = observed_package_integrity(
        &toolchain.node,
        &toolchain.pnpm_cli,
        &format!("{DSH_PACKAGE}@{DSH_VERSION}"),
        &environment,
        &root,
    )?;
    if observed != DSH_INTEGRITY {
        return Err("DSH 完整性与 HarnessHub 内置证据不一致，准备已停止。".to_string());
    }
    Ok(())
}

fn verify_npm_integrity(app: &AppHandle, request: &PluginOperationRequest) -> Result<(), String> {
    let toolchain = require_runtime_tools(app)?;
    let package_spec = format!("{}@{}", request.package_name, request.version);
    let root = managed_root(app)?;
    fs::create_dir_all(&root).map_err(|_| "无法创建 Runtime 工作目录。".to_string())?;
    let result = run_fixed_command(
        &toolchain.node,
        &[
            toolchain.pnpm_cli.to_string_lossy().into_owned(),
            "view".to_string(),
            package_spec,
            "dist.integrity".to_string(),
            "--json".to_string(),
            format!("--registry={OFFICIAL_NPM_REGISTRY}"),
        ],
        &dsh_environment(app, &toolchain)?,
        Some(&root),
        Duration::from_secs(60),
    )?;
    if !result.success() {
        return Err("无法从 npm 核验插件完整性证据。安装没有开始。".to_string());
    }
    let observed = serde_json::from_str::<String>(&result.stdout)
        .unwrap_or_else(|_| result.stdout.trim().trim_matches('"').to_string());
    if observed != request.integrity {
        return Err(
            "npm 当前完整性与 Registry 快照不一致。请先同步来源证据，安装没有开始。".to_string(),
        );
    }
    Ok(())
}

fn backup_profile_files(app: &AppHandle) -> Result<BTreeMap<PathBuf, Option<Vec<u8>>>, String> {
    let profile = dsh_home(app)?.join("profiles").join(MANAGED_PROFILE);
    let mut backups = BTreeMap::new();
    for name in [
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "cordis.patch.yml",
    ] {
        let path = profile.join(name);
        let content = if path.exists() {
            Some(fs::read(&path).map_err(|_| "无法创建安装恢复点。".to_string())?)
        } else {
            None
        };
        backups.insert(path, content);
    }
    Ok(backups)
}

fn restore_profile_files(backups: &BTreeMap<PathBuf, Option<Vec<u8>>>) -> Result<(), String> {
    for (path, content) in backups {
        match content {
            Some(bytes) => {
                if let Some(parent) = path.parent() {
                    fs::create_dir_all(parent).map_err(|_| "无法恢复插件配置。".to_string())?;
                }
                fs::write(path, bytes).map_err(|_| "无法恢复插件配置。".to_string())?;
            }
            None if path.exists() => {
                fs::remove_file(path).map_err(|_| "无法清理失败的插件配置。".to_string())?
            }
            None => {}
        }
    }
    Ok(())
}

fn runtime_status(app: &AppHandle, native: &NativeState) -> ManagedRuntimeStatus {
    let mut state = read_runtime_state(app);
    let mut runtime = native
        .runtime
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut running = false;
    let mut port = None;
    let mut pid = None;
    if runtime.is_none() {
        let lease = state
            .runtime_process
            .clone()
            .filter(|lease| valid_runtime_lease(app, lease))
            .or_else(|| discover_legacy_runtime(app));
        if let Some(lease) = lease {
            if state.runtime_process.as_ref().map_or(true, |current| {
                current.pid != lease.pid || current.port != lease.port
            }) {
                state.runtime_process = Some(lease.clone());
                let _ = write_runtime_state(app, &state);
                audit(
                    app,
                    "ADOPT_RUNTIME",
                    None,
                    Some(DSH_PACKAGE),
                    Some(DSH_VERSION),
                    "SUCCESS",
                    "已接管应用重启前仍在运行的本地 DSH Runtime。",
                );
            }
            *runtime = Some(ManagedRuntimeProcess {
                child: None,
                pid: lease.pid,
                port: lease.port,
            });
        } else if state.runtime_process.take().is_some() {
            let _ = write_runtime_state(app, &state);
        }
    }
    if let Some(process) = runtime.as_mut() {
        let alive = match process.child.as_mut() {
            Some(child) => child.try_wait().is_ok_and(|status| status.is_none()),
            None => valid_runtime_lease(
                app,
                &ManagedRuntimeLease {
                    pid: process.pid,
                    port: process.port,
                    started_at_unix_ms: 0,
                },
            ),
        };
        if alive {
            running = true;
            port = Some(process.port);
            pid = Some(process.pid);
        } else {
            *runtime = None;
            if state.runtime_process.take().is_some() {
                let _ = write_runtime_state(app, &state);
            }
        }
    }
    ManagedRuntimeStatus {
        prepared: state.prepared,
        dsh_version: state.dsh_version.unwrap_or_else(|| DSH_VERSION.to_string()),
        profile: MANAGED_PROFILE,
        running,
        port,
        url: port.map(|value| format!("http://127.0.0.1:{value}")),
        pid,
        plugins: state.plugins,
    }
}

#[tauri::command]
fn detect_runtime_environment(app: AppHandle) -> RuntimeEnvironmentSnapshot {
    build_runtime_environment_snapshot(&app)
}

#[tauri::command]
fn get_managed_runtime_status(
    app: AppHandle,
    native: State<'_, NativeState>,
) -> ManagedRuntimeStatus {
    runtime_status(&app, &native)
}

#[tauri::command]
fn list_installation_audit(app: AppHandle) -> Vec<InstallationAuditRecord> {
    let Ok(path) = audit_path(&app) else {
        return Vec::new();
    };
    let Ok(content) = fs::read_to_string(path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .take(100)
        .collect()
}

fn session_keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SESSION_KEYRING_SERVICE, SESSION_KEYRING_ACCOUNT)
        .map_err(|_| "无法访问系统安全凭据存储。".to_string())
}

#[tauri::command]
fn save_session_token(token: String) -> Result<(), String> {
    if token.len() < 32 || token.len() > 512 || token.chars().any(char::is_whitespace) {
        return Err("登录会话格式无效。".to_string());
    }
    session_keyring_entry()?
        .set_password(&token)
        .map_err(|_| "无法安全保存登录会话。".to_string())
}

#[tauri::command]
fn load_session_token() -> Result<Option<String>, String> {
    match session_keyring_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取已保存的登录会话。".to_string()),
    }
}

#[tauri::command]
fn delete_session_token() -> Result<(), String> {
    match session_keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("无法删除已保存的登录会话。".to_string()),
    }
}

async fn background_operation<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| "后台 Runtime 操作意外结束。".to_string())?
}

#[tauri::command]
async fn prepare_managed_runtime(
    app: AppHandle,
    confirmed: bool,
) -> Result<ManagedOperationResult, String> {
    background_operation(move || prepare_managed_runtime_blocking(app, confirmed)).await
}

fn prepare_managed_runtime_blocking(
    app: AppHandle,
    confirmed: bool,
) -> Result<ManagedOperationResult, String> {
    let native = app.state::<NativeState>();
    if !confirmed {
        return Err("需要明确确认后才能准备 DSH Runtime。".to_string());
    }
    let _operation = native
        .operation_lock
        .lock()
        .map_err(|_| "另一个本地操作尚未结束。".to_string())?;
    audit(
        &app,
        "PREPARE_RUNTIME",
        None,
        Some(DSH_PACKAGE),
        Some(DSH_VERSION),
        "RUNNING",
        "开始准备 HarnessHub 受控工具链与隔离的 DSH Runtime。",
    );
    audit(
        &app,
        "PREPARE_TOOLCHAIN",
        None,
        Some("node+pnpm"),
        Some(NODE_VERSION),
        "RUNNING",
        "正在准备固定版本、哈希校验的隔离 Runtime 工具链。",
    );
    if let Err(message) = ensure_managed_toolchain(&app) {
        audit(
            &app,
            "PREPARE_TOOLCHAIN",
            None,
            Some("node+pnpm"),
            Some(NODE_VERSION),
            "FAILED",
            &message,
        );
        return Err(message);
    }
    audit(
        &app,
        "PREPARE_TOOLCHAIN",
        None,
        Some("node+pnpm"),
        Some(NODE_VERSION),
        "SUCCESS",
        "受控 Node.js 22.19.0 与 pnpm 11.19.0 已准备并验证。",
    );
    verify_dsh_integrity(&app)?;
    let result = run_dsh(
        &app,
        &["web".to_string(), "--dump-config".to_string()],
        OPERATION_TIMEOUT,
    )?;
    if !result.success() {
        let message = result.user_message();
        audit(
            &app,
            "PREPARE_RUNTIME",
            None,
            Some(DSH_PACKAGE),
            Some(DSH_VERSION),
            "FAILED",
            &message,
        );
        return Err(message);
    }
    let mut state = read_runtime_state(&app);
    state.prepared = true;
    state.dsh_version = Some(DSH_VERSION.to_string());
    state.prepared_at_unix_ms = Some(unix_ms());
    write_runtime_state(&app, &state)?;
    audit(
        &app,
        "PREPARE_RUNTIME",
        None,
        Some(DSH_PACKAGE),
        Some(DSH_VERSION),
        "SUCCESS",
        "DSH Runtime 已在 HarnessHub 隔离目录中准备完成。",
    );
    Ok(ManagedOperationResult {
        success: true,
        action: "PREPARE_RUNTIME".to_string(),
        message: "DSH Runtime 已准备完成。".to_string(),
        runtime: runtime_status(&app, &native),
    })
}

#[tauri::command]
async fn install_managed_plugin(
    app: AppHandle,
    request: PluginOperationRequest,
) -> Result<ManagedOperationResult, String> {
    background_operation(move || install_managed_plugin_blocking(app, request)).await
}

fn install_managed_plugin_blocking(
    app: AppHandle,
    request: PluginOperationRequest,
) -> Result<ManagedOperationResult, String> {
    let native = app.state::<NativeState>();
    validate_plugin_request(&request)?;
    if runtime_status(&app, &native).running {
        stop_managed_runtime_blocking(app.clone())?;
    }
    let _operation = native
        .operation_lock
        .lock()
        .map_err(|_| "另一个本地操作尚未结束。".to_string())?;
    cleanup_orphaned_mutations(&app);
    let state = read_runtime_state(&app);
    if !state.prepared {
        return Err("请先完成 DSH Runtime 准备。".to_string());
    }
    let action = if state.plugins.iter().any(|plugin| {
        plugin.plugin_id == request.plugin_id || plugin.package_name == request.package_name
    }) {
        "UPDATE_PLUGIN"
    } else {
        "INSTALL_PLUGIN"
    };
    if request.source_kind.as_deref() != Some("GITHUB") {
        verify_npm_integrity(&app, &request)?;
    }
    audit(
        &app,
        action,
        Some(&request.plugin_id),
        Some(&request.package_name),
        Some(&request.version),
        "RUNNING",
        "已创建恢复点并开始固定版本安装。",
    );
    let backups = backup_profile_files(&app)?;
    let package_spec = plugin_package_spec(&request)?;
    let result = run_profile_pnpm(
        &app,
        &[
            "add".to_string(),
            "--save-exact".to_string(),
            "--ignore-scripts".to_string(),
            package_spec,
        ],
        PROFILE_MUTATION_TIMEOUT,
    )?;
    if !result.success()
        || !profile_package_is_bundle(&app, &request.package_name, &request.version)?
    {
        let restored = restore_profile_and_dependencies(&app, &backups).is_ok();
        let message = if restored {
            format!("安装未完成，已恢复原配置。{}", result.user_message())
        } else {
            "安装未完成，自动恢复失败。请在任务页面查看恢复说明。".to_string()
        };
        audit(
            &app,
            action,
            Some(&request.plugin_id),
            Some(&request.package_name),
            Some(&request.version),
            if restored {
                "ROLLED_BACK"
            } else {
                "RECOVERY_REQUIRED"
            },
            &message,
        );
        return Err(message);
    }
    update_profile_bundle(&app, &request.package_name, true)?;
    if let Err(reason) = verify_profile_manifest_consistency(&app) {
        let restored = restore_profile_and_dependencies(&app, &backups).is_ok();
        let message = if restored {
            format!("插件配置验证失败，已恢复原配置。{reason}")
        } else {
            "插件验证失败且自动恢复未完成。".to_string()
        };
        audit(
            &app,
            action,
            Some(&request.plugin_id),
            Some(&request.package_name),
            Some(&request.version),
            if restored {
                "ROLLED_BACK"
            } else {
                "RECOVERY_REQUIRED"
            },
            &message,
        );
        return Err(message);
    }
    let mut next = read_runtime_state(&app);
    next.plugins.retain(|plugin| {
        plugin.plugin_id != request.plugin_id && plugin.package_name != request.package_name
    });
    next.plugins.push(ManagedPluginRecord {
        plugin_id: request.plugin_id.clone(),
        package_name: request.package_name.clone(),
        version: request.version.clone(),
        integrity: request.integrity.clone(),
        source_kind: request.source_kind.clone(),
        registry_status: request.registry_status.clone(),
        risk_level: request.risk_level.clone(),
        source_url: request.source_url.clone(),
        source_commit: request.source_commit.clone(),
        snapshot_sha256: request.snapshot_sha256.clone(),
        enabled: true,
        issue: None,
        installed_at_unix_ms: unix_ms(),
    });
    next.plugins
        .sort_by(|left, right| left.plugin_id.cmp(&right.plugin_id));
    write_runtime_state(&app, &next)?;
    audit(
        &app,
        action,
        Some(&request.plugin_id),
        Some(&request.package_name),
        Some(&request.version),
        "SUCCESS",
        "固定版本安装完成，配置验证通过。",
    );
    Ok(ManagedOperationResult {
        success: true,
        action: action.to_string(),
        message: "插件已安装并通过 DSH 配置验证。请重启 Runtime 以加载变更。".to_string(),
        runtime: runtime_status(&app, &native),
    })
}

#[tauri::command]
async fn remove_managed_plugin(
    app: AppHandle,
    request: PluginRemoveRequest,
) -> Result<ManagedOperationResult, String> {
    background_operation(move || remove_managed_plugin_blocking(app, request)).await
}

fn remove_managed_plugin_blocking(
    app: AppHandle,
    request: PluginRemoveRequest,
) -> Result<ManagedOperationResult, String> {
    let native = app.state::<NativeState>();
    let initial_state = read_runtime_state(&app);
    validate_remove_request(&request, &initial_state)?;
    if runtime_status(&app, &native).running {
        stop_managed_runtime_blocking(app.clone())?;
    }
    let _operation = native
        .operation_lock
        .lock()
        .map_err(|_| "另一个本地操作尚未结束。".to_string())?;
    cleanup_orphaned_mutations(&app);
    let state = read_runtime_state(&app);
    let installed = validate_remove_request(&request, &state)?;
    audit(
        &app,
        "REMOVE_PLUGIN",
        Some(&installed.plugin_id),
        Some(&installed.package_name),
        Some(&installed.version),
        "RUNNING",
        "已停止 Runtime、创建恢复点并开始卸载。",
    );
    let backups = backup_profile_files(&app)?;
    // The functional uninstall is a local, atomic manifest operation. It does
    // not depend on a package-manager subprocess or network availability.
    remove_profile_package_entry(&app, &installed.package_name)?;
    if let Err(reason) = verify_profile_manifest_consistency(&app) {
        let restored = restore_profile_files(&backups).is_ok();
        let message = if restored {
            format!("卸载配置验证失败，已恢复原配置。{reason}")
        } else {
            "卸载验证失败且自动恢复未完成。".to_string()
        };
        audit(
            &app,
            "REMOVE_PLUGIN",
            Some(&installed.plugin_id),
            Some(&installed.package_name),
            Some(&installed.version),
            if restored {
                "ROLLED_BACK"
            } else {
                "RECOVERY_REQUIRED"
            },
            &message,
        );
        return Err(message);
    }
    let mut next = read_runtime_state(&app);
    next.plugins
        .retain(|plugin| plugin.package_name != installed.package_name);
    write_runtime_state(&app, &next)?;

    let files_cleaned = remove_profile_package_link(&app, &installed.package_name).is_ok();
    let metadata_cleaned = run_profile_pnpm(
        &app,
        &[
            "install".to_string(),
            "--offline".to_string(),
            "--ignore-scripts".to_string(),
            "--no-frozen-lockfile".to_string(),
        ],
        Duration::from_secs(30),
    )
    .is_ok_and(|result| result.success());
    if !files_cleaned || !metadata_cleaned {
        audit(
            &app,
            "CLEANUP_PLUGIN_FILES",
            Some(&installed.plugin_id),
            Some(&installed.package_name),
            Some(&installed.version),
            "DEFERRED",
            "插件已从 Runtime 安全卸载；未使用的缓存将在后续维护中清理。",
        );
    }
    audit(
        &app,
        "REMOVE_PLUGIN",
        Some(&installed.plugin_id),
        Some(&installed.package_name),
        Some(&installed.version),
        "SUCCESS",
        "插件已卸载并通过 DSH Profile 验证。",
    );
    Ok(ManagedOperationResult {
        success: true,
        action: "REMOVE_PLUGIN".to_string(),
        message: "插件已卸载；Runtime 已安全停止，可重新启动。".to_string(),
        runtime: runtime_status(&app, &native),
    })
}

fn reserve_loopback_port() -> Result<u16, String> {
    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|_| "无法为本地 Runtime 分配端口。".to_string())
}

#[tauri::command]
async fn start_managed_runtime(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    background_operation(move || start_managed_runtime_blocking(app)).await
}

#[tauri::command]
async fn reconnect_managed_runtime(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    background_operation(move || reconnect_managed_runtime_blocking(app)).await
}

/// Reconnect means recover the managed local Runtime, rather than merely
/// re-reading a stale UI snapshot. If a process survived the Desktop restart we
/// adopt it; otherwise we perform the same guarded start path as the Start
/// button, including Profile reconciliation and audit logging.
fn reconnect_managed_runtime_blocking(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    let native = app.state::<NativeState>();
    let current = runtime_status(&app, &native);
    if current.running {
        audit(
            &app,
            "RECONNECT_RUNTIME",
            None,
            Some(DSH_PACKAGE),
            Some(DSH_VERSION),
            "SUCCESS",
            "已恢复与现有本地 DSH Runtime 的连接。",
        );
        return Ok(current);
    }
    audit(
        &app,
        "RECONNECT_RUNTIME",
        None,
        Some(DSH_PACKAGE),
        Some(DSH_VERSION),
        "RUNNING",
        "本地 DSH Runtime 未运行，正在执行受控恢复。",
    );
    start_managed_runtime_blocking(app)
}

fn start_managed_runtime_blocking(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    let native = app.state::<NativeState>();
    let current = runtime_status(&app, &native);
    if current.running {
        return Ok(current);
    }
    let mut state = read_runtime_state(&app);
    if !state.prepared {
        return Err("请先完成 DSH Runtime 准备。".to_string());
    }
    let _operation = native
        .operation_lock
        .lock()
        .map_err(|_| "另一个本地操作尚未结束。".to_string())?;
    reconcile_managed_profile(&app, &mut state)?;
    let toolchain = require_runtime_tools(&app)?;
    let port = reserve_loopback_port()?;
    let root = managed_root(&app)?;
    fs::create_dir_all(&root).map_err(|_| "无法创建 Runtime 工作目录。".to_string())?;
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("runtime.log"))
        .map_err(|_| "无法创建 Runtime 日志。".to_string())?;
    let error_log = log
        .try_clone()
        .map_err(|_| "无法创建 Runtime 日志。".to_string())?;
    let mut args = vec![toolchain.pnpm_cli.to_string_lossy().into_owned()];
    args.extend(pnpm_dsh_args());
    args.extend([
        "web".to_string(),
        "--no-open".to_string(),
        "--port".to_string(),
        port.to_string(),
    ]);
    let mut command = Command::new(&toolchain.node);
    command
        .args(args)
        .envs(dsh_environment(&app, &toolchain)?.into_iter())
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(error_log));
    isolate_process_tree(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "无法启动 DSH Runtime。".to_string())?;
    let pid = child.id();
    let lease = ManagedRuntimeLease {
        pid,
        port,
        started_at_unix_ms: unix_ms(),
    };
    state.runtime_process = Some(lease);
    if let Err(reason) = write_runtime_state(&app, &state) {
        terminate_process_tree(pid, Duration::from_secs(2));
        let _ = child.wait();
        return Err(reason);
    }
    *native
        .runtime
        .lock()
        .map_err(|_| "Runtime 状态不可用。".to_string())? = Some(ManagedRuntimeProcess {
        child: Some(child),
        pid,
        port,
    });
    audit(
        &app,
        "START_RUNTIME",
        None,
        Some(DSH_PACKAGE),
        Some(DSH_VERSION),
        "RUNNING",
        "DSH Runtime 正在本地随机端口启动。",
    );
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            audit(
                &app,
                "START_RUNTIME",
                None,
                Some(DSH_PACKAGE),
                Some(DSH_VERSION),
                "SUCCESS",
                "DSH Runtime 已就绪。",
            );
            return Ok(runtime_status(&app, &native));
        }
        {
            let mut guard = native
                .runtime
                .lock()
                .map_err(|_| "Runtime 状态不可用。".to_string())?;
            if let Some(process) = guard.as_mut() {
                if process
                    .child
                    .as_mut()
                    .is_some_and(|child| child.try_wait().is_ok_and(|status| status.is_some()))
                {
                    *guard = None;
                    let mut failed_state = read_runtime_state(&app);
                    failed_state.runtime_process = None;
                    let _ = write_runtime_state(&app, &failed_state);
                    audit(
                        &app,
                        "START_RUNTIME",
                        None,
                        Some(DSH_PACKAGE),
                        Some(DSH_VERSION),
                        "FAILED",
                        "DSH Runtime 启动后提前退出。",
                    );
                    return Err("DSH Runtime 启动失败。请查看任务记录与 Runtime 日志。".to_string());
                }
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
    if let Ok(mut guard) = native.runtime.lock() {
        if let Some(mut process) = guard.take() {
            terminate_process_tree(process.pid, Duration::from_secs(2));
            if let Some(child) = process.child.as_mut() {
                let _ = child.wait();
            }
        }
    }
    let mut failed_state = read_runtime_state(&app);
    failed_state.runtime_process = None;
    let _ = write_runtime_state(&app, &failed_state);
    audit(
        &app,
        "START_RUNTIME",
        None,
        Some(DSH_PACKAGE),
        Some(DSH_VERSION),
        "FAILED",
        "DSH Runtime 就绪检查超时，进程已停止。",
    );
    Err(format!(
        "DSH Runtime 未能在 20 秒内就绪（进程 {pid} 已停止）。"
    ))
}

#[tauri::command]
async fn stop_managed_runtime(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    background_operation(move || stop_managed_runtime_blocking(app)).await
}

fn stop_managed_runtime_blocking(app: AppHandle) -> Result<ManagedRuntimeStatus, String> {
    let native = app.state::<NativeState>();
    // Re-adopt a Runtime left alive by an application restart before stopping.
    let _ = runtime_status(&app, &native);
    if let Some(workspace) = app.get_webview_window("dsh-workspace") {
        let _ = workspace.close();
    }
    let mut runtime = native
        .runtime
        .lock()
        .map_err(|_| "Runtime 状态不可用。".to_string())?;
    if let Some(mut process) = runtime.take() {
        terminate_process_tree(process.pid, Duration::from_secs(6));
        if let Some(child) = process.child.as_mut() {
            let _ = child.wait();
        }
        audit(
            &app,
            "STOP_RUNTIME",
            None,
            Some(DSH_PACKAGE),
            Some(DSH_VERSION),
            "SUCCESS",
            "DSH Runtime 已停止。",
        );
    }
    drop(runtime);
    let mut state = read_runtime_state(&app);
    if state.runtime_process.take().is_some() {
        write_runtime_state(&app, &state)?;
    }
    Ok(runtime_status(&app, &native))
}

#[tauri::command]
fn open_managed_runtime_workspace(app: AppHandle) -> Result<(), String> {
    let native = app.state::<NativeState>();
    let status = runtime_status(&app, &native);
    let url = status
        .url
        .ok_or_else(|| "请先启动本地 DSH Runtime。".to_string())?;
    let parsed = Url::parse(&url).map_err(|_| "本地 Runtime 地址无效。".to_string())?;
    if parsed.scheme() != "http" || parsed.host_str() != Some("127.0.0.1") {
        return Err("仅允许在 HarnessHub 中打开本地 DSH Runtime。".to_string());
    }
    if let Some(window) = app.get_webview_window("dsh-workspace") {
        window
            .show()
            .map_err(|_| "无法显示 DSH 工作区。".to_string())?;
        window
            .set_focus()
            .map_err(|_| "无法聚焦 DSH 工作区。".to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "dsh-workspace", WebviewUrl::External(parsed))
        .title("HarnessHub · DSH Workspace")
        .inner_size(1320.0, 880.0)
        .min_inner_size(900.0, 620.0)
        .build()
        .map_err(|_| "无法打开 DSH 工作区。".to_string())?;
    audit(
        &app,
        "OPEN_RUNTIME_WORKSPACE",
        None,
        Some(DSH_PACKAGE),
        Some(DSH_VERSION),
        "SUCCESS",
        "已在 HarnessHub 受控窗口中打开本地 DSH 工作区。",
    );
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(NativeState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            detect_runtime_environment,
            get_managed_runtime_status,
            list_installation_audit,
            prepare_managed_runtime,
            install_managed_plugin,
            remove_managed_plugin,
            start_managed_runtime,
            reconnect_managed_runtime,
            stop_managed_runtime,
            open_managed_runtime_workspace,
            save_session_token,
            load_session_token,
            delete_session_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HarnessHub Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn installed_record() -> ManagedPluginRecord {
        ManagedPluginRecord {
            plugin_id: "old-registry-id".to_string(),
            package_name: "@example/dsh-plugin".to_string(),
            version: "1.0.0".to_string(),
            integrity: "sha512-proof".to_string(),
            source_kind: Some("NPM".to_string()),
            registry_status: Some("PUBLISHED".to_string()),
            risk_level: Some("LOW".to_string()),
            source_url: None,
            source_commit: None,
            snapshot_sha256: None,
            enabled: true,
            issue: None,
            installed_at_unix_ms: 1,
        }
    }

    #[test]
    fn missing_program_is_reported_without_mutation() {
        let result = fixed_version_probe("Missing", "harnesshub-runtime-probe-missing");
        assert_eq!(result.status, "MISSING");
        assert!(result.read_only);
        assert!(result.version_output.is_none());
    }

    #[test]
    fn registry_allowlist_is_valid_and_not_mock_data() {
        let sources = allowlisted_sources().expect("embedded registry allowlist");
        assert!(sources.len() >= 20);
        assert!(sources
            .iter()
            .all(|source| !source.id.is_empty() && !source.npm.package_name.is_empty()));
    }

    #[test]
    fn install_request_allows_fixed_sources_but_rejects_missing_confirmation() {
        let request = PluginOperationRequest {
            plugin_id: "dsh-workbench".to_string(),
            package_name: "unexpected-package".to_string(),
            version: "1.0.0".to_string(),
            integrity: "sha512-test".to_string(),
            source_kind: Some("NPM".to_string()),
            registry_status: Some("PUBLISHED".to_string()),
            risk_level: Some("LOW".to_string()),
            confirmation_count: 1,
            source_url: None,
            source_commit: None,
            snapshot_sha256: None,
            confirmed: true,
        };
        assert!(validate_plugin_request(&request).is_ok());
        let unconfirmed = PluginOperationRequest {
            plugin_id: "dsh-workbench".to_string(),
            package_name: "dsh-workbench".to_string(),
            version: "0.8.0".to_string(),
            integrity: "sha512-test".to_string(),
            source_kind: Some("NPM".to_string()),
            registry_status: Some("PUBLISHED".to_string()),
            risk_level: Some("LOW".to_string()),
            confirmation_count: 1,
            source_url: None,
            source_commit: None,
            snapshot_sha256: None,
            confirmed: false,
        };
        assert!(validate_plugin_request(&unconfirmed).is_err());
    }

    #[test]
    fn every_unverified_candidate_requires_two_confirmations_including_critical() {
        let candidate = |risk: &str, confirmations: u8| PluginOperationRequest {
            plugin_id: "candidate-example-dsh-plugin".to_string(),
            package_name: "@example/dsh-plugin".to_string(),
            version: "1.0.0".to_string(),
            integrity: "sha512-test".to_string(),
            source_kind: Some("NPM".to_string()),
            registry_status: Some("COLLECTED_UNVERIFIED".to_string()),
            risk_level: Some(risk.to_string()),
            confirmation_count: confirmations,
            source_url: Some("https://github.com/example/dsh-plugin".to_string()),
            source_commit: Some("a".repeat(40)),
            snapshot_sha256: Some("b".repeat(64)),
            confirmed: true,
        };
        assert!(validate_plugin_request(&candidate("LOW", 1)).is_err());
        assert!(validate_plugin_request(&candidate("LOW", 2)).is_ok());
        assert!(validate_plugin_request(&candidate("MEDIUM", 1)).is_err());
        assert!(validate_plugin_request(&candidate("MEDIUM", 2)).is_ok());
        assert!(validate_plugin_request(&candidate("HIGH", 1)).is_err());
        assert!(validate_plugin_request(&candidate("HIGH", 2)).is_ok());
        assert!(validate_plugin_request(&candidate("CRITICAL", 2)).is_ok());
    }

    #[test]
    fn github_candidates_are_pinned_to_the_confirmed_commit() {
        let commit = "c".repeat(40);
        let request = PluginOperationRequest {
            plugin_id: "candidate-example-dsh-plugin".to_string(),
            package_name: "@example/dsh-plugin".to_string(),
            version: "1.0.0".to_string(),
            integrity: format!("git-commit:{commit}"),
            source_kind: Some("GITHUB".to_string()),
            registry_status: Some("COLLECTED_UNVERIFIED".to_string()),
            risk_level: Some("CRITICAL".to_string()),
            confirmation_count: 2,
            source_url: Some("https://github.com/example/dsh-plugin".to_string()),
            source_commit: Some(commit.clone()),
            snapshot_sha256: None,
            confirmed: true,
        };
        assert!(validate_plugin_request(&request).is_ok());
        assert_eq!(
            plugin_package_spec(&request).expect("github spec"),
            format!("git+https://github.com/example/dsh-plugin.git#{commit}")
        );
    }

    #[test]
    fn managed_node_artifact_is_pinned_for_the_current_platform() {
        let artifact = node_artifact().expect("supported test platform");
        assert!(artifact.file_name.starts_with("node-v22.19.0-"));
        assert_eq!(artifact.sha256.len(), 64);
        assert!(artifact
            .sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn archive_paths_cannot_escape_the_managed_staging_directory() {
        assert_eq!(
            safe_archive_relative(Path::new("node-v22/bin/node")),
            Some(PathBuf::from("bin/node"))
        );
        assert!(safe_archive_relative(Path::new("node-v22/../../escape")).is_none());
        assert!(safe_archive_relative(Path::new("/node-v22/bin/node")).is_none());
    }

    #[test]
    fn removal_uses_stable_package_identity_after_registry_id_changes() {
        let state = RuntimeStateFile {
            plugins: vec![installed_record()],
            ..RuntimeStateFile::default()
        };
        let request = PluginRemoveRequest {
            package_name: "@example/dsh-plugin".to_string(),
            confirmed: true,
        };
        assert_eq!(
            validate_remove_request(&request, &state)
                .expect("installed package")
                .plugin_id,
            "old-registry-id"
        );
    }

    #[test]
    fn profile_uninstall_removes_bundle_and_dependency_atomically() {
        let mut manifest = serde_json::json!({
            "dsh": { "profile": { "bundles": [
                "@deepseek-ai/dsh-base",
                "@example/dsh-plugin"
            ] } },
            "dependencies": { "@example/dsh-plugin": "1.0.0" }
        });
        update_profile_manifest_value(&mut manifest, "@example/dsh-plugin", false, true)
            .expect("valid profile manifest");
        assert_eq!(
            manifest.pointer("/dsh/profile/bundles").unwrap(),
            &serde_json::json!(["@deepseek-ai/dsh-base"])
        );
        assert!(manifest
            .pointer("/dependencies/@example~1dsh-plugin")
            .is_none());
    }

    #[test]
    fn legacy_runtime_command_port_is_recovered() {
        assert_eq!(
            parse_runtime_port(
                "node pnpm dlx @deepseek-ai/dsh@0.1.0-rc.8 web --no-open --port 58832"
            ),
            Some(58832)
        );
    }

    #[test]
    fn older_plugin_records_default_to_enabled() {
        let value = serde_json::json!({
            "pluginId": "old",
            "packageName": "@example/dsh-plugin",
            "version": "1.0.0",
            "integrity": "sha512-proof",
            "installedAtUnixMs": 1
        });
        let record: ManagedPluginRecord = serde_json::from_value(value).expect("legacy record");
        assert!(record.enabled);
        assert!(record.issue.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn command_timeout_terminates_the_spawned_process_tree() {
        let marker = env::temp_dir().join(unique_id("harnesshub-child-pid"));
        let result = run_fixed_command(
            Path::new("/bin/sh"),
            &[
                "-c".to_string(),
                "sleep 30 & echo $! > \"$1\"; wait".to_string(),
                "harnesshub-test".to_string(),
                marker.to_string_lossy().into_owned(),
            ],
            &[],
            None,
            Duration::from_millis(150),
        )
        .expect("bounded command");
        assert!(result.timed_out);
        let child_pid = fs::read_to_string(&marker)
            .expect("child pid marker")
            .trim()
            .parse::<u32>()
            .expect("child pid");
        let _ = fs::remove_file(marker);
        let deadline = Instant::now() + Duration::from_secs(2);
        while process_exists(child_pid) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(25));
        }
        assert!(!process_exists(child_pid));
    }
}
