<?php
declare(strict_types=1);

session_set_cookie_params(['lifetime' => 86400 * 30, 'samesite' => 'Lax', 'secure' => true]);
session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (empty($_SESSION['user_email']) || $_SESSION['user_email'] !== ALLOWED_EMAIL) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Reports live in public/reports/ — inside the web root but protected by .htaccess
define('REPORTS_DIR', realpath(__DIR__ . '/reports'));
define('SETTINGS_FILE', __DIR__ . '/settings.json');
define('BLACKLIST_FILE', __DIR__ . '/blacklist.json');

// ── Route dispatch ─────────────────────────────────────────────────────────
$uri  = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';
// Normalise to relative: strip any leading path prefix up to and including /api/
$path = ltrim(preg_replace('#^.*/api/#', 'api/', $path), '/');
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET' && $path === 'api/reports') {
    handle_list();
} elseif ($method === 'GET' && preg_match('#^api/report/(\d{4}-\d{2}-\d{2})$#', $path, $m)) {
    handle_report($m[1]);
} elseif ($method === 'POST' && $path === 'api/feedback') {
    handle_feedback();
} elseif ($method === 'DELETE' && preg_match('#^api/report/(\d{4}-\d{2}-\d{2})$#', $path, $m)) {
    handle_delete($m[1]);
} elseif ($method === 'POST' && $path === 'api/delete-all') {
    handle_delete_all();
} elseif ($method === 'GET' && $path === 'api/settings') {
    handle_get_settings();
} elseif ($method === 'POST' && $path === 'api/settings') {
    handle_save_settings();
} elseif ($method === 'GET' && $path === 'api/blacklist') {
    handle_get_blacklist();
} elseif ($method === 'POST' && $path === 'api/blacklist') {
    handle_add_blacklist();
} elseif ($method === 'DELETE' && $path === 'api/blacklist') {
    handle_remove_blacklist();
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
}

// ── Handlers ───────────────────────────────────────────────────────────────

function handle_list(): void {
    if (!REPORTS_DIR || !is_dir(REPORTS_DIR)) {
        echo json_encode([]);
        return;
    }
    $dates = [];
    foreach (glob(REPORTS_DIR . '/*.md') as $f) {
        $base = basename($f, '.md');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $base)) {
            $dates[] = $base;
        }
    }
    rsort($dates);

    // Prune reports older than maxDays if set
    $settings = read_settings();
    $maxDays = $settings['maxDays'] ?? 0;
    if ($maxDays > 0) {
        $cutoff = date('Y-m-d', strtotime("-{$maxDays} days"));
        $keep = [];
        foreach ($dates as $d) {
            if ($d < $cutoff) {
                $path = REPORTS_DIR . DIRECTORY_SEPARATOR . $d . '.md';
                if (file_exists($path)) unlink($path);
            } else {
                $keep[] = $d;
            }
        }
        $dates = $keep;
    }

    echo json_encode($dates);
}

function handle_get_settings(): void {
    echo json_encode(read_settings());
}

function handle_save_settings(): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400); echo json_encode(['error' => 'Invalid JSON']); return;
    }
    $maxDays = isset($body['maxDays']) ? (int)$body['maxDays'] : 0;
    if ($maxDays < 0) $maxDays = 0;
    $settings = ['maxDays' => $maxDays];
    file_put_contents(SETTINGS_FILE, json_encode($settings, JSON_PRETTY_PRINT));
    echo json_encode(['ok' => true]);
}

function read_settings(): array {
    if (!file_exists(SETTINGS_FILE)) return ['maxDays' => 0];
    $data = json_decode(file_get_contents(SETTINGS_FILE), true);
    return is_array($data) ? $data : ['maxDays' => 0];
}

function handle_get_blacklist(): void {
    if (!file_exists(BLACKLIST_FILE)) { echo json_encode([]); return; }
    $data = json_decode(file_get_contents(BLACKLIST_FILE), true);
    echo json_encode(is_array($data) ? $data : []);
}

function handle_add_blacklist(): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!isset($body['domain']) || !is_string($body['domain'])) {
        http_response_code(400); echo json_encode(['error' => 'Missing domain']); return;
    }
    $domain = $body['domain'];
    $blacklist = [];
    if (file_exists(BLACKLIST_FILE)) {
        $data = json_decode(file_get_contents(BLACKLIST_FILE), true);
        if (is_array($data)) $blacklist = $data;
    }
    if (!in_array($domain, $blacklist, true)) {
        $blacklist[] = $domain;
        file_put_contents(BLACKLIST_FILE, json_encode($blacklist, JSON_PRETTY_PRINT));
    }
    echo json_encode(['ok' => true]);
}

function handle_remove_blacklist(): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!isset($body['domain']) || !is_string($body['domain'])) {
        http_response_code(400); echo json_encode(['error' => 'Missing domain']); return;
    }
    $domain = $body['domain'];
    $blacklist = [];
    if (file_exists(BLACKLIST_FILE)) {
        $data = json_decode(file_get_contents(BLACKLIST_FILE), true);
        if (is_array($data)) $blacklist = $data;
    }
    $filtered = array_values(array_filter($blacklist, fn($d) => $d !== $domain));
    file_put_contents(BLACKLIST_FILE, json_encode($filtered, JSON_PRETTY_PRINT));
    echo json_encode(['ok' => true]);
}

function handle_report(string $date): void {
    $path = safe_path($date);
    if ($path === null || !file_exists($path)) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }
    // Return raw markdown — JS in index.html parses it
    header('Content-Type: text/plain; charset=utf-8');
    readfile($path);
}

function handle_feedback(): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        return;
    }

    $date      = $body['date']      ?? null;
    $lineIndex = $body['lineIndex'] ?? null;
    $vote      = $body['vote']      ?? null;

    if (!is_string($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        http_response_code(400); echo json_encode(['error' => 'Invalid date']); return;
    }
    if (!is_numeric($lineIndex) || (int)$lineIndex < 0) {
        http_response_code(400); echo json_encode(['error' => 'Invalid lineIndex']); return;
    }
    if (!in_array((int)$vote, [1, -1, 0], true)) {
        http_response_code(400); echo json_encode(['error' => 'Invalid vote']); return;
    }

    $lineIndex = (int)$lineIndex;
    $vote      = (int)$vote;

    $filePath = safe_path($date);
    if ($filePath === null || !file_exists($filePath)) {
        http_response_code(404); echo json_encode(['error' => 'Report not found']); return;
    }

    // Exclusive lock, read, mutate, write back
    $fp = fopen($filePath, 'r+');
    if (!$fp) {
        http_response_code(500); echo json_encode(['error' => 'Cannot open file']); return;
    }

    flock($fp, LOCK_EX);
    $content = stream_get_contents($fp);
    $lines   = explode("\n", $content);

    if ($lineIndex >= count($lines)) {
        flock($fp, LOCK_UN); fclose($fp);
        http_response_code(400); echo json_encode(['error' => 'lineIndex out of bounds']); return;
    }

    $line = preg_replace('/ [+-]1$/', '', $lines[$lineIndex]);
    if ($vote === 1)       $line .= ' +1';
    elseif ($vote === -1)  $line .= ' -1';
    $lines[$lineIndex] = $line;

    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, implode("\n", $lines));
    flock($fp, LOCK_UN);
    fclose($fp);

    echo json_encode(['ok' => true]);
}

function handle_delete(string $date): void {
    $path = safe_path($date);
    if ($path === null || !file_exists($path)) {
        http_response_code(404); echo json_encode(['error' => 'Not found']); return;
    }
    unlink($path);
    echo json_encode(['ok' => true]);
}

function handle_delete_all(): void {
    if (!REPORTS_DIR || !is_dir(REPORTS_DIR)) { echo json_encode(['ok' => true]); return; }
    foreach (glob(REPORTS_DIR . '/*.md') as $f) {
        $base = basename($f, '.md');
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $base)) unlink($f);
    }
    echo json_encode(['ok' => true]);
}

// ── Security ────────────────────────────────────────────────────────────────

function safe_path(string $date): ?string {
    if (!REPORTS_DIR) return null;
    // Only allow YYYY-MM-DD pattern (already validated by caller, belt+suspenders)
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) return null;
    $candidate = REPORTS_DIR . DIRECTORY_SEPARATOR . $date . '.md';
    // Ensure resolved parent directory matches REPORTS_DIR
    $parent = realpath(dirname($candidate));
    if ($parent === false || $parent !== REPORTS_DIR) return null;
    return $candidate;
}
