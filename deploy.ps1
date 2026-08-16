# MIMO 部署脚本 - 部署到远程服务器
param(
    [Parameter(Mandatory=$true)]
    [string]$SERVER,
    [string]$PASSWORD = "",
    [string]$HOSTKEY = ""
)
$USER = "root"
# 注意: 线上 nginx 与 pm2 实际指向 /var/www/shuangchenyue-v2（v1 为旧部署，勿再覆盖）
$REMOTE_DIR = "/var/www/shuangchenyue-v2"

# 使用 pscp/plink（支持密码参数）
$PUTTY_DIR = "C:\Program Files\PuTTY"
$SCP = Join-Path $PUTTY_DIR "pscp.exe"
$SSH = Join-Path $PUTTY_DIR "plink.exe"
$PASS_ARGS = @()
if ($PASSWORD) {
    $PASS_ARGS = @("-pw", $PASSWORD)
}
if ($HOSTKEY) {
    $PASS_ARGS += @("-hostkey", $HOSTKEY, "-batch")
}

Write-Host "=== MIMO 项目部署脚本 ===" -ForegroundColor Cyan
Write-Host "目标服务器: $USER@$SERVER" -ForegroundColor Yellow

# Step 1: 确保构建是最新的
Write-Host "`n[1/6] 构建项目..." -ForegroundColor Green
Write-Host "  构建共享类型包..." -ForegroundColor Yellow
Push-Location shared; npm run build; Pop-Location
Write-Host "  构建服务端..." -ForegroundColor Yellow
Push-Location server; npm run build; Pop-Location
Write-Host "  构建客户端..." -ForegroundColor Yellow
Push-Location client; npm run build; Pop-Location
Write-Host "  构建完成 ✓" -ForegroundColor Green

# Step 2: 创建临时打包目录
Write-Host "`n[2/6] 打包项目文件..." -ForegroundColor Green
$deployPkg = "mimo-deploy.tar.gz"

# 创建临时目录结构
$tmpDir = "$env:TEMP\mimo-deploy"
if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
New-Item -ItemType Directory -Path "$tmpDir\server" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmpDir\client" -Force | Out-Null
New-Item -ItemType Directory -Path "$tmpDir\shared" -Force | Out-Null

# 复制服务端文件（node_modules 在服务器上重新安装，避免原生模块不兼容）
Copy-Item -Recurse "server\dist" "$tmpDir\server\dist"
Copy-Item "server\package.json" "$tmpDir\server\"
Copy-Item "server\ecosystem.config.js" "$tmpDir\server\"
Copy-Item "server\package-lock.json" "$tmpDir\server\" -ErrorAction SilentlyContinue

# 复制共享类型包（服务端依赖 file:../shared，服务器安装时需要同目录结构）
Copy-Item -Recurse "shared\dist" "$tmpDir\shared\dist"
Copy-Item "shared\package.json" "$tmpDir\shared\"

# 复制客户端构建产物
Copy-Item -Recurse "client\dist" "$tmpDir\client\dist"

# 复制客户端 public 目录（音乐源文件在 public/music，服务端 /api/music 扫描此目录；
# 缺失会导致音乐列表为空、播放器组件不显示）
Copy-Item -Recurse "client\public" "$tmpDir\client\public"

# 复制根目录配置
Copy-Item ".env" "$tmpDir\"
Copy-Item "package.json" "$tmpDir\"

# 复制uploads目录（如果存在）
if (Test-Path "server\uploads") {
    Copy-Item -Recurse "server\uploads" "$tmpDir\server\uploads"
}

# 复制图书数据目录（server/books，含所有图书文本）
if (Test-Path "server\books") {
    Copy-Item -Recurse "server\books" "$tmpDir\server\books"
}

Write-Host "  文件打包完成 ✓" -ForegroundColor Green

# Step 3: 压缩
Write-Host "`n[3/6] 压缩部署包..." -ForegroundColor Green
# 使用 tar (Windows 10自带)
Push-Location $env:TEMP
tar -czf "$deployPkg" -C $tmpDir .
Pop-Location
$pkgPath = "$env:TEMP\$deployPkg"
$pkgSize = (Get-Item $pkgPath).Length / 1MB
Write-Host "  部署包大小: $([math]::Round($pkgSize, 1)) MB ✓" -ForegroundColor Green

# Step 4: 上传到服务器
Write-Host "`n[4/6] 上传到服务器..." -ForegroundColor Green
"y" | & $SCP -r @PASS_ARGS "$pkgPath" "${USER}@${SERVER}:/tmp/mimo-deploy.tar.gz" 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "  上传失败! 请检查密码和网络连接" -ForegroundColor Red
    exit 1
}
Write-Host "  上传完成 ✓" -ForegroundColor Green

# Step 5: 服务器端部署
Write-Host "`n[5/6] 部署到服务器..." -ForegroundColor Green
$remoteScript = @"
set -e
echo '--- 创建部署目录...'
mkdir -p $REMOTE_DIR
cd $REMOTE_DIR

echo '--- 解压部署包...'
tar -xzf /tmp/mimo-deploy.tar.gz
rm /tmp/mimo-deploy.tar.gz

echo '--- 检查 Node.js...'
if ! command -v node &> /dev/null; then
    echo '安装 Node.js...'
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
node -v

echo '--- 检查 ffmpeg...'
if ! command -v ffmpeg &> /dev/null; then
    echo '安装 ffmpeg（视频转码用）...'
    apt-get update -qq
    apt-get install -y ffmpeg
fi
ffmpeg -version | head -1

echo '--- 安装 PM2...'
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo '--- 安装依赖...'
cd server
npm install --omit=dev

echo '--- 停止旧进程...'
pm2 delete shuangchenyue-server 2>/dev/null || true

echo '--- 启动服务...'
pm2 start ecosystem.config.js

echo '--- 保存 PM2 进程列表...'
pm2 save
pm2 startup 2>/dev/null || true

echo '--- 部署完成!'
pm2 status
"@

"y" | & $SSH @PASS_ARGS "${USER}@${SERVER}" $remoteScript 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "  服务端部署失败!" -ForegroundColor Red
    exit 1
}
Write-Host "  服务端部署完成 ✓" -ForegroundColor Green

# Step 6: 验证
Write-Host "`n[6/6] 验证服务..." -ForegroundColor Green
Start-Sleep -Seconds 3
try {
    $response = Invoke-WebRequest -Uri "http://$SERVER`:3000/api/health" -TimeoutSec 10 -UseBasicParsing
    Write-Host "  服务状态: $($response.StatusCode) ✓" -ForegroundColor Green
    Write-Host "  API 响应: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "  健康检查失败，尝试访问首页..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://$SERVER`:3000" -TimeoutSec 10 -UseBasicParsing
        Write-Host "  首页状态: $($response.StatusCode) ✓" -ForegroundColor Green
    } catch {
        Write-Host "  服务可能需要几秒钟启动，请稍后访问 http://$SERVER`:3000" -ForegroundColor Yellow
    }
}

Write-Host "`n=== 部署完成! ===" -ForegroundColor Cyan
Write-Host "访问地址: http://$SERVER`:3000" -ForegroundColor Green
Write-Host "管理后台: http://$SERVER`:3000 (使用管理员账号登录)" -ForegroundColor Green

# 清理临时文件
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
Remove-Item -Force $pkgPath -ErrorAction SilentlyContinue