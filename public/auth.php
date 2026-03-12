<?php
declare(strict_types=1);

session_set_cookie_params(['lifetime' => 86400 * 30, 'samesite' => 'Lax', 'secure' => true]);
session_start();
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

// ── Logout ───────────────────────────────────────────────────────────
if ($action === 'logout') {
    session_destroy();
    header('Location: auth.php?action=login');
    exit;
}

// ── Initiate login ───────────────────────────────────────────────────
if ($action === 'login') {
    $state = bin2hex(random_bytes(16));
    $_SESSION['oauth_state'] = $state;

    $params = http_build_query([
        'client_id'     => GOOGLE_CLIENT_ID,
        'redirect_uri'  => REDIRECT_URI,
        'response_type' => 'code',
        'scope'         => 'email',
        'state'         => $state,
        'access_type'   => 'online',
    ]);
    header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $params);
    exit;
}

// ── OAuth callback ───────────────────────────────────────────────────
$code  = $_GET['code']  ?? null;
$state = $_GET['state'] ?? null;

if (!$code || !$state || $state !== ($_SESSION['oauth_state'] ?? '')) {
    http_response_code(400);
    die('Invalid OAuth state.');
}
unset($_SESSION['oauth_state']);

$token = httpPost('https://oauth2.googleapis.com/token', [
    'code'          => $code,
    'client_id'     => GOOGLE_CLIENT_ID,
    'client_secret' => GOOGLE_CLIENT_SECRET,
    'redirect_uri'  => REDIRECT_URI,
    'grant_type'    => 'authorization_code',
]);

if (empty($token['access_token'])) {
    http_response_code(502);
    die('Failed to obtain access token.');
}

$userInfo = httpGet('https://www.googleapis.com/oauth2/v2/userinfo', $token['access_token']);
$email    = $userInfo['email'] ?? null;

if ($email !== ALLOWED_EMAIL) {
    http_response_code(403);
    die('Access denied.');
}

$_SESSION['user_email'] = $email;
header('Location: index.php');
exit;

// ── Helpers ──────────────────────────────────────────────────────────
function httpPost(string $url, array $data): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($data),
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode((string)$result, true) ?? [];
}

function httpGet(string $url, string $accessToken): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ["Authorization: Bearer $accessToken"],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode((string)$result, true) ?? [];
}
