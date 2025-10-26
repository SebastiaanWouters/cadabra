<?php

use Symfony\Component\Dotenv\Dotenv;
use Symfony\Component\Filesystem\Filesystem;

require dirname(__DIR__).'/vendor/autoload.php';

// Ensure var directory is writable for tests
$filesystem = new Filesystem();
$varDir = dirname(__DIR__).'/var';
if (!$filesystem->exists($varDir) || !is_writable($varDir)) {
    // Use a temporary directory if var is not writable
    $tmpVarDir = sys_get_temp_dir().'/symfony-test-app-'.md5(__DIR__);
    $filesystem->mkdir($tmpVarDir);
    $_SERVER['APP_CACHE_DIR'] = $tmpVarDir.'/cache';
    $_SERVER['APP_LOG_DIR'] = $tmpVarDir.'/log';
} else {
    $filesystem->mkdir([$varDir.'/cache', $varDir.'/log']);
}

if (file_exists(dirname(__DIR__).'/config/bootstrap.php')) {
    require dirname(__DIR__).'/config/bootstrap.php';
} elseif (method_exists(Dotenv::class, 'bootEnv')) {
    (new Dotenv())->bootEnv(dirname(__DIR__).'/.env');
}

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}
